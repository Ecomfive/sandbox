import "server-only";

// La huella de las fotos del catálogo de la competencia que todavía no la tienen (24 nov 2026): la misma cuenta que hacía el receptor de scripts
// (scripts/scraping-proveedores.ts › calcularHuellas), ahora en el servidor para «Drop: competencia» de Datos. Con tope de tiempo: lo que no alcance se hace en
// la próxima lectura.

import type { SupabaseClient } from "@supabase/supabase-js";
import { huellaFoto } from "@/lib/wms/huella-foto";

/** Calcula y guarda la huella de las fotos sin huella de esa tabla (filtradas por `columna = filtro`), de 8 en 8, hasta `hastaMs`. Devuelve cuántas guardó. */
export function huellasCatalogo(supabase: SupabaseClient, hastaMs: number) {
  return async (filtro: string, tabla: string, columna: string): Promise<number> => {
    const cola: { id: string; foto_url: string | null }[] = [];
    for (let desde = 0; ; desde += 1000) {
      const { data, error } = await supabase.from(tabla).select("id, foto_url").eq(columna, filtro).not("foto_url", "is", null).is("foto_huella", null).order("id").range(desde, desde + 999);
      if (error) return 0;
      cola.push(...((data ?? []) as { id: string; foto_url: string | null }[]));
      if ((data ?? []).length < 1000) break;
    }
    let hechas = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (let f = cola.shift(); f && Date.now() < hastaMs; f = cola.shift()) {
          try {
            const r = await fetch(f.foto_url!, { signal: AbortSignal.timeout(15_000) });
            if (!r.ok) continue;
            const huella = await huellaFoto(new Uint8Array(await r.arrayBuffer()));
            if (huella && !(await supabase.from(tabla).update({ foto_huella: huella }).eq("id", f.id)).error) hechas++;
          } catch {
            // Una foto que no baja se intenta en la próxima lectura.
          }
        }
      }),
    );
    return hechas;
  };
}
