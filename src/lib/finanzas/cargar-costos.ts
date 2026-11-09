// Lecturas de Costos de mercancía: costo vigente por producto, lotes y el mapeo Dropi ↔ producto de costo con
// Productos y márgenes. Solo lectura; los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { normalizar } from "./clasificacion";

export interface FilaCostoProducto {
  clave: string;
  producto: string;
  linea: string;
  costoVigente: number;
  costoPromedio: number | null;
  minimo: number;
  maximo: number;
  lotes: number;
  unidades: number | null;
  llegada: string | null;
  mes: string | null;
  proveedor: string | null;
  /** Vigente contra promedio, en %: cuánto subió o bajó el último lote. */
  variacion: number | null;
}

export async function cargarCostosVigentes(supabase: SupabaseClient): Promise<{ error: string } | { filas: FilaCostoProducto[] }> {
  const r = await traerTodasConError<Record<string, unknown>>((d, h) =>
    supabase.from("fin_costo_vigente").select("*").order("producto_clave").range(d, h),
  );
  if (r.error) return { error: "Falta correr la migración 0908 (costos de mercancía)." };
  return {
    filas: (r.data ?? []).map((v) => {
      const vigente = Number(v.costo_vigente);
      const promedio = v.costo_promedio === null ? null : Number(v.costo_promedio);
      return {
        clave: String(v.producto_clave),
        producto: String(v.producto),
        linea: String(v.linea),
        costoVigente: vigente,
        costoPromedio: promedio,
        minimo: Number(v.costo_minimo),
        maximo: Number(v.costo_maximo),
        lotes: Number(v.lotes),
        unidades: v.unidades === null ? null : Number(v.unidades),
        llegada: (v.fecha_llegada as string | null) ?? null,
        mes: (v.mes_texto as string | null) ?? null,
        proveedor: (v.proveedor as string | null) ?? null,
        variacion: promedio && promedio > 0 ? ((vigente - promedio) / promedio) * 100 : null,
      };
    }),
  };
}

export interface FilaMapeo {
  clave: string;
  productoDropi: string;
  /** Filas de Productos y márgenes con ese nombre (puede haber una por país/plataforma). */
  productos: { id: string; pais: string; costo: number | null }[];
  productoCosto: string | null;
  productoCostoClave: string | null;
  estado: "Mapeado" | "Sugerido" | "Sin costo";
  costoReal: number | null;
  /** Costo actual en Productos y márgenes (el de la primera fila). */
  costoActual: number | null;
  diferencia: number | null;
}

/** Palabras con significado de un nombre (sin números sueltos ni palabras cortas). */
const palabras = (s: string) => new Set(normalizar(s).split(" ").filter((p) => p.length >= 3 && !/^\d+$/.test(p)));

/** El producto de costo más parecido a un nombre de Dropi: mismo nombre, o al menos 60 % de palabras en común. */
export function sugerirProductoCosto(nombre: string, productos: { clave: string }[]): string | null {
  const clave = normalizar(nombre);
  if (productos.some((p) => p.clave === clave)) return clave;
  const a = palabras(nombre);
  if (a.size < 2) return null;
  let mejor: { clave: string; puntaje: number } | null = null;
  for (const p of productos) {
    const b = palabras(p.clave);
    if (b.size < 2) continue;
    let comunes = 0;
    for (const x of a) if (b.has(x)) comunes++;
    const puntaje = comunes / Math.max(a.size, b.size);
    if (comunes >= 2 && puntaje >= 0.6 && (!mejor || puntaje > mejor.puntaje)) mejor = { clave: p.clave, puntaje };
  }
  return mejor?.clave ?? null;
}

export async function cargarMapeo(
  supabase: SupabaseClient,
  vigentes: FilaCostoProducto[],
): Promise<{ error: string } | { filas: FilaMapeo[] }> {
  const [mapeo, productos, paises] = await Promise.all([
    supabase.from("fin_costos_mapeo").select("producto_dropi, producto_dropi_clave, producto_clave, estado"),
    traerTodasConError<{ id: string; nombre: string; costo: number | null; pais_id: string }>((d, h) =>
      supabase.from("productos").select("id, nombre, costo, pais_id").order("id").range(d, h),
    ),
    supabase.from("paises").select("id, codigo"),
  ]);
  if (mapeo.error) return { error: "Falta correr la migración 0908 (costos de mercancía)." };
  const codigoPais = new Map((paises.data ?? []).map((p) => [p.id as string, p.codigo as string]));
  const porClave = new Map(vigentes.map((v) => [v.clave, v]));
  const filas = new Map<string, FilaMapeo>();
  const fila = (nombre: string): FilaMapeo => {
    const clave = normalizar(nombre);
    let f = filas.get(clave);
    if (!f) {
      f = { clave, productoDropi: nombre, productos: [], productoCosto: null, productoCostoClave: null, estado: "Sin costo", costoReal: null, costoActual: null, diferencia: null };
      filas.set(clave, f);
    }
    return f;
  };
  for (const p of productos.data ?? []) {
    fila(p.nombre).productos.push({ id: p.id, pais: codigoPais.get(p.pais_id) ?? "", costo: p.costo === null ? null : Number(p.costo) });
  }
  for (const m of mapeo.data ?? []) {
    const f = fila(String(m.producto_dropi));
    if (m.producto_clave && m.estado === "mapeado" && porClave.has(m.producto_clave as string)) {
      f.productoCostoClave = m.producto_clave as string;
      f.estado = "Mapeado";
    }
  }
  for (const f of filas.values()) {
    if (!f.productoCostoClave) {
      const s = sugerirProductoCosto(f.productoDropi, vigentes);
      if (s) {
        f.productoCostoClave = s;
        f.estado = "Sugerido";
      }
    }
    const v = f.productoCostoClave ? porClave.get(f.productoCostoClave) : undefined;
    f.productoCosto = v?.producto ?? null;
    f.costoReal = v?.costoVigente ?? null;
    f.costoActual = f.productos[0]?.costo ?? null;
    f.diferencia = f.costoReal !== null && f.costoActual !== null ? f.costoReal - f.costoActual : null;
  }
  return { filas: [...filas.values()].sort((a, b) => a.productoDropi.localeCompare(b.productoDropi)) };
}
