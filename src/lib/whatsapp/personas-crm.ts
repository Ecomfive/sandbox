// Quiénes tienen acceso a ciertos módulos (por su rol o por permisos propios), para avisarles o para saber quién puede autorizar algo. Recibe el cliente de
// Supabase y usa rutas relativas porque también lo usa `scripts/`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { armarPersonasConAcceso, type PerfilConRol, type PermisoDeRol, type PermisoPropioDeModulo } from "../acceso-seccion";

/** Las personas activas con acceso a alguno de los módulos; `soloLectura` solo si en todos los que tienen es de solo lectura. */
export async function personasConModulos(supabase: SupabaseClient, modulos: string[]): Promise<{ id: string; nombre: string; soloLectura: boolean }[]> {
  const [perfiles, permisos, propios, roles] = await Promise.all([
    supabase.from("perfiles").select("id, nombre, email, avatar_url, rol_id, activo"),
    supabase.from("permisos_rol").select("rol_id, modulo, solo_lectura").in("modulo", modulos),
    supabase.from("permisos_persona").select("perfil_id, modulo, nivel").in("modulo", modulos),
    supabase.from("roles").select("id, nombre"),
  ]);
  const nombres = new Map((roles.data ?? []).map((r) => [r.id as string, r.nombre as string]));
  const salida = new Map<string, { id: string; nombre: string; soloLectura: boolean }>();
  for (const modulo of modulos) {
    const deRol: PermisoDeRol[] = (permisos.data ?? [])
      .filter((p) => p.modulo === modulo)
      .map((p) => ({ rol_id: p.rol_id as string, solo_lectura: !!p.solo_lectura, rol: nombres.get(p.rol_id as string) ?? "" }));
    const propiosDe = (propios.error ? [] : (propios.data ?? []).filter((p) => p.modulo === modulo)) as PermisoPropioDeModulo[];
    for (const p of armarPersonasConAcceso((perfiles.data ?? []) as PerfilConRol[], deRol, propiosDe, nombres)) {
      const antes = salida.get(p.id);
      salida.set(p.id, { id: p.id, nombre: p.nombre ?? p.email, soloLectura: antes ? antes.soloLectura && p.soloLectura : p.soloLectura });
    }
  }
  return [...salida.values()];
}
