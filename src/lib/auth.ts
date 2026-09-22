import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSessionClient, createServiceClient } from "@/lib/supabase/server";

/** Cookie de "Ver así": el id del rol que Usuarios y roles está probando, o nada. Vive solo en el
 * navegador de quien la prende (ver `src/lib/vista-previa-actions.ts`), nunca en la base. */
export const VISTA_PREVIA_COOKIE = "vista_previa_rol_id";

export interface UsuarioActual {
  id: string;
  email: string;
  nombre: string | null;
  avatarUrl: string | null;
  rolId: string | null;
  rolNombre: string | null;
  modulos: string[];
  modulosSoloLectura: string[];
  /** Desde cuándo trabaja de verdad (primer ingreso real, no la invitación) — null si nunca entró. */
  primerIngresoEn: string | null;
  /** Si esta persona está probando la app como otro rol ("Ver así"): con qué rol, además de los suyos propios
   * (que quedan en `rolId`/`rolNombre`). `modulos`/`modulosSoloLectura` ya son los de ese rol mientras dura. */
  vistaPrevia: { rolId: string; rolNombre: string } | null;
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
    .select(
      "id, email, nombre, avatar_url, activo, rol_id, primer_ingreso_en, roles(id, nombre, permisos_rol(modulo, solo_lectura))"
    )
    .eq("id", userId)
    .maybeSingle();
  const perfil = completo.error
    ? (
        await supabase
          .from("perfiles")
          .select("id, email, nombre, avatar_url, activo, rol_id, primer_ingreso_en, roles(id, nombre)")
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

  let modulos = permisos.map((p) => p.modulo);
  let modulosSoloLectura = permisos.filter((p) => p.solo_lectura).map((p) => p.modulo);
  let vistaPrevia: { rolId: string; rolNombre: string } | null = null;

  // "Ver así": solo quien de verdad administra Usuarios y roles puede probar la app con los
  // permisos de otro rol — así que el cambio se aplica DESPUÉS de calcular los permisos reales,
  // y solo si esta persona los tenía.
  if (modulos.includes("usuarios")) {
    const rolPreviaId = (await cookies()).get(VISTA_PREVIA_COOKIE)?.value || null;
    if (rolPreviaId) {
      const { data: rolPrevia } = await supabase
        .from("roles")
        .select("id, nombre, permisos_rol(modulo, solo_lectura)")
        .eq("id", rolPreviaId)
        .maybeSingle();
      if (rolPrevia) {
        const permisosPrevia = (rolPrevia.permisos_rol ?? []) as Permiso[];
        modulos = permisosPrevia.map((p) => p.modulo);
        modulosSoloLectura = permisosPrevia.filter((p) => p.solo_lectura).map((p) => p.modulo);
        vistaPrevia = { rolId: rolPrevia.id, rolNombre: rolPrevia.nombre };
      }
    }
  }

  return {
    id: perfil.id,
    email: perfil.email,
    nombre: perfil.nombre,
    avatarUrl: perfil.avatar_url,
    rolId: rol?.id ?? null,
    rolNombre: rol?.nombre ?? null,
    primerIngresoEn: perfil.primer_ingreso_en,
    vistaPrevia,
    modulos,
    modulosSoloLectura,
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
