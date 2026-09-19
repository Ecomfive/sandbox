"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { requireModuloEscritura } from "@/lib/auth";

function urlSitio() {
  return process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
}

export interface InvitarUsuarioState {
  status: "idle" | "success" | "error";
  mensaje?: string;
}

export async function invitarUsuario(
  _prevState: InvitarUsuarioState,
  formData: FormData
): Promise<InvitarUsuarioState> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const nombre = (formData.get("nombre") as string)?.trim() || null;
  const rol_id = (formData.get("rol_id") as string) || null;

  if (!email) return { status: "error", mensaje: "Falta el correo." };

  const supabase = createServiceClient();

  // Al primer usuario del sistema se le deja pasar sin permiso — todavía no hay sesión ni rol.
  const { count: totalPerfiles } = await supabase.from("perfiles").select("id", { count: "exact", head: true });
  if ((totalPerfiles ?? 0) > 0) {
    try {
      await requireModuloEscritura("usuarios");
    } catch (error) {
      return { status: "error", mensaje: error instanceof Error ? error.message : "Sin permiso." };
    }
  }

  const { data: invitado, error: errorInvitar } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${urlSitio()}/actualizar-clave`,
  });
  if (errorInvitar || !invitado.user) {
    return { status: "error", mensaje: errorInvitar?.message ?? "No se pudo invitar al usuario." };
  }

  const { error: errorPerfil } = await supabase
    .from("perfiles")
    .insert({ id: invitado.user.id, email, nombre, rol_id });
  if (errorPerfil) {
    return { status: "error", mensaje: `Invitado pero no se pudo crear el perfil: ${errorPerfil.message}` };
  }

  revalidatePath("/usuarios");
  return { status: "success", mensaje: `Invitación enviada a ${email}.` };
}

export async function cambiarRolUsuario(formData: FormData) {
  await requireModuloEscritura("usuarios");
  const id = formData.get("id") as string;
  const rolId = (formData.get("rol_id") as string) || null;
  const supabase = createServiceClient();
  const { error } = await supabase.from("perfiles").update({ rol_id: rolId }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/usuarios");
}

export async function cambiarActivoUsuario(formData: FormData) {
  await requireModuloEscritura("usuarios");
  const id = formData.get("id") as string;
  const activo = formData.get("activo") === "true";
  const supabase = createServiceClient();
  const { error } = await supabase.from("perfiles").update({ activo }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/usuarios");
}

export async function crearRol(formData: FormData) {
  await requireModuloEscritura("usuarios");
  const nombre = (formData.get("nombre") as string)?.trim();
  if (!nombre) throw new Error("Falta el nombre del rol.");
  const supabase = createServiceClient();
  const { error } = await supabase.from("roles").insert({ nombre });
  if (error) throw new Error(error.message);
  revalidatePath("/usuarios");
}

export async function togglePermiso(formData: FormData) {
  await requireModuloEscritura("usuarios");
  const rolId = formData.get("rol_id") as string;
  const modulo = formData.get("modulo") as string;
  const activo = formData.get("activo") === "true";

  const supabase = createServiceClient();
  if (activo) {
    const { error } = await supabase.from("permisos_rol").upsert(
      { rol_id: rolId, modulo },
      { onConflict: "rol_id,modulo" }
    );
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("permisos_rol")
      .delete()
      .eq("rol_id", rolId)
      .eq("modulo", modulo);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/usuarios");
}

export async function alternarSoloLectura(formData: FormData) {
  await requireModuloEscritura("usuarios");
  const rolId = formData.get("rol_id") as string;
  const modulo = formData.get("modulo") as string;
  const soloLectura = formData.get("solo_lectura") === "true";

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("permisos_rol")
    .update({ solo_lectura: soloLectura })
    .eq("rol_id", rolId)
    .eq("modulo", modulo);
  if (error) throw new Error(error.message);
  revalidatePath("/usuarios");
}
