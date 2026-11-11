"use server";

// «Comparar con lo cargado» de los importadores que no son el libro (el libro usa `leerCargadoDelArchivo`). Solo lee:
// pide poder modificar el módulo (es el paso previo a cargar) y devuelve lo guardado en la forma de la comparación. El
// alcance sale de `TABLAS_COMPARAR` (`comparar.ts`), el mismo que usa cada carga para borrar lo que ya no vino.

import { requireModuloEscritura } from "@/lib/auth";
import type { FilaComparable } from "@/lib/finanzas/comparar-libro";
import { origenDeArchivo } from "@/lib/finanzas/guardar-libro";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import { MAX_CLAVES_COMPARAR, TABLAS_COMPARAR, esModuloComparable } from "./comparar";
const MAX_FILAS = 20_000;

const hojasValidas = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((h): h is string => typeof h === "string" && h.length > 0 && h.length <= 120).slice(0, 50) : [];
const clavesValidas = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((c): c is string => typeof c === "string" && c.length > 0 && c.length <= 200))].slice(0, MAX_CLAVES_COMPARAR) : [];

export async function leerCargadoParaComparar(
  modulo: string,
  archivo: string,
  opciones: { hojas?: string[]; claves?: string[] } = {},
): Promise<{ error: string } | { filas: FilaComparable[]; recortado: boolean }> {
  try {
    if (!esModuloComparable(modulo)) return { error: "Ese importador no se puede comparar." };
    await requireModuloEscritura(modulo);
    const supabase = createServiceClient();
    const origen = origenDeArchivo(String(archivo ?? ""));
    const hojas = hojasValidas(opciones?.hojas);
    const claves = clavesValidas(opciones?.claves);
    const filas: FilaComparable[] = [];
    let recortado = false;
    for (const t of TABLAS_COMPARAR[modulo]) {
      if (t.alcance === "claves" && !claves.length) continue;
      if ((t.alcance === "hojas_cartera" || t.alcance === "archivo_hojas") && !hojas.length) continue;
      const r = await traerTodasConError<Record<string, unknown>>((d, h) => {
        let q = supabase.from(t.tabla).select(`id, ${t.clave}, ${t.columnas}`).not(t.clave, "is", null);
        for (const [c, v] of Object.entries(t.filtro ?? {})) q = q.eq(c, v);
        if (t.alcance === "claves") q = q.in(t.clave, claves);
        else if (t.alcance === "hojas_cartera") q = q.in("origen_hoja", hojas);
        else if (t.alcance === "archivo_hojas") q = q.eq("origen", origen).in("hoja", hojas);
        else q = q.eq("origen", origen);
        return q.order("id").range(d, h) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>;
      });
      if (r.error) return { error: "No se pudo leer lo cargado." };
      for (const x of r.data ?? []) {
        if (filas.length >= MAX_FILAS) {
          recortado = true;
          break;
        }
        filas.push(t.fila(x));
      }
    }
    return { filas, recortado };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo comparar." };
  }
}
