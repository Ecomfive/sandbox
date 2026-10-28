"use server";

// «Actualizar Dropi» (migración 0154): el panel pide las direcciones de subida, la extensión lee Dropi desde su pestaña y sube los
// archivos, y el panel pide procesar cada parte aquí, una por una (cada llamada tiene los 5 minutos de la página). Por ahora solo
// para quien está en CORREOS_ACTUALIZAR_DROPI. Panamá y, desde el 28 oct 2026, Costa Rica: cada parte sabe de qué país es.

import { revalidatePath } from "next/cache";
import { requireModuloEscritura } from "@/lib/auth";
import { ingerirCartera, type FilaCartera } from "@/lib/dropi-actualizar/ingerir-cartera";
import { ingerirPedidos, type PedidoDropi } from "@/lib/dropi-actualizar/ingerir-pedidos";
import { ingerirRetiros, type FilaRetiro } from "@/lib/dropi-actualizar/ingerir-retiros";
import { ingerirVentas, type MovimientosDropi, type ResumenDropi } from "@/lib/dropi-actualizar/ingerir-ventas";
import { LECTORES, PARTES, archivoSubido, esParte, lectoresDe, parte as parteDe, puedeActualizarDropi, type ClaveLector, type ClaveParte } from "@/lib/dropi-actualizar/partes";
import { createServiceClient } from "@/lib/supabase/server";
import { guardarNuestrosProductos, type LecturaNuestros } from "../../../../../scripts/publicaciones-sincronizar-dropi";

const BUCKET = "wms-compras";
const CARPETA = "tmp-dropi-panel";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Fotos que el stock copia por vez (las demás, en la siguiente): así el procesamiento cabe en el tiempo de la página.
const FOTOS_POR_VEZ = 40;

async function usuarioPermitido() {
  const usuario = await requireModuloEscritura("publicaciones-dropi");
  if (!puedeActualizarDropi(usuario)) throw new Error("«Actualizar Dropi» todavía no está disponible para tu usuario.");
  return usuario;
}

const falta = (m: string) => /does not exist|schema cache/i.test(m);

/** Empieza una actualización: la deja anotada y devuelve las direcciones de subida de cada lector (valen 2 horas). */
export async function empezarActualizacion(partes: unknown): Promise<{ error?: string; id?: string; subidas?: Partial<Record<ClaveLector, Record<string, string>>> }> {
  const usuario = await usuarioPermitido();
  const pedidas = (Array.isArray(partes) ? partes : []).filter(esParte);
  if (!pedidas.length) return { error: "Elige al menos una parte." };
  // Panamá y Costa Rica se actualizan por separado (28 oct 2026, Hernán: juntos es mucha carga y tarda mucho más).
  if (new Set(pedidas.map((p) => parteDe(p).pais)).size > 1) return { error: "Panamá y Costa Rica se actualizan por separado: elige las partes de un solo país." };
  const supabase = createServiceClient();
  // Una sola a la vez (26 oct 2026: un doble clic arrancó dos y el CRM no alcanzó). Una que quedó «corriendo» hace más de 40
  // minutos (se cerró la pestaña a medias) ya no bloquea.
  const { data: enCurso } = await supabase
    .from("dropi_actualizaciones")
    .select("inicio")
    .eq("estado", "corriendo")
    .gte("inicio", new Date(Date.now() - 40 * 60000).toISOString())
    .limit(1)
    .maybeSingle();
  if (enCurso)
    return { error: `Ya hay una actualización en curso (empezó a las ${new Date(enCurso.inicio as string).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit", timeZone: "America/Panama" })}). Espera a que termine.` };
  const { data, error } = await supabase
    .from("dropi_actualizaciones")
    .insert({ iniciado_por: usuario.id, iniciado_por_nombre: usuario.nombre || usuario.email, origen: "manual", pedidas })
    .select("id")
    .single();
  if (error || !data) return { error: error && falta(error.message) ? "Falta correr en Supabase la migración 0154." : "No se pudo empezar la actualización." };
  const id = data.id as string;
  const subidas: Partial<Record<ClaveLector, Record<string, string>>> = {};
  for (const lector of lectoresDe(pedidas)) {
    const urls = await firmarSubidas(supabase, id, lector);
    if (typeof urls === "string") return { error: urls };
    subidas[lector] = urls;
  }
  return { id, subidas };
}

/** Las direcciones de subida de un lector (o el error como texto). */
async function firmarSubidas(supabase: ReturnType<typeof createServiceClient>, id: string, lector: ClaveLector): Promise<Record<string, string> | string> {
  const urls: Record<string, string> = {};
  for (const archivo of LECTORES[lector].archivos) {
    const { data: s, error: e } = await supabase.storage.from(BUCKET).createSignedUploadUrl(`${CARPETA}/${id}/${archivoSubido(lector, archivo)}.json`, { upsert: true });
    if (e || !s) return `No se pudo preparar la subida (${e?.message ?? "sin detalle"}).`;
    urls[archivo] = s.signedUrl;
  }
  return urls;
}

/** Una actualización que sigue en curso (para retomarla) o null. */
async function enCurso(supabase: ReturnType<typeof createServiceClient>, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await supabase.from("dropi_actualizaciones").select("estado, pedidas").eq("id", id).maybeSingle();
  return data && data.estado === "corriendo" ? { pedidas: (data.pedidas as string[]).filter(esParte) } : null;
}

/**
 * Para retomar una actualización que quedó a medias (27 oct 2026: se recargó la página o la extensión y se perdió el avance):
 * qué archivos ya subió la extensión.
 */
export async function archivosSubidos(id: string): Promise<{ error?: string; archivos?: string[] }> {
  await usuarioPermitido();
  const supabase = createServiceClient();
  if (!(await enCurso(supabase, id))) return { error: "Esa actualización ya terminó." };
  const { data } = await supabase.storage.from(BUCKET).list(`${CARPETA}/${id}`, { limit: 100 });
  return { archivos: (data ?? []).map((a) => a.name.replace(/\.json$/, "")) };
}

/** Direcciones de subida nuevas para volver a leer un lector de una actualización que sigue en curso (las primeras se perdieron al recargar). */
export async function subidasDeLector(id: string, lector: string): Promise<{ error?: string; subida?: Record<string, string> }> {
  await usuarioPermitido();
  const supabase = createServiceClient();
  const c = await enCurso(supabase, id);
  if (!c) return { error: "Esa actualización ya terminó." };
  if (!Object.hasOwn(LECTORES, lector) || !lectoresDe(c.pedidas).includes(lector as ClaveLector)) return { error: "Pedido no válido." };
  const urls = await firmarSubidas(supabase, id, lector as ClaveLector);
  return typeof urls === "string" ? { error: urls } : { subida: urls };
}

async function bajar<T>(supabase: ReturnType<typeof createServiceClient>, id: string, archivo: string): Promise<T> {
  const { data, error } = await supabase.storage.from(BUCKET).download(`${CARPETA}/${id}/${archivo}.json`);
  if (error || !data) throw new Error(`No llegó la lectura «${archivo}» de Dropi.`);
  return JSON.parse(Buffer.from(await data.arrayBuffer()).toString("utf8")) as T;
}

async function guardarParte(supabase: ReturnType<typeof createServiceClient>, id: string, parte: ClaveParte, valor: Record<string, unknown>) {
  const { data } = await supabase.from("dropi_actualizaciones").select("partes").eq("id", id).single();
  const partes = { ...((data?.partes as Record<string, unknown> | null) ?? {}), [parte]: { ...valor, fin: new Date().toISOString() } };
  await supabase.from("dropi_actualizaciones").update({ partes }).eq("id", id);
}

const n = (x: number) => x.toLocaleString("es-PA");

/** Procesa una parte con lo que subió la extensión. Devuelve el resumen para el panel (y lo deja anotado). */
export async function procesarParte(id: string, parte: string): Promise<{ error?: string; resumen?: string; avisos?: string[] }> {
  await usuarioPermitido();
  if (!UUID.test(id) || !esParte(parte)) return { error: "Pedido no válido." };
  const supabase = createServiceClient();
  const { data: fila } = await supabase.from("dropi_actualizaciones").select("estado, pedidas").eq("id", id).maybeSingle();
  if (!fila || fila.estado !== "corriendo" || !(fila.pedidas as string[]).includes(parte)) return { error: "Esa actualización ya terminó." };
  const avisos: string[] = [];
  const log = (t: string) => avisos.push(t);
  // De qué país es la parte y con qué nombre subió la extensión cada archivo («pedidos» de Panamá, «pedidoscr» de Costa Rica).
  const p = parteDe(parte);
  const codigo = p.pais.toUpperCase();
  const archivo = (a: string) => archivoSubido(p.lector, a);
  try {
    let resumen = "";
    let datos: Record<string, unknown> = {};
    if (p.tipo === "pedidos") {
      const l = await bajar<{ desde: string; hasta: string; pedidos: PedidoDropi[] }>(supabase, id, archivo("pedidos"));
      const r = await ingerirPedidos(supabase, codigo, l.pedidos, log);
      resumen = `${n(r.leidos)} pedidos del ${l.desde} al ${l.hasta}${r.crm !== null ? ` · ${n(r.crm)} del CRM al día` : ""}`;
      datos = r;
    } else if (p.tipo === "cartera") {
      const r = await ingerirCartera(supabase, codigo, await bajar<FilaCartera[]>(supabase, id, archivo("cartera")));
      resumen = `${n(r.movimientos)} movimientos`;
      datos = r;
    } else if (p.tipo === "retiros") {
      const r = await ingerirRetiros(supabase, codigo, await bajar<FilaRetiro[]>(supabase, id, archivo("retiros")), log);
      resumen = [`${n(r.vinculadosAhora)} vinculados ahora`, r.sinVincular ? `${n(r.sinVincular)} sin vincular` : "", r.saldo !== null ? `saldo $${r.saldo.toFixed(2)}` : ""].filter(Boolean).join(" · ");
      datos = r;
    } else if (p.tipo === "stock") {
      const r = (await guardarNuestrosProductos(supabase, await bajar<LecturaNuestros>(supabase, id, archivo("stock")), true, FOTOS_POR_VEZ)) as unknown as Record<string, unknown>;
      const creadas = Array.isArray(r.creadasPrimeraCarga) ? r.creadasPrimeraCarga.length : 0;
      resumen = `${n(Number(r.productos ?? 0))} productos (${n(Number(r.activos ?? 0))} activos)${creadas ? ` · ${n(creadas)} publicaciones creadas (primera carga)` : ""}`;
      datos = { productos: r.productos, activos: r.activos, archivados: r.archivados };
      // La sesión de proveedor del país funcionó: lo mismo que marca la tarea diaria.
      await supabase.from("dropi_sesiones").upsert({ pais_codigo: codigo, tipo: "proveedor", renovada_en: new Date().toISOString(), ok: true, mensaje: "Actualizar Dropi" });
    } else {
      const r = await ingerirVentas(supabase, await bajar<MovimientosDropi>(supabase, id, archivo("movimientos")), await bajar<ResumenDropi>(supabase, id, archivo("resumen")), log, codigo);
      resumen = `corte ${r.corte} · ${n(r.productos)} productos · ${n(r.movimientos)} movimientos`;
      datos = r;
    }
    await guardarParte(supabase, id, parte, { estado: "listo", resumen, avisos: avisos.slice(0, 20), datos });
    return { resumen, avisos };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await guardarParte(supabase, id, parte, { estado: "error", error: error.slice(0, 300), avisos: avisos.slice(0, 20) });
    return { error };
  }
}

/** Anota que las partes de un lector no se pudieron leer en Dropi (la sesión venció, Dropi respondió con error…). */
export async function marcarPartesConError(id: string, partes: unknown, error: string): Promise<void> {
  await usuarioPermitido();
  if (!UUID.test(id)) return;
  const supabase = createServiceClient();
  for (const p of (Array.isArray(partes) ? partes : []).filter(esParte)) await guardarParte(supabase, id, p, { estado: "error", error: String(error).slice(0, 300) });
}

/** Cierra la actualización (lista, con fallos o detenida), borra los archivos temporales y refresca las pantallas. */
export async function terminarActualizacion(id: string, detenida = false): Promise<{ estado?: string }> {
  await usuarioPermitido();
  if (!UUID.test(id)) return {};
  const supabase = createServiceClient();
  const { data } = await supabase.from("dropi_actualizaciones").select("pedidas, partes").eq("id", id).maybeSingle();
  if (!data) return {};
  const partes = (data.partes ?? {}) as Record<string, { estado?: string }>;
  const todas = (data.pedidas as string[]).every((p) => partes[p]?.estado === "listo");
  const estado = detenida ? "detenido" : todas ? "listo" : "con_fallos";
  await supabase.from("dropi_actualizaciones").update({ estado, fin: new Date().toISOString() }).eq("id", id);
  const { data: archivos } = await supabase.storage.from(BUCKET).list(`${CARPETA}/${id}`, { limit: 100 });
  if (archivos?.length) await supabase.storage.from(BUCKET).remove(archivos.map((a) => `${CARPETA}/${id}/${a.name}`));
  for (const p of PARTES) revalidatePath(p.ruta);
  revalidatePath("/publicaciones-dropi/actualizar");
  return { estado };
}
