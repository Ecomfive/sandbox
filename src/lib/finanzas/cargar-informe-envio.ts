// Carga y envío del informe mensual (correo) y del resumen semanal (WhatsApp), y las versiones de cada informe
// (migración 0937: `fin_informes_versiones`, `fin_informes_envios`, `fin_informes_explicacion`, `fin_config`). Lo usan las
// tareas programadas «informe-mensual» y «resumen-semanal», los botones «Enviar ahora» de Panel › Envíos y «Guardar
// versión» del Informe. No decide permisos: eso lo hace quien llama. La parte pura está en `informe-envio.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { hoyPanama, ultimosMeses } from "@/lib/af4/fecha";
import { enviarCorreo } from "@/lib/notificaciones/correo";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { cargarEerr, unidadesEerr } from "./cargar-eerr";
import { cargarProyeccion } from "./cargar-proyeccion";
import { accionesDelMes, causasPrincipales, cifrasDelMes, implicancias, tiendaDelMes } from "./informe";
import {
  asuntoInforme,
  configWhatsapp,
  htmlInformeCorreo,
  leerCorreos,
  leerTelefonos,
  textoInforme,
  textoSemanal,
  type SnapshotInforme,
  type SnapshotSemanal,
} from "./informe-envio";
import { cargarValoracion } from "./valoracion";
import { sumarDias } from "../deliverys/liquidacion";

export const SIN_MIGRACION_ENVIOS = "Falta correr la migración 0937 (reportes y comunicación) en Supabase.";

/** La dirección del portal para los enlaces de los correos. */
export function urlPortal(): string {
  const v = process.env.PORTAL_URL || process.env.URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return /^https:\/\//.test(v) ? v.replace(/\/+$/, "") : "https://mom-beta-proveduria.vercel.app";
}

export interface Destinatarios {
  correos: string[];
  telefonos: string[];
}

/** Los destinatarios configurados (Estado de resultados › Ajustes); error si falta la migración. */
export async function cargarDestinatarios(supabase: SupabaseClient): Promise<{ error: string } | Destinatarios> {
  const { data, error } = await supabase.from("fin_config").select("clave, valor").in("clave", ["informe_destinatarios", "whatsapp_numeros"]);
  if (error) return { error: SIN_MIGRACION_ENVIOS };
  const valor = (c: string) => data?.find((f) => f.clave === c)?.valor;
  return { correos: leerCorreos(valor("informe_destinatarios")), telefonos: leerTelefonos(valor("whatsapp_numeros")) };
}

/**
 * La foto del informe de un mes (consolidado, USD). Sin `mes`, el último mes cerrado con ingresos y con un mes anterior
 * con datos (igual que la página del Informe).
 */
export async function armarSnapshotInforme(supabase: SupabaseClient, mesPedido?: string | null): Promise<{ error: string } | SnapshotInforme> {
  const hoy = hoyPanama();
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;
  const [consolidado, unidadesR, valoracion] = await Promise.all([cargarEerr(supabase, null, ultimosMeses(hoy, 13)), unidadesEerr(supabase), cargarValoracion(supabase)]);
  if ("error" in consolidado) return { error: "Todavía no hay un libro de movimientos para armar el informe." };
  const { eerr, conDatos } = consolidado;
  const informables = eerr.meses.filter((m, i) => m < mesEnCurso && conDatos.has(m) && i > 0 && conDatos.has(eerr.meses[i - 1]));
  if (!informables.length) return { error: "Hacen falta dos meses cerrados con movimientos para armar el informe." };
  const mes = mesPedido && informables.includes(mesPedido) ? mesPedido : (informables.filter((m) => (eerr.ingresosNetos[m] ?? 0) > 0).at(-1) ?? informables.at(-1)!);
  const anterior = eerr.meses[eerr.meses.indexOf(mes) - 1];
  const tiendasU = "error" in unidadesR ? [] : unidadesR.unidades.filter((u) => u.clase === "tienda");
  const [porTienda, sinTipoR, explicacionR] = await Promise.all([
    Promise.all(tiendasU.map((u) => cargarEerr(supabase, u.id, [anterior, mes]).then((r) => ({ u, r })))),
    supabase.from("fin_movimientos_sin_tipo").select("movimientos").eq("periodo", mes),
    supabase.from("fin_informes_explicacion").select("texto").eq("periodo", mes).maybeSingle(),
  ]);
  const actual = cifrasDelMes(eerr, mes);
  const previo = cifrasDelMes(eerr, anterior);
  const tiendas = porTienda
    .flatMap(({ u, r }) => ("error" in r ? [] : [tiendaDelMes(u.nombre, r.eerr, mes, anterior)]))
    .filter((t) => t.ingresos !== 0 || t.ebitda !== 0)
    .sort((a, b) => b.ebitda - a.ebitda);
  const pendientes = [{ titulo: "Movimientos sin tipo", cantidad: (sinTipoR.data ?? []).reduce((a, r) => a + Number(r.movimientos), 0) }];
  const multiplo = valoracion.supuestos.multiplo;
  return {
    version: 1,
    mes,
    anterior,
    actual,
    previo,
    causas: causasPrincipales(eerr, mes, anterior),
    tiendas,
    implicancias: implicancias(actual, previo, multiplo),
    multiplo,
    acciones: accionesDelMes(actual, previo, tiendas, pendientes),
    explicacion: explicacionR.error ? null : ((explicacionR.data?.texto as string | undefined) ?? null),
    generadoEn: new Date().toISOString(),
  };
}

/** La foto del resumen semanal: ventas de los últimos 7 días, caja de hoy y alertas abiertas. */
export async function armarSnapshotSemanal(supabase: SupabaseClient, hoy = hoyPanama()): Promise<SnapshotSemanal> {
  const desde = sumarDias(hoy, -7);
  const hasta = sumarDias(hoy, -1);
  const [ventasR, proyeccion, alertasR] = await Promise.all([
    traerTodasConError<{ total: number | string; estado_entrega: string }>((a, b) =>
      supabase.from("ven_ordenes").select("total, estado_entrega").gte("fecha", desde).lte("fecha", hasta).order("id").range(a, b),
    ),
    cargarProyeccion(supabase, hoy).catch(() => ({ error: "x" }) as const),
    supabase.from("fin_alertas").select("tipo, severidad, mensaje").is("resuelta_en", null).is("vista_en", null).limit(500),
  ]);
  const filas = ventasR.error ? null : (ventasR.data ?? []);
  const alertas = alertasR.error ? [] : (alertasR.data ?? []);
  return {
    version: 1,
    semana: desde,
    hasta,
    ventas: filas
      ? {
          ordenes: filas.length,
          total: Math.round(filas.reduce((a, f) => a + Number(f.total), 0) * 100) / 100,
          entregadas: filas.filter((f) => f.estado_entrega === "entregada").length,
        }
      : null,
    caja: "error" in proyeccion ? null : { saldo: proyeccion.cajaHoy, fecha: hoy },
    alertas: {
      total: alertas.length,
      criticas: alertas.filter((a) => a.severidad === "critica").length,
      titulos: alertas.filter((a) => a.severidad === "critica").map((a) => String(a.mensaje)).slice(0, 5),
    },
    generadoEn: new Date().toISOString(),
  };
}

/** Guarda una versión del informe; devuelve su id (null si falta la migración). */
export async function guardarVersion(
  supabase: SupabaseClient,
  v: { tipo: "mensual" | "semanal"; periodo: string; motivo: "generado" | "enviado"; contenido: SnapshotInforme | SnapshotSemanal; usuarioId?: string | null; usuarioNombre?: string | null },
): Promise<string | null> {
  const { data, error } = await supabase
    .from("fin_informes_versiones")
    .insert({ tipo: v.tipo, periodo: v.periodo, motivo: v.motivo, contenido: v.contenido, creado_por: v.usuarioId ?? null, creado_por_nombre: v.usuarioNombre ?? null })
    .select("id")
    .single();
  return error || !data ? null : (data.id as string);
}

async function registrarEnvio(
  supabase: SupabaseClient,
  e: { canal: "correo" | "whatsapp"; periodo: string; destinatarios: string[]; ok: boolean; detalle: string; disparo: "cron" | "manual"; versionId: string | null; usuarioId?: string | null },
) {
  await supabase.from("fin_informes_envios").insert({
    canal: e.canal,
    periodo: e.periodo,
    destinatarios: e.destinatarios,
    ok: e.ok,
    detalle: e.detalle.slice(0, 1000),
    disparo: e.disparo,
    version_id: e.versionId,
    usuario_id: e.usuarioId ?? null,
  });
}

export interface ResultadoEnvio {
  ok: boolean;
  resumen: string;
}

/** Arma el informe del mes, lo manda por correo a la lista configurada, guarda la versión y registra el envío. */
export async function enviarInformeCorreo(
  supabase: SupabaseClient,
  o: { disparo: "cron" | "manual"; mes?: string | null; usuarioId?: string | null; usuarioNombre?: string | null },
): Promise<ResultadoEnvio> {
  const dest = await cargarDestinatarios(supabase);
  if ("error" in dest) return { ok: false, resumen: dest.error };
  const correos = dest.correos.length ? dest.correos : leerCorreos(process.env.NOTIFICACIONES_EMAIL ?? "");
  if (!correos.length) return { ok: false, resumen: "No hay destinatarios configurados (Estado de resultados › Ajustes)." };
  const snap = await armarSnapshotInforme(supabase, o.mes);
  if ("error" in snap) return { ok: false, resumen: snap.error };
  const versionId = await guardarVersion(supabase, { tipo: "mensual", periodo: snap.mes, motivo: "enviado", contenido: snap, usuarioId: o.usuarioId, usuarioNombre: o.usuarioNombre });
  const enlace = `${urlPortal()}/panel-financiero/informe?periodo=${snap.mes.slice(0, 7)}`;
  let ok = false;
  let detalle: string;
  try {
    const r = await enviarCorreo({ destinatarios: correos, asunto: asuntoInforme(snap), html: htmlInformeCorreo(snap, enlace) });
    ok = r.enviado;
    detalle = r.enviado ? `Enviado a ${correos.length} ${correos.length === 1 ? "destinatario" : "destinatarios"}.` : (r.motivo ?? "No se envió.");
  } catch (e) {
    detalle = e instanceof Error ? e.message : "Falló el envío.";
  }
  await registrarEnvio(supabase, { canal: "correo", periodo: snap.mes, destinatarios: correos, ok, detalle, disparo: o.disparo, versionId, usuarioId: o.usuarioId });
  return { ok, resumen: `Informe de ${snap.mes.slice(0, 7)}: ${detalle}` };
}

/** Manda un texto por WhatsApp (API compatible con Evolution API). */
async function enviarWhatsapp(numero: string, texto: string): Promise<void> {
  const cfg = configWhatsapp(process.env);
  if (!cfg) throw new Error("WhatsApp no configurado.");
  const r = await fetch(`${cfg.url}/message/sendText/${encodeURIComponent(cfg.instancia)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: cfg.token, Authorization: `Bearer ${cfg.token}` },
    body: JSON.stringify({ number: numero, text: texto }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`WhatsApp respondió ${r.status}.`);
}

/**
 * El resumen semanal: con WhatsApp configurado se manda a los números; si no, solo se arma el texto (la página lo ofrece
 * con un enlace wa.me para mandarlo a mano). Siempre guarda la versión y, si se mandó, el envío.
 */
export async function enviarResumenSemanal(
  supabase: SupabaseClient,
  o: { disparo: "cron" | "manual"; usuarioId?: string | null; usuarioNombre?: string | null },
): Promise<ResultadoEnvio & { texto: string; automatico: boolean }> {
  const snap = await armarSnapshotSemanal(supabase);
  const texto = textoSemanal(snap);
  const dest = await cargarDestinatarios(supabase);
  const telefonos = "error" in dest ? [] : dest.telefonos;
  const automatico = configWhatsapp(process.env) !== null;
  const versionId = await guardarVersion(supabase, { tipo: "semanal", periodo: snap.semana, motivo: automatico && telefonos.length ? "enviado" : "generado", contenido: snap, usuarioId: o.usuarioId, usuarioNombre: o.usuarioNombre });
  if (!automatico) return { ok: true, resumen: "WhatsApp sin configurar: el resumen queda para mandarlo a mano.", texto, automatico };
  if (!telefonos.length) return { ok: false, resumen: "No hay números de WhatsApp configurados (Estado de resultados › Ajustes).", texto, automatico };
  const fallidos: string[] = [];
  for (const t of telefonos) {
    try {
      await enviarWhatsapp(t, texto);
    } catch {
      fallidos.push(t.slice(-4));
    }
  }
  const ok = fallidos.length === 0;
  const detalle = ok ? `Enviado a ${telefonos.length} ${telefonos.length === 1 ? "número" : "números"}.` : `Falló el envío a ${fallidos.length} de ${telefonos.length} (terminados en ${fallidos.join(", ")}).`;
  await registrarEnvio(supabase, { canal: "whatsapp", periodo: snap.semana, destinatarios: telefonos, ok, detalle, disparo: o.disparo, versionId, usuarioId: o.usuarioId });
  return { ok, resumen: detalle, texto, automatico };
}

export { textoInforme };
