// Los comprobantes y adjuntos que están en Monday (16 nov 2026, pedido de Hernán: «que el botón Ver no me mande a Monday, sino que lo muestre ahí
// mismo en el sistema»). Monday los guarda como `https://<cuenta>.monday.com/protected_static/<cuenta>/resources/<id>/<archivo>`, que solo abre con
// sesión en Monday. Con el token del servidor, la API da por cada id un enlace temporal (1 hora) para bajarlo. Así:
//   * al mirar un comprobante, si ya hay copia en el sistema se muestra la copia; si no, el enlace temporal, y se guarda una copia;
//   * cada lectura de Monday copia, mientras le quede tiempo, los de los repartos de los últimos 30 días (para verlos aunque Monday no responda).
// Las copias van al bucket privado `despacho-comprobantes`, en `monday/<id>.<ext>`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { consultarMonday, mondayConfigurado } from "./sincronizar";

export const BUCKET_COMPROBANTES = "despacho-comprobantes";
const DIAS_COPIA = 30;

export interface AssetMonday {
  id: string;
  ext: string;
}

/** El id y la extensión de un archivo de Monday a partir de su enlace (o null si no es uno). */
export function assetDeUrl(url: string): AssetMonday | null {
  const m = /^https:\/\/[a-z0-9-]+\.monday\.com\/protected_static\/\d+\/resources\/(\d{1,20})\/[^?#]*?\.([A-Za-z0-9]{2,5})(?:[?#].*)?$/.exec(url.trim());
  return m ? { id: m[1], ext: m[2].toLowerCase() } : null;
}

export const rutaCopia = (a: AssetMonday) => `monday/${a.id}.${a.ext === "jpeg" ? "jpg" : a.ext}`;

const TIPOS: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", pdf: "application/pdf" };

export type ClaseArchivo = "imagen" | "pdf" | "otro";
/** Qué es un archivo por su extensión: las fotos HEIC no se ven en todos los navegadores, así que van como «otro» (se descargan). */
export function claseDe(ext: string): ClaseArchivo {
  const e = ext.toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(e)) return "imagen";
  if (e === "pdf") return "pdf";
  return "otro";
}

/** Los enlaces temporales (1 hora) de varios archivos de Monday. Sin token, vacío. */
export async function enlacesMonday(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  if (!ids.length || !mondayConfigurado()) return mapa;
  for (let i = 0; i < ids.length; i += 50) {
    const json = (await consultarMonday("query ($ids: [ID!]!) { assets(ids: $ids) { id public_url } }", { ids: ids.slice(i, i + 50) }).catch(() => null)) as {
      data?: { assets?: { id: string | number; public_url: string | null }[] };
    } | null;
    for (const a of json?.data?.assets ?? []) if (a.public_url) mapa.set(String(a.id), a.public_url);
  }
  return mapa;
}

/** Baja un archivo de Monday y guarda la copia en el sistema. Devuelve si quedó guardado. */
export async function copiarAsset(supabase: SupabaseClient, a: AssetMonday, enlace: string): Promise<boolean> {
  const r = await fetch(enlace, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!r?.ok) return false;
  const datos = await r.arrayBuffer();
  if (!datos.byteLength || datos.byteLength > 10 * 1024 * 1024) return false;
  const { error } = await supabase.storage.from(BUCKET_COMPROBANTES).upload(rutaCopia(a), datos, { contentType: TIPOS[a.ext] ?? "application/octet-stream", upsert: true });
  return !error;
}

/** De estas rutas, cuáles ya tienen copia, con su enlace firmado (10 minutos). */
async function firmadas(supabase: SupabaseClient, rutas: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  for (let i = 0; i < rutas.length; i += 100) {
    const { data } = await supabase.storage.from(BUCKET_COMPROBANTES).createSignedUrls(rutas.slice(i, i + 100), 600);
    for (const d of data ?? []) if (d.signedUrl && !d.error && d.path) mapa.set(d.path, d.signedUrl);
  }
  return mapa;
}

export interface ArchivoVisible {
  url: string;
  clase: ClaseArchivo;
  nombre: string;
}

/**
 * Los archivos listos para verse en el sistema, en el mismo orden: los subidos al sistema (`storage:<ruta>`, del `bucket` dado) con su enlace firmado;
 * los de Monday, con la copia si la hay o con el enlace temporal de Monday. Devuelve también los de Monday que aún no tienen copia (para copiarlos
 * después de responder). Lo que no se puede abrir se omite.
 */
export async function archivosVisibles(
  supabase: SupabaseClient,
  lista: string[],
  bucket: string,
): Promise<{ archivos: ArchivoVisible[]; porCopiar: { asset: AssetMonday; enlace: string }[] }> {
  const r = await resolverArchivos(supabase, lista, bucket);
  return { archivos: r.alineados.filter((x): x is ArchivoVisible => !!x), porCopiar: r.porCopiar };
}

/** Los archivos de varias filas de una vez (una sola consulta a Monday), cada fila con los suyos. */
export async function archivosPorFila(
  supabase: SupabaseClient,
  filas: { id: string; lista: string[] }[],
  bucket: string,
): Promise<{ porFila: Map<string, ArchivoVisible[]>; porCopiar: { asset: AssetMonday; enlace: string }[] }> {
  const todo = filas.flatMap((f) => f.lista);
  const r = await resolverArchivos(supabase, todo, bucket);
  const porFila = new Map<string, ArchivoVisible[]>();
  let i = 0;
  for (const f of filas) {
    porFila.set(f.id, r.alineados.slice(i, i + f.lista.length).filter((x): x is ArchivoVisible => !!x));
    i += f.lista.length;
  }
  return { porFila, porCopiar: r.porCopiar };
}

/** Cada archivo de la lista, en el mismo orden (null si no se puede abrir). */
async function resolverArchivos(
  supabase: SupabaseClient,
  lista: string[],
  bucket: string,
): Promise<{ alineados: (ArchivoVisible | null)[]; porCopiar: { asset: AssetMonday; enlace: string }[] }> {
  const propias = lista.filter((x) => x.startsWith("storage:")).map((x) => x.slice(8));
  const deMonday = lista.map((x) => (x.startsWith("storage:") ? null : assetDeUrl(x))).filter((x): x is AssetMonday => !!x);
  const [firmasPropias, copias] = await Promise.all([
    (async () => {
      const mapa = new Map<string, string>();
      if (!propias.length) return mapa;
      const { data } = await supabase.storage.from(bucket).createSignedUrls(propias, 600);
      for (const d of data ?? []) if (d.signedUrl && !d.error && d.path) mapa.set(d.path, d.signedUrl);
      return mapa;
    })(),
    firmadas(supabase, deMonday.map(rutaCopia)),
  ]);
  const faltan = deMonday.filter((a) => !copias.has(rutaCopia(a)));
  const enlaces = await enlacesMonday([...new Set(faltan.map((a) => a.id))]);
  const alineados = lista.map((x): ArchivoVisible | null => {
    if (x.startsWith("storage:")) {
      const ruta = x.slice(8);
      const url = firmasPropias.get(ruta);
      return url ? { url, clase: claseDe(ruta.split(".").pop() ?? ""), nombre: ruta.split("/").pop() ?? "archivo" } : null;
    }
    const a = assetDeUrl(x);
    const url = a ? (copias.get(rutaCopia(a)) ?? enlaces.get(a.id)) : undefined;
    if (!a || !url) return null;
    let nombre = x.split("/").pop() ?? "archivo";
    try {
      nombre = decodeURIComponent(nombre);
    } catch {
      // un nombre con «%» suelto queda como vino
    }
    return { url, clase: claseDe(a.ext), nombre };
  });
  const unicos = new Map(faltan.filter((a) => enlaces.has(a.id)).map((a) => [a.id, { asset: a, enlace: enlaces.get(a.id)! }]));
  return { alineados, porCopiar: [...unicos.values()] };
}

/** Copia los que faltan (para llamarla después de responder). */
export async function copiarPendientes(supabase: SupabaseClient, porCopiar: { asset: AssetMonday; enlace: string }[]): Promise<void> {
  for (const p of porCopiar.slice(0, 20)) await copiarAsset(supabase, p.asset, p.enlace).catch(() => false);
}

/**
 * Copia al sistema los comprobantes de Monday de los repartos de los últimos 30 días que aún no tienen copia, mientras quede tiempo antes de `limite`.
 * Devuelve qué hizo ("" si nada).
 */
export async function copiarComprobantesRecientes(supabase: SupabaseClient, limite: number): Promise<string> {
  if (!mondayConfigurado() || Date.now() > limite - 6_000) return "";
  const desde = new Date(Date.now() - DIAS_COPIA * 86_400_000).toISOString().slice(0, 10);
  const assets = new Map<string, AssetMonday>();
  for (let d = 0; ; d += 1000) {
    const { data, error } = await supabase.from("mon_despachos").select("comprobantes").gte("fecha_despacho", desde).neq("comprobantes", "{}").order("item_id").range(d, d + 999);
    if (error) return "";
    for (const r of (data ?? []) as { comprobantes: string[] | null }[]) for (const u of r.comprobantes ?? []) {
      const a = assetDeUrl(u);
      if (a) assets.set(rutaCopia(a), a);
    }
    if ((data ?? []).length < 1000) break;
  }
  if (!assets.size) return "";
  const ya = await firmadas(supabase, [...assets.keys()]);
  const faltan = [...assets.entries()].filter(([ruta]) => !ya.has(ruta)).map(([, a]) => a);
  let copiados = 0;
  for (let i = 0; i < faltan.length && Date.now() < limite - 5_000; i += 25) {
    const tanda = faltan.slice(i, i + 25);
    const enlaces = await enlacesMonday(tanda.map((a) => a.id));
    for (const a of tanda) {
      if (Date.now() > limite - 3_000) break;
      const enlace = enlaces.get(a.id);
      if (enlace && (await copiarAsset(supabase, a, enlace))) copiados++;
    }
  }
  if (!copiados) return "";
  const quedan = faltan.length - copiados;
  return `Comprobantes: ${copiados} copiados al sistema${quedan > 0 ? `, faltan ${quedan}` : ""}.`;
}
