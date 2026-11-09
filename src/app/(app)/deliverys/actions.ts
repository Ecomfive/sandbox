"use server";

import { sinAccesoAUnidades } from "@/lib/finanzas/acceso-tienda";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { aLineas, armarFila, cargarEntregas, COLUMNAS_CIERRE, porDia, porTiendaDe, type DiaCierre, type FilaCierre, type FilaCierreBase, type FilaEntrega } from "@/lib/deliverys/cargar";
import {
  depositadoDeOrdenes,
  remesadoDeOrdenes,
  efectivoDelCierre,
  leerOrdenesGuardadas,
  ordenesEfectivoSemana,
  ordenesParaGuardar,
  type EfectivoSemana,
  type OrigenEfectivo,
} from "@/lib/deliverys/efectivo";
import { dinero2 } from "@/lib/af4/formato";
import { SIN_MIGRACION, UUID } from "@/lib/deliverys/guardar";
import {
  CATEGORIAS,
  ESTADOS,
  cierreDeTotales,
  METODOS_COBRO,
  METODOS_PAGO,
  descripcionLibro,
  esInicioSemana,
  inicioSemana,
  liquidar,
  redondear,
  repartirEnTiendas,
  sentidoNeto,
  tarifaDe,
  textoSemana,
  textoSemanaCorto,
  validarTarifas,
  type Categoria,
  type MetodoPago,
  type TotalTienda,
} from "@/lib/deliverys/liquidacion";
import { EMPRESA_RECIBO } from "@/lib/deliverys/recibo";
import { claveRepartidor, limpiarAlias } from "@/lib/deliverys/repartidor";
import { createServiceClient } from "@/lib/supabase/server";

const MODULO = "deliverys";
const MODULO_LIBRO = "libro-movimientos";
/** El tipo del libro con que Majo carga los pagos a repartidores. */
const TIPO_LIBRO = "Shipping por Ventas";
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ahora = () => new Date().toISOString();

function revalidar() {
  revalidatePath("/deliverys", "layout");
}

const texto = (v: unknown, max: number): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
};
const monto = (v: unknown, max = 100_000): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v.replace(/[$\s,]/g, "")) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= max ? redondear(n) : null;
};

async function nombreRepartidor(id: string): Promise<string | null> {
  const { data } = await createServiceClient().from("del_repartidores").select("nombre").eq("id", id).maybeSingle();
  return (data?.nombre as string | undefined) ?? null;
}

// ---------------------------------------------------------------------------------------------
// Ficha de un cierre
// ---------------------------------------------------------------------------------------------

export interface DetalleCierre {
  fila: FilaCierre;
  nota: string | null;
  porTienda: TotalTienda[];
  dias: DiaCierre[];
  entregas: FilaEntrega[];
  cuentas: { id: string; nombre: string }[];
  pago: { fecha: string | null; metodo: MetodoPago | null; referencia: string | null; cuenta: string | null } | null;
  /** Quien abre la ficha puede escribir en el libro (para ofrecer «Registrar en el libro»). */
  puedeLibro: boolean;
  /** De dónde sale el efectivo cobrado y sus órdenes; `depositado` = lo de esas órdenes ya conciliado con el banco. */
  efectivo: EfectivoSemana & { depositado: number | null; remesado: number | null };
}

/**
 * El efectivo de una semana abierta: lo cargado en las entregas si hay alguno (manda), si no lo de las órdenes entregadas
 * en efectivo de ese repartidor (migración 0921; sin ella, el de las entregas).
 */
async function efectivoAbierto(supabase: ReturnType<typeof createServiceClient>, repartidorId: string, semana: string, entregas: FilaEntrega[]): Promise<EfectivoSemana> {
  const manual = entregas.some((f) => f.cobrado !== null);
  const efectivoManual = redondear(entregas.filter((f) => f.metodo === "efectivo").reduce((a, f) => a + (f.cobrado ?? 0), 0));
  const ordenes = await ordenesEfectivoSemana(supabase, repartidorId, semana);
  if (ordenes === null) return efectivoDelCierre({ hay: true, efectivo: efectivoManual }, []);
  return efectivoDelCierre({ hay: manual, efectivo: efectivoManual }, ordenes);
}

/** Todo lo de un repartidor en una semana. Basta poder abrir Deliverys. */
export async function obtenerCierre(repartidorId: string, semana: string): Promise<{ error: string } | DetalleCierre> {
  const usuario = await requireModulo(MODULO);
  if (typeof repartidorId !== "string" || !UUID.test(repartidorId) || typeof semana !== "string" || !esInicioSemana(semana)) return { error: "Cierre inválido." };
  const supabase = createServiceClient();
  const [rep, cierre, entregas, cuentas] = await Promise.all([
    supabase.from("del_repartidores").select("id, nombre, documento").eq("id", repartidorId).maybeSingle(),
    supabase.from("del_cierres").select(`${COLUMNAS_CIERRE}, nota, detalle, metodo_pago, referencia_pago, cuenta_id, fin_cuentas(nombre)`).eq("repartidor_id", repartidorId).eq("semana", semana).maybeSingle(),
    cargarEntregas(supabase, semana, repartidorId),
    supabase.from("fin_cuentas").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  if (rep.error || cierre.error || "error" in entregas) return { error: SIN_MIGRACION };
  if (!rep.data) return { error: "El repartidor ya no existe." };
  const c = cierre.data as (FilaCierreBase & { nota: string | null; detalle: unknown; metodo_pago: MetodoPago | null; referencia_pago: string | null; fin_cuentas: unknown }) | null;
  const recibo = c?.estado === "pagado" ? await supabase.from("del_recibos").select("numero").eq("cierre_id", c.id).maybeSingle() : null;
  // La vista no hace falta: con las líneas a mano se suma igual (misma fórmula). El efectivo, de las órdenes (0134).
  const l = liquidar(aLineas(entregas.filas));
  const fijo = !!c && c.estado !== "abierto";
  let efectivo: EfectivoSemana;
  if (fijo) {
    // Lo que quedó al cerrar (las columnas son de la 0134: sin ella, solo el monto).
    const g = await supabase.from("del_cierres").select("efectivo_origen, efectivo_ordenes").eq("id", c.id).maybeSingle();
    const ordenes = g.error ? [] : leerOrdenesGuardadas(g.data?.efectivo_ordenes);
    const origen = ((g.data?.efectivo_origen as OrigenEfectivo | null) ?? (Number(c.cobrado_efectivo ?? 0) ? "manual" : "ninguno")) as OrigenEfectivo;
    efectivo = { origen, monto: Number(c.cobrado_efectivo ?? 0), deOrdenes: redondear(ordenes.reduce((a, o) => a + o.monto, 0)), ordenes };
  } else {
    efectivo = await efectivoAbierto(supabase, repartidorId, semana, entregas.filas);
  }
  const vista = {
    repartidor_id: repartidorId,
    semana,
    en_ruta: l.enRuta,
    entregas: l.entregas,
    fallidas: l.fallidas,
    devueltas: l.devueltas,
    reprogramadas: l.reprogramadas,
    tarifas: l.tarifas,
    propinas: l.propinas,
    aparte: l.aparte,
    cobrado_efectivo: efectivo.monto,
  };
  const fila = armarFila(rep.data as { id: string; nombre: string; documento: string | null }, semana, vista, c ?? undefined, (recibo?.data?.numero as number | undefined) ?? null);
  const cuenta = c?.fin_cuentas ? ((Array.isArray(c.fin_cuentas) ? c.fin_cuentas[0] : c.fin_cuentas) as { nombre: string } | null)?.nombre ?? null : null;
  return {
    fila,
    nota: c?.nota ?? null,
    porTienda: porTiendaDe(c && c.estado !== "abierto" ? c.detalle : null, entregas.filas),
    dias: porDia(entregas.filas),
    entregas: entregas.filas,
    cuentas: (cuentas.data ?? []) as { id: string; nombre: string }[],
    pago: c?.estado === "pagado" ? { fecha: c.fecha_pago ? String(c.fecha_pago).slice(0, 10) : null, metodo: c.metodo_pago, referencia: c.referencia_pago, cuenta } : null,
    puedeLibro: usuario.modulos.includes(MODULO_LIBRO) && !usuario.modulosSoloLectura.includes(MODULO_LIBRO),
    efectivo: {
      ...efectivo,
      depositado: efectivo.ordenes.some((o) => o.id) ? await depositadoDeOrdenes(supabase, efectivo.ordenes) : null,
      remesado: await remesadoDeOrdenes(supabase, efectivo.ordenes),
    },
  };
}

/** Adelantos, descuentos y nota de una semana abierta (crea el cierre si no existía). */
export async function guardarAjustesCierre(repartidorId: string, semana: string, datos: unknown): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof repartidorId !== "string" || !UUID.test(repartidorId) || typeof semana !== "string" || !esInicioSemana(semana)) return { error: "Cierre inválido." };
    const d = (datos ?? {}) as Record<string, unknown>;
    const adelantos = monto(d.adelantos ?? 0);
    const descuentos = monto(d.descuentos ?? 0);
    if (adelantos === null || descuentos === null) return { error: "Adelantos y descuentos deben ser montos de 0 o más." };
    const nota = texto(d.nota, 500);
    const supabase = createServiceClient();
    const nombre = await nombreRepartidor(repartidorId);
    if (!nombre) return { error: "El repartidor ya no existe." };
    const { data: antes } = await supabase.from("del_cierres").select("id, estado, adelantos, descuentos").eq("repartidor_id", repartidorId).eq("semana", semana).maybeSingle();
    if (antes && antes.estado !== "abierto") return { error: "La semana ya está cerrada: vuelve a abrirla para cambiarla." };
    const { data, error } = await supabase
      .from("del_cierres")
      .upsert({ repartidor_id: repartidorId, semana, adelantos, descuentos, nota, actualizado_en: ahora() }, { onConflict: "repartidor_id,semana" })
      .select("id")
      .single();
    if (error || !data) return { error: "No se pudo guardar." };
    await registrarAuditoria({
      accion: "ajustar_cierre_delivery",
      entidad: "del_cierres",
      entidadId: data.id as string,
      detalle: `${nombre} · ${textoSemanaCorto(semana)}`,
      antes: { Adelantos: dinero2(Number(antes?.adelantos ?? 0)), Descuentos: dinero2(Number(antes?.descuentos ?? 0)) },
      despues: { Adelantos: dinero2(adelantos), Descuentos: dinero2(descuentos) },
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

/** «Cerrar semana»: deja fijo lo calculado y liga sus entregas al cierre (reimportar ya no las toca). */
export async function cerrarSemanaDelivery(repartidorId: string, semana: string): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (typeof repartidorId !== "string" || !UUID.test(repartidorId) || typeof semana !== "string" || !esInicioSemana(semana)) return { error: "Cierre inválido." };
    const supabase = createServiceClient();
    const nombre = await nombreRepartidor(repartidorId);
    if (!nombre) return { error: "El repartidor ya no existe." };
    const { data: antes } = await supabase.from("del_cierres").select("id, estado, adelantos, descuentos").eq("repartidor_id", repartidorId).eq("semana", semana).maybeSingle();
    if (antes && antes.estado !== "abierto") return { error: "La semana ya estaba cerrada." };
    const entregas = await cargarEntregas(supabase, semana, repartidorId);
    if ("error" in entregas) return entregas;
    const efectivo = await efectivoAbierto(supabase, repartidorId, semana, entregas.filas);
    if (!entregas.filas.length && !efectivo.ordenes.length) return { error: "No hay entregas ni cobros en esta semana." };
    const ajustes = { adelantos: Number(antes?.adelantos ?? 0), descuentos: Number(antes?.descuentos ?? 0) };
    const lineas = liquidar(aLineas(entregas.filas), ajustes);
    // El efectivo que manda (el de las órdenes, salvo que se haya cargado a mano) rehace el neto con la misma fórmula.
    const l = { ...lineas, ...cierreDeTotales({ ...lineas, cobradoEfectivo: efectivo.monto }, ajustes) };
    const { data, error } = await supabase
      .from("del_cierres")
      .upsert(
        {
          repartidor_id: repartidorId,
          semana,
          estado: "cerrado",
          en_ruta: l.enRuta,
          entregas: l.entregas,
          fallidas: l.fallidas,
          devueltas: l.devueltas,
          reprogramadas: l.reprogramadas,
          tarifas: l.tarifas,
          propinas: l.propinas,
          aparte: l.aparte,
          cobrado_efectivo: l.cobradoEfectivo,
          a_pagar: l.aPagar,
          neto: l.neto,
          detalle: l.porTienda,
          cerrado_en: ahora(),
          cerrado_por: usuario.id,
          actualizado_en: ahora(),
        },
        { onConflict: "repartidor_id,semana" },
      )
      .select("id")
      .single();
    if (error || !data) return { error: `No se pudo cerrar: ${error?.message ?? "sin respuesta"}` };
    // De dónde salió el efectivo y sus órdenes (migración 0921; sin ella el cierre queda igual, solo sin el detalle).
    await supabase
      .from("del_cierres")
      .update({ efectivo_origen: efectivo.origen, efectivo_ordenes: efectivo.ordenes.length ? ordenesParaGuardar(efectivo.ordenes) : null })
      .eq("id", data.id);
    const ids = entregas.filas.map((f) => f.id);
    for (let i = 0; i < ids.length; i += 200) {
      const { error: e } = await supabase.from("del_entregas").update({ cierre_id: data.id }).in("id", ids.slice(i, i + 200));
      if (e) return { error: "Se cerró, pero no se pudieron ligar las entregas: vuelve a abrir y cerrar la semana." };
    }
    await registrarAuditoria({
      accion: "cerrar_semana_delivery",
      entidad: "del_cierres",
      entidadId: data.id as string,
      detalle: `${nombre} · ${textoSemanaCorto(semana)}: ${l.entregas} entregas, efectivo ${dinero2(l.cobradoEfectivo)}, neto ${dinero2(l.neto)}`,
      antes: { Estado: "Abierto" },
      despues: { Estado: "Cerrado" },
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo cerrar la semana." };
  }
}

/** Vuelve a abrir una semana cerrada que todavía no se pagó. */
export async function reabrirSemanaDelivery(cierreId: string): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof cierreId !== "string" || !UUID.test(cierreId)) return { error: "Cierre inválido." };
    const supabase = createServiceClient();
    const { data: c } = await supabase.from("del_cierres").select("estado, semana, repartidor_id, del_repartidores(nombre)").eq("id", cierreId).maybeSingle();
    if (!c) return { error: "El cierre ya no existe." };
    if (c.estado === "pagado") return { error: "Ya se pagó: no se puede volver a abrir." };
    if (c.estado === "abierto") return {};
    const vacio = { en_ruta: null, entregas: null, fallidas: null, devueltas: null, reprogramadas: null, tarifas: null, propinas: null, aparte: null, cobrado_efectivo: null, a_pagar: null, neto: null, detalle: null };
    // Sin la migración 0921 estas columnas no existen: se limpian aparte y sin fallar.
    await supabase.from("del_cierres").update({ efectivo_origen: null, efectivo_ordenes: null }).eq("id", cierreId).eq("estado", "cerrado");
    const { error } = await supabase.from("del_cierres").update({ estado: "abierto", ...vacio, cerrado_en: null, cerrado_por: null, actualizado_en: ahora() }).eq("id", cierreId).eq("estado", "cerrado");
    if (error) return { error: "No se pudo abrir." };
    await supabase.from("del_entregas").update({ cierre_id: null }).eq("cierre_id", cierreId);
    const r = c.del_repartidores as unknown as { nombre: string } | { nombre: string }[] | null;
    await registrarAuditoria({
      accion: "reabrir_semana_delivery",
      entidad: "del_cierres",
      entidadId: cierreId,
      detalle: `${(Array.isArray(r) ? r[0]?.nombre : r?.nombre) ?? "Repartidor"} · ${textoSemanaCorto(String(c.semana).slice(0, 10))}`,
      antes: { Estado: "Cerrado" },
      despues: { Estado: "Abierto" },
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo abrir la semana." };
  }
}

/**
 * «Registrar pago»: la semana cerrada pasa a pagada y se genera su recibo (con el nombre y el documento como están hoy).
 * Si se pide, crea en el libro una línea por tienda con lo pagado (origen `deliverys`), como la carga Majo: fuera del
 * EERR y dentro del flujo, en el mes del pago. Para eso hace falta poder modificar el Libro de movimientos.
 */
export async function registrarPagoDelivery(cierreId: string, datos: unknown): Promise<{ error?: string; reciboId?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    if (typeof cierreId !== "string" || !UUID.test(cierreId)) return { error: "Cierre inválido." };
    const d = (datos ?? {}) as Record<string, unknown>;
    const fecha = typeof d.fecha === "string" && FECHA.test(d.fecha) && !Number.isNaN(Date.parse(d.fecha)) ? d.fecha : null;
    if (!fecha) return { error: "Elige la fecha de pago." };
    const metodo = (METODOS_PAGO as readonly string[]).includes(d.metodo as string) ? (d.metodo as MetodoPago) : null;
    if (!metodo) return { error: "Elige la forma de pago." };
    const referencia = texto(d.referencia, 120);
    const cuentaId = typeof d.cuentaId === "string" && UUID.test(d.cuentaId) ? d.cuentaId : null;
    const enLibro = d.enLibro === true;
    if (enLibro && (!usuario.modulos.includes(MODULO_LIBRO) || usuario.modulosSoloLectura.includes(MODULO_LIBRO))) return { error: "Para registrar en el libro hace falta poder modificar el Libro de movimientos." };
    if (enLibro && !cuentaId) return { error: "Elige la cuenta de la que salió el pago." };

    const supabase = createServiceClient();
    const { data: c } = await supabase
      .from("del_cierres")
      .select("id, estado, semana, neto, detalle, repartidor_id, del_repartidores(nombre, documento)")
      .eq("id", cierreId)
      .maybeSingle();
    if (!c) return { error: "El cierre ya no existe." };
    if (c.estado !== "cerrado") return { error: c.estado === "pagado" ? "Ya estaba pagado." : "Primero cierra la semana." };
    if (cuentaId) {
      const { data: cta } = await supabase.from("fin_cuentas").select("id").eq("id", cuentaId).maybeSingle();
      if (!cta) return { error: "Esa cuenta ya no existe." };
    }
    const r = (Array.isArray(c.del_repartidores) ? c.del_repartidores[0] : c.del_repartidores) as { nombre: string; documento: string | null } | null;
    if (!r) return { error: "El repartidor ya no existe." };
    const semana = String(c.semana).slice(0, 10);
    const neto = Number(c.neto);
    const sentido = sentidoNeto(neto);

    // Libro: se revisa antes de tocar nada.
    let movimientos: Record<string, unknown>[] = [];
    if (enLibro) {
      if (sentido !== "pagar") return { error: "Sin monto a pagar no hay nada que registrar en el libro." };
      const porTienda = Array.isArray(c.detalle) ? (c.detalle as TotalTienda[]) : [];
      const reparto = repartirEnTiendas(porTienda, neto);
      const [tipo, unidades] = await Promise.all([
        supabase.from("fin_tipos").select("id").eq("nombre", TIPO_LIBRO).maybeSingle(),
        supabase.from("fin_unidades").select("id, nombre").in("nombre", reparto.map((x) => x.tienda)),
      ]);
      if (!tipo.data) return { error: `No existe el tipo «${TIPO_LIBRO}» en el libro.` };
      const idDe = new Map((unidades.data ?? []).map((u) => [u.nombre as string, u.id as string]));
      if (reparto.some((x) => !idDe.has(x.tienda))) return { error: "Alguna tienda del cierre ya no existe en el libro." };
      movimientos = reparto.map((x) => ({
        periodo: `${fecha.slice(0, 7)}-01`,
        fecha_registro: fecha,
        unidad_id: idDe.get(x.tienda),
        tipo_id: tipo.data!.id,
        descripcion: descripcionLibro(semana, r.nombre),
        en_eerr: false,
        en_flujo: true,
        monto: x.monto,
        fecha_servicio: semana,
        fecha_pago: fecha,
        cuenta_id: cuentaId,
        origen: "deliverys",
        origen_clave: `deliverys:${cierreId}:${idDe.get(x.tienda)}`,
        creado_por: usuario.id,
      }));
    }

    const { data: pagado, error } = await supabase
      .from("del_cierres")
      .update({ estado: "pagado", fecha_pago: fecha, metodo_pago: metodo, referencia_pago: referencia, cuenta_id: cuentaId, pagado_en: ahora(), pagado_por: usuario.id, actualizado_en: ahora() })
      .eq("id", cierreId)
      .eq("estado", "cerrado")
      .select("id");
    if (error || !pagado?.length) return { error: "No se pudo registrar el pago (¿otra persona lo cambió?)." };
    const { data: recibo, error: errRecibo } = await supabase
      .from("del_recibos")
      .insert({
        cierre_id: cierreId,
        repartidor_id: c.repartidor_id,
        semana,
        tipo: sentido === "rendir" ? "rendicion" : "pago",
        monto: Math.abs(neto),
        fecha_pago: fecha,
        metodo_pago: metodo,
        referencia,
        nombre: r.nombre,
        documento: r.documento,
        empresa: EMPRESA_RECIBO.nombre,
        empresa_ruc: EMPRESA_RECIBO.ruc,
        periodo_texto: textoSemana(semana),
        creado_por: usuario.id,
      })
      .select("id, numero")
      .single();
    if (errRecibo || !recibo) {
      await supabase.from("del_cierres").update({ estado: "cerrado", fecha_pago: null, metodo_pago: null, referencia_pago: null, cuenta_id: null, pagado_en: null, pagado_por: null }).eq("id", cierreId);
      return { error: "No se pudo generar el recibo: el pago no quedó registrado." };
    }
    let enElLibro = false;
    if (movimientos.length) {
      const { error: errLibro } = await supabase.from("fin_movimientos").upsert(movimientos, { onConflict: "origen_clave", ignoreDuplicates: true });
      if (!errLibro) {
        enElLibro = true;
        await supabase.from("del_cierres").update({ en_libro: true }).eq("id", cierreId);
        revalidatePath("/libro-movimientos", "layout");
      }
    }
    await registrarAuditoria({
      accion: "pagar_cierre_delivery",
      entidad: "del_cierres",
      entidadId: cierreId,
      detalle: `${r.nombre} · ${textoSemanaCorto(semana)}: recibo ${String(recibo.numero).padStart(4, "0")} por ${dinero2(Math.abs(neto))}${sentido === "rendir" ? " (entregó)" : ""}${enElLibro ? `, ${movimientos.length} movimientos en el libro` : ""}`,
      antes: { Estado: "Cerrado" },
      despues: { Estado: "Pagado" },
    });
    revalidar();
    if (movimientos.length && !enElLibro) return { error: "Pago registrado, pero no se pudo escribir en el libro: cárgalo a mano.", reciboId: recibo.id as string };
    return { reciboId: recibo.id as string };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo registrar el pago." };
  }
}

// ---------------------------------------------------------------------------------------------
// Entregas cargadas a mano
// ---------------------------------------------------------------------------------------------

/** «Agregar» de Entregas: un pedido con su orden, lo que se cobró y cómo. La tarifa sale del repartidor o de la hoja. */
export async function crearEntregaDelivery(formData: FormData): Promise<{ error?: string }> {
  try {
    const usuario = await requireModuloEscritura(MODULO);
    const s = (k: string) => {
      const v = formData.get(k);
      return typeof v === "string" ? v.trim() : "";
    };
    const fecha = FECHA.test(s("fecha")) && !Number.isNaN(Date.parse(s("fecha"))) ? s("fecha") : null;
    if (!fecha) return { error: "Elige la fecha." };
    const repartidorId = s("repartidor_id");
    if (!UUID.test(repartidorId)) return { error: "Elige el repartidor." };
    const unidadId = s("unidad_id");
    if (!UUID.test(unidadId)) return { error: "Elige la tienda." };
    const acceso = await sinAccesoAUnidades([unidadId]);
    if (acceso) return { error: acceso };
    const estado = (ESTADOS as readonly string[]).includes(s("estado")) ? s("estado") : null;
    if (!estado) return { error: "Elige el estado." };
    const cat = s("categoria");
    const categoria: Categoria | null = cat === "" ? null : (CATEGORIAS as readonly string[]).includes(cat) && cat !== "propina" ? (cat as Categoria) : null;
    if (cat !== "" && !categoria) return { error: "Tarifa inválida." };
    if (!categoria && (estado === "entregado" || estado === "fallido")) return { error: "Una entrega o un intento fallido llevan tarifa." };
    const metodoTxt = s("metodo_cobro");
    const metodo = metodoTxt === "" ? null : (METODOS_COBRO as readonly string[]).includes(metodoTxt) ? metodoTxt : undefined;
    if (metodo === undefined) return { error: "Forma de cobro inválida." };
    const montoCobrar = s("monto_cobrar") ? monto(s("monto_cobrar")) : null;
    const cobrado = s("cobrado") ? monto(s("cobrado")) : null;
    if ((s("monto_cobrar") && montoCobrar === null) || (s("cobrado") && cobrado === null)) return { error: "Los montos deben ser de 0 o más." };
    if (cobrado && !metodo) return { error: "Elige cómo se cobró." };
    const supabase = createServiceClient();
    const [rep, unidad, cerrada] = await Promise.all([
      supabase.from("del_repartidores").select("nombre, tarifas").eq("id", repartidorId).maybeSingle(),
      supabase.from("fin_unidades").select("nombre").eq("id", unidadId).maybeSingle(),
      supabase.from("del_cierres").select("estado").eq("repartidor_id", repartidorId).eq("semana", inicioSemana(fecha)).neq("estado", "abierto").maybeSingle(),
    ]);
    if (!rep.data) return { error: "El repartidor ya no existe." };
    if (!unidad.data) return { error: "La tienda ya no existe." };
    if (cerrada.data) return { error: "Esa semana ya está cerrada para este repartidor: vuelve a abrirla para agregar entregas." };
    const tarifa = categoria ? tarifaDe(categoria as Exclude<Categoria, "propina">, validarTarifas(rep.data.tarifas)) : 0;
    const { data, error } = await supabase
      .from("del_entregas")
      .insert({
        fecha,
        repartidor_id: repartidorId,
        unidad_id: unidadId,
        zona: texto(s("zona"), 80),
        orden: texto(s("orden"), 60),
        categoria,
        estado,
        cantidad: 1,
        tarifa,
        monto_cobrar: montoCobrar,
        cobrado,
        metodo_cobro: metodo,
        nota: texto(s("nota"), 500),
        origen: "manual",
        creado_por: usuario.id,
      })
      .select("id")
      .single();
    if (error || !data) return { error: `No se pudo guardar: ${error?.message ?? SIN_MIGRACION}` };
    await registrarAuditoria({
      accion: "crear_entrega_delivery",
      entidad: "del_entregas",
      entidadId: data.id as string,
      detalle: `${rep.data.nombre} · ${unidad.data.nombre} · ${fecha}${s("orden") ? ` · orden ${texto(s("orden"), 60)}` : ""}`,
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar la entrega." };
  }
}

// ---------------------------------------------------------------------------------------------
// Repartidores
// ---------------------------------------------------------------------------------------------

export interface RepartidorFicha {
  id: string;
  nombre: string;
  documento: string | null;
  telefono: string | null;
  alias: string[];
  tarifas: Partial<Record<string, number>> | null;
  medio_pago: MetodoPago | null;
  activo: boolean;
  nota: string | null;
}

/** Ficha de un repartidor (con el documento y el teléfono completos). */
export async function obtenerRepartidor(id: string): Promise<{ error: string } | { repartidor: RepartidorFicha; cierres: FilaCierre[] }> {
  await requireModulo(MODULO);
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Repartidor inválido." };
  const supabase = createServiceClient();
  const [r, cierres] = await Promise.all([
    supabase.from("del_repartidores").select("id, nombre, documento, telefono, alias, tarifas, medio_pago, activo, nota").eq("id", id).maybeSingle(),
    supabase.from("del_cierres").select(COLUMNAS_CIERRE).eq("repartidor_id", id).order("semana", { ascending: false }).limit(60),
  ]);
  if (r.error || cierres.error) return { error: SIN_MIGRACION };
  if (!r.data) return { error: "El repartidor ya no existe." };
  const rep = r.data as unknown as RepartidorFicha;
  return {
    repartidor: { ...rep, alias: rep.alias ?? [], tarifas: validarTarifas(rep.tarifas) },
    cierres: ((cierres.data ?? []) as FilaCierreBase[]).filter((c) => c.estado !== "abierto").map((c) => armarFila(rep, String(c.semana).slice(0, 10), undefined, c, null)),
  };
}

function leerDatosRepartidor(d: Record<string, unknown>) {
  const nombre = texto(d.nombre, 120);
  if (!nombre) return { error: "Falta el nombre." } as const;
  const clave = claveRepartidor(nombre);
  const tarifas: Record<string, number> = {};
  if (d.tarifas && typeof d.tarifas === "object") {
    for (const [k, v] of Object.entries(d.tarifas as Record<string, unknown>)) {
      if (v === "" || v === null || v === undefined) continue;
      const n = monto(v, 100);
      if (n === null) return { error: "Las tarifas deben ser montos de 0 a 100." } as const;
      tarifas[k] = n;
    }
  }
  const medio = d.medio_pago === "" || d.medio_pago === null || d.medio_pago === undefined ? null : (METODOS_PAGO as readonly string[]).includes(d.medio_pago as string) ? (d.medio_pago as MetodoPago) : undefined;
  if (medio === undefined) return { error: "Forma de pago inválida." } as const;
  return {
    clave,
    nombre,
    documento: texto(d.documento, 40),
    telefono: texto(d.telefono, 40),
    alias: limpiarAlias(typeof d.alias === "string" ? d.alias.split(/[,\n]/) : d.alias, clave),
    tarifas: validarTarifas(tarifas),
    medio_pago: medio,
    activo: d.activo !== false && d.activo !== "no",
    nota: texto(d.nota, 500),
  };
}

/** «Agregar» de Repartidores. */
export async function crearRepartidor(formData: FormData): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    const g = (k: string) => formData.get(k);
    const d = leerDatosRepartidor({
      nombre: g("nombre"),
      documento: g("documento"),
      telefono: g("telefono"),
      alias: g("alias") ?? "",
      medio_pago: g("medio_pago") ?? "",
      tarifas: { entrega: g("tarifa_entrega") ?? "", compartida: g("tarifa_compartida") ?? "", cambio: g("tarifa_cambio") ?? "", fuera_ruta: g("tarifa_fuera_ruta") ?? "" },
    });
    if ("error" in d) return { error: d.error };
    const supabase = createServiceClient();
    const { data: existe } = await supabase.from("del_repartidores").select("id").eq("clave", d.clave).maybeSingle();
    if (existe) return { error: "Ya hay un repartidor con ese nombre." };
    const { data, error } = await supabase.from("del_repartidores").insert(d).select("id").single();
    if (error || !data) return { error: `No se pudo guardar: ${error?.message ?? SIN_MIGRACION}` };
    // Datos personales: la auditoría dice qué se hizo, no el documento ni el teléfono.
    await registrarAuditoria({ accion: "crear_repartidor", entidad: "del_repartidores", entidadId: data.id as string, detalle: d.nombre });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el repartidor." };
  }
}

export async function actualizarRepartidor(id: string, datos: unknown): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Repartidor inválido." };
    const d = leerDatosRepartidor((datos ?? {}) as Record<string, unknown>);
    if ("error" in d) return { error: d.error };
    const supabase = createServiceClient();
    const { data: antes } = await supabase.from("del_repartidores").select("nombre, clave").eq("id", id).maybeSingle();
    if (!antes) return { error: "El repartidor ya no existe." };
    if (antes.clave !== d.clave) {
      const { data: otro } = await supabase.from("del_repartidores").select("id").eq("clave", d.clave).neq("id", id).maybeSingle();
      if (otro) return { error: "Ya hay otro repartidor con ese nombre." };
    }
    // El nombre anterior queda como alias: así la hoja lo sigue reconociendo.
    const alias = antes.clave !== d.clave ? [...new Set([...d.alias, antes.clave as string])] : d.alias;
    const { error } = await supabase.from("del_repartidores").update({ ...d, alias, actualizado_en: ahora() }).eq("id", id);
    if (error) return { error: "No se pudo guardar." };
    await registrarAuditoria({
      accion: "editar_repartidor",
      entidad: "del_repartidores",
      entidadId: id,
      detalle: antes.nombre === d.nombre ? `Editó los datos de ${d.nombre}` : `${antes.nombre} → ${d.nombre}`,
    });
    revalidar();
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}
