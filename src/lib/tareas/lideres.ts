import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";

/**
 * Quién asigna una tarea a otra persona (9 nov 2026, pedido de Hernán: «también los líderes»): un administrador, un rol cuyo nombre empieza con «Líder»
 * (Líder comercial) o una persona marcada en Configuración › «Líderes: asignan tareas» (`perfiles.lider_tareas`, migración 0263).
 */
export const esRolLider = (rolNombre: string | null | undefined) => /^l[ií]der\b/i.test((rolNombre ?? "").trim());

export async function puedeAsignarTareas(supabase: SupabaseClient, usuario: UsuarioActual): Promise<boolean> {
  if (esAdministrador(usuario) || esRolLider(usuario.rolNombre)) return true;
  // Sin la migración 0263 la columna no está: nadie más.
  const { data, error } = await supabase.from("perfiles").select("lider_tareas").eq("id", usuario.id).maybeSingle();
  return !error && !!data?.lider_tareas;
}
