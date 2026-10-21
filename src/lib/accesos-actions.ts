"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { getUsuarioActual } from "@/lib/auth";
import { armarPersonasConAcceso, type AccesoSeccion, type PerfilConRol, type PermisoDeRol, type PermisoPropioDeModulo } from "@/lib/acceso-seccion";
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

  // Lo propio de cada persona sobre este módulo (migración 0116; sin ella, nadie tiene nada propio).
  const { data: propiosFilas, error: errorPropios } = await supabase.from("permisos_persona").select("perfil_id, nivel").eq("modulo", clave);
  const propios = (errorPropios ? [] : (propiosFilas ?? [])) as PermisoPropioDeModulo[];

  let perfiles: PerfilConRol[] = [];
  let nombresDeRol = new Map<string, string>();
  if (permisos.length > 0 || propios.length > 0) {
    const [{ data, error }, { data: roles }] = await Promise.all([
      supabase.from("perfiles").select("id, nombre, email, avatar_url, rol_id, activo").eq("activo", true),
      supabase.from("roles").select("id, nombre"),
    ]);
    if (error) throw new Error(error.message);
    perfiles = (data ?? []) as PerfilConRol[];
    nombresDeRol = new Map((roles ?? []).map((r) => [r.id as string, r.nombre as string]));
  }

  return {
    personas: armarPersonasConAcceso(perfiles, permisos, propios, nombresDeRol),
    yoId: usuario.id,
    puedeAdministrar: usuario.modulos.includes("usuarios"),
  };
}
