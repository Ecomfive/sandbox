// Guarda en Supabase los lotes de costo y el mapeo Dropi leídos del Excel (ver `costos-excel.ts`). Lo usan la pantalla
// de importación de Costos de mercancía (por lotes, desde Server Actions) y el script CLI. No decide permisos.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizar } from "./clasificacion";
import type { LoteCosto, MapeoDropi } from "./costos-excel";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const CLAVE = /^[0-9a-f]{24}#\d{1,5}$/;
const txt = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown, max = 1_000_000) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
};

/** Revisa un lote que llega del navegador. */
export function validarLote(v: unknown): LoteCosto | null {
  if (!v || typeof v !== "object") return null;
  const l = v as Record<string, unknown>;
  const producto = txt(l.producto, 300);
  const costo = num(l.costo_total, 100_000);
  const clave = l.origen_clave;
  if (!producto || !costo || costo <= 0 || typeof clave !== "string" || !CLAVE.test(clave)) return null;
  const cantidad = num(l.cantidad, 10_000_000);
  return {
    hoja: txt(l.hoja, 80) ?? "EXCEL",
    fila: Number.isInteger(l.fila) ? (l.fila as number) : 0,
    linea: normalizar(txt(l.linea, 40) ?? "OTRA") || "OTRA",
    fecha_llegada: typeof l.fecha_llegada === "string" && FECHA.test(l.fecha_llegada) ? l.fecha_llegada : null,
    mes_texto: txt(l.mes_texto, 40),
    proveedor: txt(l.proveedor, 120),
    seguimiento: txt(l.seguimiento, 160),
    producto,
    producto_clave: normalizar(txt(l.producto_clave, 300) ?? producto),
    codigo: txt(l.codigo, 60),
    cantidad: cantidad && cantidad > 0 ? cantidad : null,
    costo_unitario: num(l.costo_unitario, 100_000) ?? 0,
    comisiones: num(l.comisiones, 100_000) ?? 0,
    impuesto: num(l.impuesto, 100_000) ?? 0,
    envio: num(l.envio, 100_000) ?? 0,
    financiamiento: num(l.financiamiento, 100_000) ?? 0,
    costo_total: costo,
    estatus: txt(l.estatus, 60),
    origen_clave: clave,
  };
}

/** Revisa una fila del mapeo Dropi que llega del navegador. */
export function validarMapeo(v: unknown): MapeoDropi | null {
  if (!v || typeof v !== "object") return null;
  const m = v as Record<string, unknown>;
  const dropi = txt(m.producto_dropi, 300);
  if (!dropi) return null;
  const costo = txt(m.producto_costo, 300);
  const estado = m.estado === "mapeado" || m.estado === "sugerido" ? m.estado : "pendiente";
  return { producto_dropi: dropi, producto_costo: costo, producto_clave: costo ? normalizar(costo) : null, estado: costo ? estado : "pendiente", notas: txt(m.notas, 300) };
}

export async function guardarLotes(supabase: SupabaseClient, origen: string, lotes: LoteCosto[]): Promise<number> {
  if (!lotes.length) return 0;
  const ahora = new Date().toISOString();
  const { error } = await supabase.from("fin_costos_lotes").upsert(
    lotes.map(({ ...l }) => ({ ...l, origen, actualizado_en: ahora })),
    { onConflict: "origen_clave" },
  );
  if (error) throw new Error(`fin_costos_lotes: ${error.message}`);
  return lotes.length;
}

/** Guarda el mapeo. Un mapeo hecho en el portal (no «pendiente») no lo pisa un Excel que lo traiga pendiente. */
export async function guardarMapeo(supabase: SupabaseClient, filas: MapeoDropi[]): Promise<number> {
  if (!filas.length) return 0;
  const claves = filas.map((f) => normalizar(f.producto_dropi));
  const existentes = new Map<string, string>();
  for (let i = 0; i < claves.length; i += 100) {
    const { data } = await supabase.from("fin_costos_mapeo").select("producto_dropi_clave, estado").in("producto_dropi_clave", claves.slice(i, i + 100));
    for (const r of data ?? []) existentes.set(r.producto_dropi_clave as string, r.estado as string);
  }
  const ahora = new Date().toISOString();
  const aGuardar = filas
    .filter((f) => !(f.estado === "pendiente" && existentes.get(normalizar(f.producto_dropi)) === "mapeado"))
    .map((f) => ({
      producto_dropi: f.producto_dropi,
      producto_dropi_clave: normalizar(f.producto_dropi),
      producto_clave: f.producto_clave,
      estado: f.estado,
      notas: f.notas,
      actualizado_en: ahora,
    }));
  if (!aGuardar.length) return 0;
  const { error } = await supabase.from("fin_costos_mapeo").upsert(aGuardar, { onConflict: "producto_dropi_clave" });
  if (error) throw new Error(`fin_costos_mapeo: ${error.message}`);
  return aGuardar.length;
}

/** Quita los lotes de esta hoja que ya no están en el archivo (solo los que vinieron de ese mismo archivo). */
export async function cerrarLotes(supabase: SupabaseClient, origen: string, hoja: string, claves: Set<string>): Promise<number> {
  const sobran: string[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase
      .from("fin_costos_lotes")
      .select("id, origen_clave")
      .eq("origen", origen)
      .eq("hoja", hoja)
      .order("id")
      .range(desde, desde + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) if (!claves.has(r.origen_clave as string)) sobran.push(r.id as string);
    if (!data || data.length < 1000) break;
  }
  for (let i = 0; i < sobran.length; i += 200) {
    const { error } = await supabase.from("fin_costos_lotes").delete().in("id", sobran.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }
  return sobran.length;
}
