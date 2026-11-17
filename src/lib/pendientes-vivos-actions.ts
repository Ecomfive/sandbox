"use server";

import { getUsuarioActual } from "@/lib/auth";
import { contarParaTi } from "@/lib/menciones";
import type { PendientesPersonales } from "@/lib/pendientes-vivos";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Lo personal que el menú vuelve a preguntar cada 30 segundos (17 nov 2026): los avisos «Para ti» sin leer (el número de «Avisos») y las tareas del equipo asignadas sin cerrar (la campana).
 * Solo del propio usuario. Nunca falla: sin sesión o sin red devuelve null y el menú deja lo que ya tenía.
 */
export async function pendientesPersonales(): Promise<PendientesPersonales | null> {
  try {
    const u = await getUsuarioActual();
    if (!u) return null;
    const supabase = createServiceClient();
    const [paraTi, tareasMias] = await Promise.all([
      contarParaTi(u.id).catch(() => 0),
      u.modulos.includes("tareas")
        ? Promise.resolve(supabase.from("tareas_equipo").select("id", { count: "exact", head: true }).eq("responsable_id", u.id).not("estado", "in", "(hecho,archivado)")).then(
            (r) => (r.error ? 0 : (r.count ?? 0)),
            () => 0,
          )
        : 0,
    ]);
    return { paraTi, tareasMias };
  } catch {
    return null;
  }
}
