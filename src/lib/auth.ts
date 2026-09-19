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

/** Usuario con sesión activa, su rol y los módulos a los que ese rol tiene acceso. */
export async function getUsuarioActual(): Promise<UsuarioActual | null> {
  const session = await createSessionClient();
  const {
    data: { user },
  } = await session.auth.getUser();
  if (!user) return null;

  const supabase = createServiceClient();
  const { data: perfil } = await supabase
    .from("perfiles")
    .select("id, email, nombre, avatar_url, activo, rol_id, roles(id, nombre)")
    .eq("id", user.id)
    .maybeSingle();

  if (!perfil || !perfil.activo) return null;

  const rol = perfil.roles as unknown as { id: string; nombre: string } | null;

  let modulos: string[] = [];
  let modulosSoloLectura: string[] = [];
  if (rol) {
    const { data: permisos } = await supabase
      .from("permisos_rol")
      .select("modulo, solo_lectura")
      .eq("rol_id", rol.id);
    modulos = (permisos ?? []).map((p) => p.modulo);
    modulosSoloLectura = (permisos ?? []).filter((p) => p.solo_lectura).map((p) => p.modulo);
  }

  return {
    id: perfil.id,
    email: perfil.email,
    nombre: perfil.nombre,
    avatarUrl: perfil.avatar_url,
    rolId: rol?.id ?? null,
    rolNombre: rol?.nombre ?? null,
    modulos,
    modulosSoloLectura,
  };
}

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
