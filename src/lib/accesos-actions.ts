"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { armarPersonasConAcceso, type AccesoSeccion, type PerfilConRol, type PermisoDeRol } from "@/lib/acceso-seccion";
import { MODULOS } from "@/lib/modulos";
import { moduloDeHref } from "@/lib/nav-data";

/**
 * Quién tiene acceso a la sección (módulo) que contiene esta ruta. Solo lo ve quien ya tiene acceso a
 * ese módulo, y es solo lectura: dar acceso sigue haciéndose en Usuarios y roles.
 */
export async function obtenerAccesoSeccion(moduloHref: string): Promise<AccesoSeccion> {
  const usuario = await getUsuarioActual();
  if (!usuario) throw new Error("No hay sesión activa.");

  const clave = moduloDeHref(moduloHref);
  if (!MODULOS.some((m) => m.clave === clave)) throw new Error("Sección desconocida.");
  if (!usuario.modulos.includes(clave)) throw new Error("No tienes acceso a esta sección.");

  const supabase = createServiceClient();
  const { data: permisosFilas, error: errorPermisos } = await supabase
    .from("permisos_rol")
    .select("rol_id, solo_lectura, roles(nombre)")
    .eq("modulo", clave);
  if (errorPermisos) throw new Error(errorPermisos.message);

  const permisos: PermisoDeRol[] = (permisosFilas ?? []).map((p) => ({
    rol_id: p.rol_id,
    solo_lectura: p.solo_lectura,
    rol: (p.roles as unknown as { nombre: string } | null)?.nombre ?? "Sin rol",
  }));

  let perfiles: PerfilConRol[] = [];
  if (permisos.length > 0) {
    const { data, error } = await supabase
      .from("perfiles")
      .select("id, nombre, email, avatar_url, rol_id, activo")
      .eq("activo", true)
      .in("rol_id", permisos.map((p) => p.rol_id));
    if (error) throw new Error(error.message);
    perfiles = (data ?? []) as PerfilConRol[];
  }

  return {
    personas: armarPersonasConAcceso(perfiles, permisos),
    yoId: usuario.id,
    puedeAdministrar: usuario.modulos.includes("usuarios"),
  };
}
