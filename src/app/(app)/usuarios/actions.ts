"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";

const ALFABETO_CLAVE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Clave temporal fácil de leer en voz alta o copiar a un mensaje: sin 0/O ni 1/l/I, que se confunden. */
function generarClaveTemporal(largo = 12): string {
  let clave = "";
  for (let i = 0; i < largo; i++) clave += ALFABETO_CLAVE[Math.floor(Math.random() * ALFABETO_CLAVE.length)];
  return clave;
}

/**
 * Da de alta a una persona con una clave temporal (en vez de una invitación por correo): la ficha se la muestra
 * a quien la crea, para que se la pase a mano. Devuelve el error como valor: en producción, Next.js oculta el
 * mensaje de una excepción de un server action.
 */
export async function crearUsuario(formData: FormData): Promise<{ error?: string; contrasena?: string }> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  const nombre = (formData.get("nombre") as string)?.trim() || null;
  const rol_id = (formData.get("rol_id") as string) || null;
  const claveElegida = (formData.get("contrasena") as string)?.trim();

  if (!email) return { error: "Falta el correo." };
  if (!nombre) return { error: "Falta el nombre." };

  const supabase = createServiceClient();

  // Al primer usuario del sistema se le deja pasar sin permiso — todavía no hay sesión ni rol.
  const { count: totalPerfiles } = await supabase.from("perfiles").select("id", { count: "exact", head: true });
  if ((totalPerfiles ?? 0) > 0) {
    try {
      await requireModuloEscritura("usuarios");
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Sin permiso." };
    }
  }
  if (!rol_id && (totalPerfiles ?? 0) > 0) return { error: "Elige qué va a poder hacer." };

  const contrasena = claveElegida || generarClaveTemporal();
  if (contrasena.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };

  const { data: creado, error: errorCrear } = await supabase.auth.admin.createUser({
    email,
    password: contrasena,
    email_confirm: true,
  });
  if (errorCrear || !creado.user) {
    return { error: errorCrear?.message ?? "No se pudo crear la cuenta." };
  }

  const { error: errorPerfil } = await supabase
    .from("perfiles")
    .insert({ id: creado.user.id, email, nombre, rol_id });
  if (errorPerfil) {
    return { error: `La cuenta se creó pero no se pudo guardar el perfil: ${errorPerfil.message}` };
  }

  await registrarAuditoria({
    accion: "crear_usuario",
    entidad: "perfiles",
    entidadId: creado.user.id,
    detalle: `${nombre} <${email}>`,
  });

  revalidatePath("/usuarios");
  return { contrasena };
}

/** Nueva clave temporal para alguien que ya tenía cuenta (la olvidó, o nunca llegó a entrar). */
export async function generarContrasenaTemporal(formData: FormData): Promise<{ error?: string; contrasena?: string }> {
  await requireModuloEscritura("usuarios");
  const id = formData.get("id") as string;

  const contrasena = generarClaveTemporal();
  const supabase = createServiceClient();
  const { error } = await supabase.auth.admin.updateUserById(id, { password: contrasena });
  if (error) return { error: error.message };

  await registrarAuditoria({
    accion: "generar_contrasena_temporal",
    entidad: "perfiles",
    entidadId: id,
    detalle: "Se generó una contraseña temporal nueva",
  });

  return { contrasena };
}

/** Nombre y correo con el que entra — todo lo demás de "Datos" en la ficha. */
export async function actualizarDatosUsuario(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("usuarios");
  const id = formData.get("id") as string;
  const nombre = (formData.get("nombre") as string)?.trim();
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!nombre) return { error: "Falta el nombre." };
  if (!email) return { error: "Falta el correo." };

  const supabase = createServiceClient();
  const { data: antes } = await supabase.from("perfiles").select("nombre, email").eq("id", id).maybeSingle();

  if (antes && email !== antes.email) {
    const { error: errorCorreo } = await supabase.auth.admin.updateUserById(id, { email });
    if (errorCorreo) return { error: errorCorreo.message };
  }

  const { error } = await supabase.from("perfiles").update({ nombre, email }).eq("id", id);
  if (error) return { error: error.message };

  await registrarAuditoria({
    accion: "editar_usuario",
    entidad: "perfiles",
    entidadId: id,
    antes: { Nombre: antes?.nombre ?? "—", Correo: antes?.email ?? "—" },
    despues: { Nombre: nombre, Correo: email },
  });

  revalidatePath("/usuarios");
  return {};
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

/** "Suspender"/"Reactivar" en la ficha: no borra nada, solo le quita (o le devuelve) el paso al sistema. */
export async function cambiarActivoUsuario(formData: FormData) {
  await requireModuloEscritura("usuarios");
  const id = formData.get("id") as string;
  const activo = formData.get("activo") === "true";
  const supabase = createServiceClient();
  const { error } = await supabase.from("perfiles").update({ activo }).eq("id", id);
  if (error) throw new Error(error.message);

  await registrarAuditoria({
    accion: "suspender_usuario",
    entidad: "perfiles",
    entidadId: id,
    antes: { Estado: activo ? "Suspendido" : "Activo" },
    despues: { Estado: activo ? "Activo" : "Suspendido" },
  });

  revalidatePath("/usuarios");
}

/** Borra la cuenta de verdad (auth y perfil, en cascada). No se puede borrar la propia cuenta desde acá. */
export async function eliminarUsuario(formData: FormData): Promise<{ error?: string }> {
  const usuario = await requireModuloEscritura("usuarios");
  const id = formData.get("id") as string;
  if (id === usuario.id) return { error: "No puedes eliminar tu propia cuenta." };

  const supabase = createServiceClient();
  const { data: perfil } = await supabase.from("perfiles").select("nombre, email").eq("id", id).maybeSingle();

  const { error } = await supabase.auth.admin.deleteUser(id);
  if (error) return { error: error.message };

  await registrarAuditoria({
    accion: "eliminar_usuario",
    entidad: "perfiles",
    entidadId: id,
    detalle: perfil ? `${perfil.nombre ?? "Sin nombre"} <${perfil.email}>` : id,
  });

  revalidatePath("/usuarios");
  return {};
}

/** El administrador sube la foto por la persona ("Poner su foto yo mismo" en la ficha) — mismo bucket que el
 * avatar propio (`src/lib/perfil-actions.ts`), pero con el id de otra cuenta. */
export async function subirFotoDeUsuario(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("usuarios");
  const id = formData.get("id") as string;
  const archivo = formData.get("foto") as File | null;
  if (!archivo || archivo.size === 0) return { error: "Selecciona una imagen." };
  if (!archivo.type.startsWith("image/")) return { error: "El archivo debe ser una imagen." };
  if (archivo.size > 2 * 1024 * 1024) return { error: "La imagen debe pesar menos de 2MB." };

  const supabase = createServiceClient();
  const extension = archivo.name.split(".").pop() || "jpg";
  const ruta = `${id}/avatar.${extension}`;

  const { error: errorSubida } = await supabase.storage
    .from("avatars")
    .upload(ruta, archivo, { upsert: true, contentType: archivo.type });
  if (errorSubida) return { error: errorSubida.message };

  const { data: publico } = supabase.storage.from("avatars").getPublicUrl(ruta);
  const { error: errorPerfil } = await supabase
    .from("perfiles")
    .update({ avatar_url: `${publico.publicUrl}?v=${Date.now()}` })
    .eq("id", id);
  if (errorPerfil) return { error: errorPerfil.message };

  revalidatePath("/usuarios");
  return {};
}

/** Deja anotado que se le recordó subir la foto — no manda nada por sí solo (no hay mensajería interna
 * todavía): es para acordarse de a quién y cuándo se le avisó por fuera de la app. */
export async function recordarFoto(formData: FormData) {
  await requireModuloEscritura("usuarios");
  const id = formData.get("id") as string;
  const supabase = createServiceClient();
  const { error } = await supabase.from("perfiles").update({ foto_recordada_en: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/usuarios");
}

export async function crearRol(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("usuarios");
  const nombre = (formData.get("nombre") as string)?.trim();
  const descripcion = (formData.get("descripcion") as string)?.trim() || null;
  if (!nombre) return { error: "Falta el nombre del rol." };
  const supabase = createServiceClient();
  const { error } = await supabase.from("roles").insert({ nombre, descripcion });
  if (error) return { error: error.message };
  revalidatePath("/usuarios");
  return {};
}

export async function actualizarRol(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("usuarios");
  const id = formData.get("id") as string;
  const nombre = (formData.get("nombre") as string)?.trim();
  const descripcion = (formData.get("descripcion") as string)?.trim() || null;
  if (!nombre) return { error: "Falta el nombre del rol." };
  const supabase = createServiceClient();
  const { error } = await supabase.from("roles").update({ nombre, descripcion }).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/usuarios");
  return {};
}

/** Borra un rol, salvo que todavía tenga personas asignadas — ahí se bloquea con un mensaje claro
 * en vez de dejar perfiles sin rol de golpe. */
export async function eliminarRol(formData: FormData): Promise<{ error?: string }> {
  await requireModuloEscritura("usuarios");
  const id = formData.get("id") as string;
  const supabase = createServiceClient();

  const { count } = await supabase.from("perfiles").select("id", { count: "exact", head: true }).eq("rol_id", id);
  if (count && count > 0) {
    return { error: `No se puede eliminar: ${count} persona${count === 1 ? "" : "s"} todavía ${count === 1 ? "tiene" : "tienen"} este rol.` };
  }

  const { error } = await supabase.from("roles").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/usuarios");
  return {};
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
