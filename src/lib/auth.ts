import { cache } from "react";
import { redirect } from "next/navigation";
import { createSessionClient, createServiceClient } from "@/lib/supabase/server";

export interface UsuarioActual {
  id: string;
  email: string;
  nombre: string | null;
  avatarUrl: string | null;
  rolId: string | null;
  rolNombre: string | null;
  modulos: string[];
  modulosSoloLectura: string[];
}

interface Permiso {
  modulo: string;
  solo_lectura: boolean;
}

/**
 * Id de la persona con sesión en esta petición (o null): la única consulta a la autenticación. Con `cache` el
 * layout, la página y el resto de la petición comparten la misma respuesta. Se separa del perfil para poder pedir
 * lo que solo depende del id (los favoritos) sin esperar a que se resuelvan el perfil y los permisos.
 */
export const getUsuarioIdSesion = cache(async (): Promise<string | null> => {
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  return user?.id ?? null;
});

/** Usuario con sesión activa, su rol y los módulos a los que ese rol tiene acceso (una vez por petición). */
export const getUsuarioActual = cache(async (): Promise<UsuarioActual | null> => {
  const userId = await getUsuarioIdSesion();
  if (!userId) return null;

  const supabase = createServiceClient();
  // Perfil, rol y permisos en una sola consulta (antes eran dos, una tras otra). Si la base no devuelve los permisos
  // incluidos (o la consulta falla), se piden aparte como antes: el acceso nunca depende de que esto funcione.
  const completo = await supabase
    .from("perfiles")
    .select("id, email, nombre, avatar_url, activo, rol_id, roles(id, nombre, permisos_rol(modulo, solo_lectura))")
    .eq("id", userId)
    .maybeSingle();
  const perfil = completo.error
    ? (
        await supabase
          .from("perfiles")
          .select("id, email, nombre, avatar_url, activo, rol_id, roles(id, nombre)")
          .eq("id", userId)
          .maybeSingle()
      ).data
    : completo.data;

  if (!perfil || !perfil.activo) return null;

  const rol = perfil.roles as unknown as { id: string; nombre: string; permisos_rol?: Permiso[] } | null;

  let permisos: Permiso[] = [];
  if (rol) {
    if (Array.isArray(rol.permisos_rol)) {
      permisos = rol.permisos_rol;
    } else {
      const { data } = await supabase.from("permisos_rol").select("modulo, solo_lectura").eq("rol_id", rol.id);
      permisos = data ?? [];
    }
  }

  return {
    id: perfil.id,
    email: perfil.email,
    nombre: perfil.nombre,
    avatarUrl: perfil.avatar_url,
    rolId: rol?.id ?? null,
    rolNombre: rol?.nombre ?? null,
    modulos: permisos.map((p) => p.modulo),
    modulosSoloLectura: permisos.filter((p) => p.solo_lectura).map((p) => p.modulo),
  };
});

/** Exige sesión activa y acceso al módulo dado; redirige si no se cumple. */
export async function requireModulo(clave: string): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  if (!usuario.modulos.includes(clave)) redirect("/sin-acceso");
  return usuario;
}

/** Exige acceso de escritura al módulo dado — para usar dentro de cada server action que
 * modifique datos, no solo en la página. El menú oculta los botones a quien no tiene permiso,
 * pero un server action se puede invocar directo, así que esta es la barrera real. */
export async function requireModuloEscritura(clave: string): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) throw new Error("No hay sesión activa.");
  if (!usuario.modulos.includes(clave)) throw new Error("No tienes acceso a este módulo.");
  if (usuario.modulosSoloLectura.includes(clave)) {
    throw new Error("Tu rol solo tiene acceso de lectura a este módulo.");
  }
  return usuario;
}
