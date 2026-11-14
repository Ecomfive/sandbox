// Ejecución de las tareas programadas (migración 0921). Cada ejecución queda en `fin_tareas_ejecuciones` (inicio, fin, ok,
// resumen, error). Todas son idempotentes: correrlas dos veces deja lo mismo. Las largas trabajan con un presupuesto de
// tiempo y guardan lo que les faltó (`pendiente`); la siguiente ejecución del mismo día sigue de ahí (por eso la
// conciliación tiene dos horarios). Las llaman las rutas de `/api/cron/*` (con el secreto de Vercel) y el botón «Correr
// ahora» de /panel-financiero/tareas (quien puede modificar Usuarios y roles).

import { cargarProyeccion, guardarFotoSiFalta, minimoProyectado } from "@/lib/finanzas/cargar-proyeccion";
import { armarProyeccion } from "@/lib/finanzas/proyeccion-caja";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recalcularCuentaMes } from "../conciliacion/guardar";
import { efectivoPorRepartidor, sincronizarTransportistas } from "../deliverys/efectivo";
import { inicioSemana, sumarDias } from "../deliverys/liquidacion";
import { cargarDatosMeses } from "../finanzas/cargar-cierre";
import { combinarTareas, evaluarTareas, finDeMes, mesAnterior, nombreMes, type MarcaTarea } from "../finanzas/cierre";
import { avisarTareasCierre, generarAlertasFiscales } from "../finanzas/avisos-cierre";
import { cargarConfigCierre } from "../finanzas/cargar-cierre-control";
import { traerTodasConError } from "../supabase/paginar";
import { alertasTesoreriaANuevas, DEF_ALERTA, generarAlertas, guardarAlertas, type AlertaNueva, type TipoAlerta } from "./alertas";
import { cargarBasePauta } from "../finanzas/cargar-comite";
import { evaluarYGuardarRiesgos } from "../finanzas/cargar-riesgos";
import { alertasPauta, mesPrevio } from "../finanzas/pauta";
import { alertasDePosicion, cargarPosicion } from "../finanzas/cargar-tesoreria";
import { cargarBaseCovenants, cargarBaseDeuda, cargarCovenants, cargarOfertas } from "../finanzas/cargar-deuda-avanzada";
import { alertaCovenant, contratosCovenant, evaluarCovenants, nombreContrato } from "../finanzas/escenarios-deuda";
import { dinero, veces } from "../af4/formato";
import { mesLargo } from "../af4/fecha";
import { enviarInformeCorreo, enviarResumenSemanal } from "../finanzas/cargar-informe-envio";
import { DIA_INFORME, mesAInformar } from "../finanzas/informe-envio";
import { respaldarFinanzas } from "../finanzas/respaldar-finanzas";
import { sincronizarShopify } from "../finanzas/sincronizar-shopify";
import { sincronizarQuickbooks } from "../quickbooks/cliente";
import { enlazarSinPedido, sincronizarMonday } from "../monday/sincronizar";
import { sincronizarTablerosExtra } from "../monday/tableros-extra";
import { sincronizarPostventa } from "../monday/postventa";
import { actualizarEntregas, completarDatosEntrega } from "../tienda/actualizar-entregas";
import { CORRIENDO_MS, PRESUPUESTO_MS, hoyPanama, mesesAbiertos, pendienteDeHoy, resumenCorto, type ClaveTarea } from "./definiciones";

export interface Contexto {
  supabase: SupabaseClient;
  hoy: string;
  /** Momento (ms) en que hay que dejar de empezar trabajo nuevo. */
  limite: number;
  /** Lo que dejó por hacer la ejecución anterior de hoy (o null). */
  pendiente: unknown;
  disparo: "cron" | "manual";
  usuarioId: string | null;
}

export interface Resultado {
  resumen: string;
  /** Lo que faltó por tiempo; null = terminó. */
  pendiente?: unknown;
}

const usd = (v: number) => `US$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------------------------
// (a) Sugerencias de conciliación de los últimos 2 meses abiertos
// ---------------------------------------------------------------------------------------------
async function cerrados(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase.from("fin_cierres").select("periodo").eq("estado", "cerrado");
  return new Set(error ? [] : (data ?? []).map((c) => String(c.periodo).slice(0, 10)));
}

async function tareaConciliacion(c: Contexto): Promise<Resultado> {
  let trabajo = Array.isArray(c.pendiente) ? (c.pendiente as unknown[]).filter((x): x is string => typeof x === "string" && /^[0-9a-f-]{36}\|\d{4}-\d{2}-01$/.test(x)) : null;
  if (!trabajo) {
    const meses = mesesAbiertos(`${c.hoy.slice(0, 7)}-01`, await cerrados(c.supabase));
    if (!meses.length) return { resumen: "No hay meses abiertos." };
    const desde = meses[meses.length - 1];
    const hasta = finDeMes(meses[0]);
    const lineas = await traerTodasConError<{ cuenta_id: string; fecha: string }>((a, b) =>
      c.supabase.from("conc_lineas").select("cuenta_id, fecha").gte("fecha", desde).lte("fecha", hasta).in("estado", ["pendiente", "sugerida"]).order("id").range(a, b),
    );
    if (lineas.error) throw new Error("Falta correr la migración 0910 (conciliación bancaria) en Supabase.");
    trabajo = [...new Set((lineas.data ?? []).map((l) => `${l.cuenta_id}|${String(l.fecha).slice(0, 7)}-01`))].sort();
    if (!trabajo.length) return { resumen: `Sin líneas por conciliar en ${meses.map(nombreMes).join(" y ")}.` };
  }
  let hechos = 0;
  let auto = 0;
  let sugeridas = 0;
  let pendientes = 0;
  // Siempre avanza al menos una cuenta-mes, aunque el tiempo ya esté justo: así nunca se queda dando vueltas.
  do {
    const [cuenta, mes] = trabajo[0].split("|");
    const r = await recalcularCuentaMes(c.supabase, cuenta, mes);
    auto += r.auto;
    sugeridas += r.sugeridas;
    pendientes += r.pendientes;
    hechos++;
    trabajo = trabajo.slice(1);
  } while (trabajo.length && Date.now() < c.limite);
  const texto = `${hechos} cuenta-mes recalculados: ${auto} conciliadas solas, ${sugeridas} con sugerencia, ${pendientes} sin pareja`;
  return trabajo.length ? { resumen: `${texto}. Faltan ${trabajo.length} (sigue en la próxima ejecución).`, pendiente: trabajo } : { resumen: `${texto}.` };
}

// ---------------------------------------------------------------------------------------------
// (b) Checklist del cierre del mes anterior y del actual
// ---------------------------------------------------------------------------------------------
async function tareaCierre(c: Contexto): Promise<Resultado> {
  const actual = `${c.hoy.slice(0, 7)}-01`;
  const meses = [mesAnterior(actual), actual];
  const { data: cierres, error } = await c.supabase.from("fin_cierres").select("id, periodo, estado").in("periodo", meses);
  if (error) throw new Error("Falta correr la migración 0914 (cierre de mes) en Supabase.");
  const abiertos = meses.filter((m) => (cierres ?? []).find((x) => String(x.periodo).slice(0, 10) === m)?.estado !== "cerrado");
  if (!abiertos.length) return { resumen: "Los dos meses están cerrados: no se tocan." };
  const [datos, { config }] = await Promise.all([cargarDatosMeses(c.supabase, abiertos), cargarConfigCierre(c.supabase)]);
  const partes: string[] = [];
  for (const m of abiertos) {
    // Crea el cierre abierto si no existía (como al entrar a su página).
    const creado = await c.supabase.from("fin_cierres").upsert({ periodo: m }, { onConflict: "periodo", ignoreDuplicates: true });
    if (creado.error) throw new Error(creado.error.message);
    const { data: cierre } = await c.supabase.from("fin_cierres").select("id, estado").eq("periodo", m).single();
    if (!cierre || cierre.estado === "cerrado") continue;
    const { data: marcas } = await c.supabase.from("fin_cierre_tareas").select("clave, estado, a_mano, comentario").eq("cierre_id", cierre.id);
    const tareas = combinarTareas(
      evaluarTareas(m, datos.get(m)!),
      (marcas ?? []).map((x) => ({ clave: x.clave, estado: x.estado, aMano: x.a_mano, comentario: x.comentario }) as MarcaTarea),
    );
    const ahora = new Date().toISOString();
    // Lo marcado a mano no se pisa (mismo criterio que la página de Cierre de mes).
    const { error: e } = await c.supabase.from("fin_cierre_tareas").upsert(
      tareas.map((t) => ({
        cierre_id: cierre.id,
        clave: t.clave,
        titulo: t.titulo,
        estado: t.estado,
        a_mano: t.aMano,
        automatico: t.resultado,
        detalle: t.detalle.slice(0, 500),
        evaluado_en: ahora,
        ...(t.aMano ? {} : { comentario: t.comentario }),
      })),
      { onConflict: "cierre_id,clave" },
    );
    if (e) throw new Error(e.message);
    const listas = tareas.filter((t) => t.color === "verde").length;
    // Tareas atrasadas y avisos a sus responsables (migración 0927).
    const av = await avisarTareasCierre(c.supabase, { id: cierre.id, periodo: m }, tareas, c.hoy, config);
    partes.push(`${nombreMes(m)}: ${listas} de ${tareas.length} en verde${av.atrasadas ? `, ${av.atrasadas} atrasadas` : ""}${av.avisos ? `, ${av.avisos} avisos` : ""}`);
  }
  return { resumen: partes.join(" · ") || "Nada que evaluar." };
}

// ---------------------------------------------------------------------------------------------
// (c) Efectivo de repartidores de la semana
// ---------------------------------------------------------------------------------------------
async function tareaEfectivo(c: Contexto): Promise<Resultado> {
  const s = await sincronizarTransportistas(c.supabase);
  if ("error" in s) throw new Error(s.error);
  const semana = inicioSemana(c.hoy);
  const anterior = sumarDias(semana, -7);
  const porRep = await efectivoPorRepartidor(c.supabase, anterior, semana);
  if ("error" in porRep) throw new Error(porRep.error);
  const total = porRep.reduce((a, r) => a + r.efectivo, 0);
  const sin = s.sinRepartidor.length ? ` Sin repartidor: ${s.sinRepartidor.map((x) => `${x.transportista} (${usd(x.efectivo)})`).join(", ")}.` : "";
  return {
    resumen: `${s.transportistas} transportistas, ${s.cambios} unidos hoy. Efectivo de las semanas del ${anterior} y ${semana}: ${usd(total)} de ${porRep.length} repartidores.${sin}`,
  };
}

// ---------------------------------------------------------------------------------------------
// (d) Foto semanal de la proyección de caja (si Proyección de caja existe)
// ---------------------------------------------------------------------------------------------
async function tareaProyeccion(c: Contexto): Promise<Resultado> {
  const tabla = await c.supabase.from("fin_proyeccion_fotos").select("*", { count: "exact", head: true });
  if (tabla.error) return { resumen: "No disponible: todavía no existe la proyección de caja (tabla fin_proyeccion_fotos)." };
  const datos = await cargarProyeccion(c.supabase, c.hoy);
  if ("error" in datos) return { resumen: `No disponible: ${datos.error}` };
  const base = armarProyeccion(datos.lineas, datos.semanas, datos.cajaHoy);
  await guardarFotoSiFalta(c.supabase, base, null);
  const minimo = minimoProyectado(base);
  return {
    resumen: `Foto de la semana del ${datos.semanas[0]} guardada (si no había una).${minimo ? ` Caja mínima proyectada: ${usd(minimo.saldo)} la semana del ${minimo.semana}.` : ""}`,
  };
}

// ---------------------------------------------------------------------------------------------
// (e) Alertas
// ---------------------------------------------------------------------------------------------
async function tareaAlertas(c: Contexto): Promise<Resultado> {
  const r = await generarAlertas(c.supabase, c.hoy);
  if ("error" in r) throw new Error(r.error);
  // Calendario fiscal (migración 0928): sin la migración solo se anota.
  const f = await generarAlertasFiscales(c.supabase, c.hoy);
  const fiscal = "error" in f ? " Calendario fiscal: sin la migración 0928." : ` Calendario fiscal: ${f.activas} por vencer o vencidas.`;
  // Tesorería (migración 0939): las mismas alertas que mostraba su página, guardadas una vez al día.
  const t = await generarAlertasTesoreria(c.supabase, c.hoy);
  const tes = "error" in t ? ` Tesorería: ${t.error}` : ` Tesorería: ${t.activas} activas, ${t.resueltas} resueltas.`;
  // Techo de pauta por tienda (migraciones 0942 y 0943).
  const p = await generarAlertasPauta(c.supabase, c.hoy);
  const pau = "error" in p ? ` Pauta: ${p.error}` : ` Pauta: ${p.activas} tiendas sobre el techo, ${p.resueltas} resueltas.`;
  // Covenants (migraciones 0946 y 0947).
  const cv = await generarAlertasCovenants(c.supabase, c.hoy);
  const cov = "error" in cv ? ` Covenants: ${cv.error}` : ` Covenants: ${cv.activas} en alerta, ${cv.resueltas} resueltas.`;
  // Matriz de riesgos (migración 0948): guarda los cambios de nivel y las alertas de los que subieron.
  const rg = await evaluarYGuardarRiesgos(c.supabase, c.hoy);
  const rie = "error" in rg ? ` Riesgos: ${rg.error}` : ` Riesgos: ${rg.cambios} cambios de nivel, ${rg.alertas} alertas.`;
  return { resumen: `${r.activas} alertas activas (${r.nuevas} nuevas), ${r.resueltas} resueltas. Evaluado: ${r.evaluados.join(", ") || "nada"}.${fiscal}${tes}${pau}${cov}${rie}` };
}

/**
 * Los covenants activos (no los de ofertas) evaluados con el último cierre y la proyección de 6 meses a `fin_alertas`:
 * incumplido hoy = crítica, incumpliría en 6 meses = aviso, a menos del 10 % del umbral = info. Sin la migración 0946 o
 * sin balance no se evalúa (no se resuelve nada).
 */
export async function generarAlertasCovenants(supabase: SupabaseClient, hoy: string): Promise<{ error: string } | { activas: number; resueltas: number }> {
  const [base, covenantsR, ofertasR] = await Promise.all([cargarBaseDeuda(supabase, hoy), cargarCovenants(supabase), cargarOfertas(supabase)]);
  if (!base || covenantsR.sinMigracion) return { error: "falta correr la migración 0946." };
  const activos = covenantsR.covenants.filter((x) => x.ambito !== "oferta");
  let nuevas: AlertaNueva[] = [];
  if (activos.length) {
    const baseCov = await cargarBaseCovenants(supabase, hoy);
    if ("error" in baseCov) return { error: baseCov.error };
    const contratos = contratosCovenant(base.deuda, ofertasR.ofertas);
    const fmt = (v: number | null, f: "veces" | "dinero") => (v === null ? "—" : f === "veces" ? veces(v, 2) : dinero(v));
    nuevas = evaluarCovenants(activos, baseCov.meses, base.instrumentos, ofertasR.ofertas, hoy)
      .map((e) => alertaCovenant(e, nombreContrato(e.covenant, contratos), fmt, (f) => mesLargo(`${f.slice(0, 7)}-01`)))
      .filter((a): a is NonNullable<typeof a> => a !== null)
      .map((a) => ({ clave: a.clave, tipo: "tesoreria_covenant", severidad: a.severidad, mensaje: a.mensaje.slice(0, 500), enlace: DEF_ALERTA.tesoreria_covenant.href, modulo: DEF_ALERTA.tesoreria_covenant.modulo, monto: null }));
  }
  const r = await guardarAlertas(supabase, nuevas, ["tesoreria_covenant"]);
  if ("error" in r) return { error: /check|tipo/i.test(r.error) ? "falta correr la migración 0947." : r.error };
  return { activas: r.activas, resueltas: r.resueltas };
}

/**
 * Las tiendas propias sobre su techo de pauta (último mes cerrado y mes en curso proyectado) a `fin_alertas`. El monto es la
 * pauta excedente del mes. Sin la migración 0942 no se evalúa (no se resuelve nada).
 */
export async function generarAlertasPauta(supabase: SupabaseClient, hoy: string): Promise<{ error: string } | { activas: number; resueltas: number }> {
  const enCurso = `${hoy.slice(0, 7)}-01`;
  const base = await cargarBasePauta(supabase, mesPrevio(enCurso), enCurso, hoy);
  if ("error" in base) return { error: "falta correr la migración 0942." };
  const nuevas: AlertaNueva[] = alertasPauta(base.filas, base.propias, base.techo, hoy, base.nombre).map((a) => ({
    clave: a.clave,
    tipo: "pauta_techo",
    severidad: a.severidad,
    mensaje: a.mensaje.slice(0, 500),
    enlace: DEF_ALERTA.pauta_techo.href,
    modulo: DEF_ALERTA.pauta_techo.modulo,
    monto: a.monto,
  }));
  const r = await guardarAlertas(supabase, nuevas, ["pauta_techo"]);
  if ("error" in r) return { error: /check|tipo/i.test(r.error) ? "falta correr la migración 0943." : r.error };
  return { activas: r.activas, resueltas: r.resueltas };
}

/** Las alertas de Tesorería del día a `fin_alertas` (solo los tipos cuya fuente se pudo leer se resuelven). */
export async function generarAlertasTesoreria(supabase: SupabaseClient, hoy: string): Promise<{ error: string } | { activas: number; resueltas: number }> {
  const v = await cargarPosicion(supabase, hoy);
  const evaluados: TipoAlerta[] = ["tesoreria_saldos", "tesoreria_pagos"];
  if (v.dropi) evaluados.push("tesoreria_dropi");
  if (v.depositos) evaluados.push("tesoreria_efectivo", "tesoreria_depositos");
  if (v.deuda) evaluados.push("tesoreria_linea_vencida", "tesoreria_linea_renovar", "tesoreria_linea_uso");
  const r = await guardarAlertas(supabase, alertasTesoreriaANuevas(alertasDePosicion(v)), evaluados);
  if ("error" in r) return { error: /check|tipo/i.test(r.error) ? "falta correr la migración 0939." : r.error };
  return { activas: r.activas, resueltas: r.resueltas };
}

// ---------------------------------------------------------------------------------------------
// (f) Informe mensual por correo (el día 5) y resumen semanal por WhatsApp
// ---------------------------------------------------------------------------------------------
async function tareaInformeMensual(c: Contexto): Promise<Resultado> {
  const mes = mesAInformar(c.hoy);
  // Una sola vez por mes desde el cron (si Netlify llega dos veces, la segunda no repite).
  const { data: previos, error } = await c.supabase.from("fin_informes_envios").select("id").eq("canal", "correo").eq("periodo", mes).eq("ok", true).limit(1);
  if (error) throw new Error("Falta correr la migración 0937 (reportes y comunicación) en Supabase.");
  if (previos?.length && c.disparo === "cron") return { resumen: `El informe de ${nombreMes(mes)} ya se envió.` };
  if (c.disparo === "cron" && Number(c.hoy.slice(8, 10)) !== DIA_INFORME) return { resumen: `Se envía el día ${DIA_INFORME}.` };
  const r = await enviarInformeCorreo(c.supabase, { disparo: c.disparo, mes, usuarioId: c.usuarioId });
  if (!r.ok) throw new Error(r.resumen);
  return { resumen: r.resumen };
}

async function tareaResumenSemanal(c: Contexto): Promise<Resultado> {
  const r = await enviarResumenSemanal(c.supabase, { disparo: c.disparo, usuarioId: c.usuarioId });
  if (!r.ok) throw new Error(r.resumen);
  return { resumen: r.resumen };
}

// ---------------------------------------------------------------------------------------------
// (g) Dropi y Shopify al portal financiero
// ---------------------------------------------------------------------------------------------
async function tareaDropi(c: Contexto): Promise<Resultado> {
  const { data, error } = await c.supabase.rpc("fin_sincronizar_dropi");
  if (error) throw new Error(/fin_sincronizar_dropi/.test(error.message) ? "Falta correr la migración 0938 (Dropi al portal financiero) en Supabase." : error.message);
  const f = (Array.isArray(data) ? data[0] : data) as { meses?: number; paises?: number; documentos?: number } | null;
  // Las tiendas entran junto con la proveeduría: si falta la migración 0962 solo se avisa en el resumen.
  const t = await c.supabase.rpc("fin_sincronizar_tiendas");
  const ft = (Array.isArray(t.data) ? t.data[0] : t.data) as { meses?: number; documentos?: number } | null;
  const tiendas = t.error
    ? /fin_sincronizar_tiendas/.test(t.error.message) ? "Tiendas: falta correr la migración 0962." : `Tiendas: ${t.error.message}`
    : `${ft?.meses ?? 0} meses-tienda al día; ${ft?.documentos ?? 0} saldos de efectivo contra entrega en Cuentas por cobrar.`;
  // Las ventas entregadas de Shopify pasan al libro como Ingresos (EERR por canal); sin la migración 0964 solo se avisa.
  const g = await c.supabase.rpc("fin_ingresos_desde_ordenes");
  const fg = (Array.isArray(g.data) ? g.data[0] : g.data) as { asentados?: number; omitidos?: number; retirados?: number } | null;
  const ingresos = g.error
    ? /fin_ingresos_desde_ordenes/.test(g.error.message) ? "Ingresos de Shopify: falta correr la migración 0964." : `Ingresos de Shopify: ${g.error.message}`
    : `${fg?.asentados ?? 0} ingresos de tienda asentados en el libro (${fg?.omitidos ?? 0} meses ya traían ingresos del Excel).`;
  // El costo de lo entregado en Shopify, junto a sus ingresos (0967); sin la migración solo se avisa.
  const k = await c.supabase.rpc("fin_costos_desde_ordenes");
  const fk = (Array.isArray(k.data) ? k.data[0] : k.data) as { asentados?: number; omitidos?: number } | null;
  const costos = k.error
    ? /fin_costos_desde_ordenes/.test(k.error.message) ? "Costo de Shopify: falta correr la migración 0967." : `Costo de Shopify: ${k.error.message}`
    : `${fk?.asentados ?? 0} costos de tienda asentados (${fk?.omitidos ?? 0} meses ya traían costo del Excel).`;
  // Clientes de fulfillment (Clicksi): tarifa por orden como ingreso y por cobrar, y su efectivo como por pagar (0966).
  const ff = await c.supabase.rpc("fin_sincronizar_fulfillment");
  const fff = (Array.isArray(ff.data) ? ff.data[0] : ff.data) as { ingresos?: number; por_cobrar?: number; por_pagar?: number } | null;
  const fulfillment = ff.error
    ? /fin_sincronizar_fulfillment|cliente_fulfillment/.test(ff.error.message) ? "Fulfillment: falta correr las migraciones 0965 y 0966." : `Fulfillment: ${ff.error.message}`
    : `Fulfillment: ${fff?.por_cobrar ?? 0} meses por cobrar, ${fff?.por_pagar ?? 0} de efectivo por remitir.`;
  return { resumen: `${f?.meses ?? 0} meses-país de Dropi al día; ${f?.documentos ?? 0} saldos de billetera en Cuentas por cobrar. ${tiendas} ${ingresos} ${costos} ${fulfillment}` };
}

async function tareaShopify(c: Contexto): Promise<Resultado> {
  const r = await sincronizarShopify(c.supabase, c.limite);
  return { resumen: r.resumen, pendiente: r.pendiente ? true : null };
}

async function tareaQuickbooks(c: Contexto): Promise<Resultado> {
  return sincronizarQuickbooks(c.supabase, c.hoy, c.limite);
}

async function tareaMonday(c: Contexto): Promise<Resultado> {
  const r = await sincronizarMonday(c.supabase, c.limite, c.pendiente);
  if (r.pendiente) return { resumen: r.resumen, pendiente: r.pendiente };
  // Terminado el consolidado: los tableros de cada repartidor (migración 0282) y, con todo leído, los pedidos de tienda que Monday o Servientrega ya
  // dan por entregados o devueltos pasan a esa fase (12 nov 2026, pedido de Hernán). Si algo de esto falla, la lectura del consolidado ya quedó.
  const extra = await sincronizarTablerosExtra(c.supabase, c.limite).catch((e) => `Tableros de repartidores: ${e instanceof Error ? e.message : "falló"}.`);
  // Los cambios, reembolsos, retiros y complementos (tablero «CAMBIOS Y REEMBOLSOS», migración 0290; 14 nov 2026).
  const postventa = await sincronizarPostventa(c.supabase, c.limite).catch((e) => `Cambios y reembolsos: ${e instanceof Error ? e.message : "falló"}.`);
  // Las filas de Monday que se guardaron antes de que su pedido entrara al sistema (14 nov 2026): se vuelven a enlazar antes de asignar entregas.
  const reenlazadas = await enlazarSinPedido(c.supabase).catch(() => 0);
  const entregas = await actualizarEntregas(c.supabase, "Monday (tarea diaria)", Math.max(c.limite, Date.now() + 8_000)).then((x) => x.resumen).catch((e) => `Entregas: ${e instanceof Error ? e.message : "falló"}.`);
  const enlazadas = reenlazadas ? `${reenlazadas} filas de Monday encontraron su pedido.` : "";
  // La forma de pago, lo cobrado y la fecha de despacho que Monday o Servientrega saben y el pedido no tiene (14 nov 2026).
  const completados = await completarDatosEntrega(c.supabase, Math.max(c.limite, Date.now() + 5_000)).catch(() => 0);
  const datos = completados ? `${completados} pedidos completaron su forma de pago o su fecha de despacho.` : "";
  return { resumen: [r.resumen, extra, postventa, enlazadas, entregas, datos].filter(Boolean).join(" "), pendiente: null };
}

// ---------------------------------------------------------------------------------------------
// (h) Respaldo semanal
// ---------------------------------------------------------------------------------------------
async function tareaRespaldo(c: Contexto): Promise<Resultado> {
  return respaldarFinanzas(c.supabase, { hoy: c.hoy, limite: c.limite, pendiente: c.pendiente, disparo: c.disparo });
}

const MANEJADORES: Record<ClaveTarea, (c: Contexto) => Promise<Resultado>> = {
  "informe-mensual": tareaInformeMensual,
  "resumen-semanal": tareaResumenSemanal,
  "dropi-finanzas": tareaDropi,
  "shopify-ventas": tareaShopify,
  quickbooks: tareaQuickbooks,
  monday: tareaMonday,
  "respaldo-finanzas": tareaRespaldo,
  conciliacion: tareaConciliacion,
  "cierre-mes": tareaCierre,
  "efectivo-repartidores": tareaEfectivo,
  "proyeccion-caja": tareaProyeccion,
  alertas: tareaAlertas,
};

/** Las tareas con más de un horario: los siguientes solo siguen lo que quedó pendiente. */
const TAREAS_CON_SEGUNDO_HORARIO = new Set<ClaveTarea>(["conciliacion", "respaldo-finanzas", "shopify-ventas", "monday"]);

export interface Ejecucion {
  id: string | null;
  ok: boolean;
  resumen: string;
  error?: string;
  omitida?: boolean;
}

/**
 * Corre una tarea y deja su registro. Si otra ejecución de la misma tarea sigue corriendo (empezó hace menos de 5 min y no
 * terminó), no hace nada. Si la anterior de hoy dejó trabajo pendiente, sigue de ahí; si ya terminó hoy y es el segundo
 * horario del cron, no repite.
 */
export async function ejecutarTarea(
  supabase: SupabaseClient,
  clave: ClaveTarea,
  opciones: { disparo: "cron" | "manual"; usuarioId?: string | null; presupuestoMs?: number } = { disparo: "cron" },
): Promise<Ejecucion> {
  const inicio = Date.now();
  const hoy = hoyPanama();
  const { data: ultimas, error: e0 } = await supabase.from("fin_tareas_ejecuciones").select("id, inicio, fin, ok, pendiente").eq("tarea", clave).order("inicio", { ascending: false }).limit(1);
  if (e0) return { id: null, ok: false, resumen: "", error: "Falta correr la migración 0921 (tareas programadas) en Supabase." };
  const ultima = ultimas?.[0] as { id: string; inicio: string; fin: string | null; ok: boolean | null; pendiente: unknown } | undefined;
  if (ultima && !ultima.fin && Date.now() - Date.parse(ultima.inicio) < CORRIENDO_MS) {
    return { id: ultima.id, ok: true, resumen: "Ya hay una ejecución en curso.", omitida: true };
  }
  const pendiente = pendienteDeHoy(ultima ?? null, hoy);
  // El segundo horario del cron solo sigue lo que quedó pendiente.
  if (opciones.disparo === "cron" && TAREAS_CON_SEGUNDO_HORARIO.has(clave) && !pendiente && ultima?.ok && hoyPanama(new Date(ultima.inicio)) === hoy && ultima.fin) {
    return { id: ultima.id, ok: true, resumen: "Ya corrió hoy y no quedó nada pendiente.", omitida: true };
  }
  const { data: fila, error: e1 } = await supabase
    .from("fin_tareas_ejecuciones")
    .insert({ tarea: clave, disparo: opciones.disparo, usuario_id: opciones.usuarioId ?? null })
    .select("id")
    .single();
  if (e1 || !fila) return { id: null, ok: false, resumen: "", error: "No se pudo registrar la ejecución." };
  let resultado: Resultado | null = null;
  let error: string | null = null;
  try {
    resultado = await MANEJADORES[clave]({
      supabase,
      hoy,
      limite: inicio + (opciones.presupuestoMs ?? PRESUPUESTO_MS),
      pendiente,
      disparo: opciones.disparo,
      usuarioId: opciones.usuarioId ?? null,
    });
  } catch (e) {
    error = e instanceof Error ? e.message : "Falló sin mensaje.";
  }
  const resumen = resumenCorto(resultado?.resumen ?? "");
  await supabase
    .from("fin_tareas_ejecuciones")
    .update({
      fin: new Date().toISOString(),
      ok: error === null,
      resumen: resumen || null,
      error: error ? resumenCorto(error) : null,
      pendiente: resultado?.pendiente ?? null,
    })
    .eq("id", fila.id);
  return { id: fila.id as string, ok: error === null, resumen, ...(error ? { error } : {}) };
}
