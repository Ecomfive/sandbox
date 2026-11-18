"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/server";
import { leerTiendasPermitidas, textoTiendasPermitidas } from "@/lib/finanzas/tiendas-permitidas";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { detectarImagen } from "@/lib/seguridad/imagen";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { avisoTrasClaveNueva, avisoTrasSuspender, detalleSalida, textoRol } from "@/lib/seguridad/sesiones";
import { bloquearIngreso, cerrarSesionesDe, sacarDelSistema } from "@/lib/seguridad/sesiones-cuenta";

const ALFABETO_CLAVE = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

/** Clave temporal fácil de leer en voz alta o copiar a un mensaje: sin 0/O ni 1/l/I, que se confunden. */
function generarClaveTemporal(largo = 12): string {
  let clave = "";
  for (let i = 0; i < largo; i++) clave += ALFABETO_CLAVE[randomInt(ALFABETO_CLAVE.length)];
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

  // Al primer usuario del sistema se le deja pasar sin permiso — todavía no hay sesión ni rol. Solo si la cuenta de perfiles dio
  // 0 sin error: si la consulta falla, se exige el permiso (auditoría 27 oct 2026; antes un error contaba como «no hay nadie»).
  const { count: totalPerfiles, error: errorConteo } = await supabase.from("perfiles").select("id", { count: "exact", head: true });
  const primerUsuario = !errorConteo && totalPerfiles === 0;
  if (!primerUsuario) {
    try {
      await requireModuloEscritura("usuarios");
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Sin permiso." };
    }
  }
  if (!rol_id && !primerUsuario) return { error: "Elige qué va a poder hacer." };

  const contrasena = claveElegida || generarClaveTemporal();
  if (contrasena.length < 8) return { error: "La contraseña debe tener al menos 8 caracteres." };

  const { data: creado, error: errorCrear } = await supabase.auth.admin.createUser({
    email,
    password: contrasena,
    email_confirm: true,
    // La conoce quien la creó: al entrar, la persona elige la suya (/elegir-contrasena). El primer usuario del sistema la eligió él mismo.
    app_metadata: { clave_temporal: !primerUsuario },
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

/**
 * Nueva clave temporal para alguien que ya tenía cuenta (la olvidó, o nunca llegó a entrar). Además se cierran sus sesiones abiertas: si
 * alguien más tenía su sesión, deja de valer (auditoría de seguridad, 18 nov 2026). La propia no se cierra desde aquí. Si cerrarlas falla,
 * la clave queda igual y vuelve un `aviso`.
 */
export async function generarContrasenaTemporal(formData: FormData): Promise<{ error?: string; contrasena?: string; aviso?: string }> {
  const usuario = await requireModuloEscritura("usuarios");
  const id = formData.get("id") as string;
  if (!esUuid(id)) return { error: "Persona no válida." };

  const contrasena = generarClaveTemporal();
  const supabase = createServiceClient();
  const { error } = await supabase.auth.admin.updateUserById(id, { password: contrasena, app_metadata: { clave_temporal: true } });
  if (error) return { error: error.message };

  const fallaSesiones = id === usuario.id ? null : ((await cerrarSesionesDe(id)).error ?? null);
  await registrarAuditoria({
    accion: "generar_contrasena_temporal",
    entidad: "perfiles",
    entidadId: id,
    detalle:
      id === usuario.id
        ? "Se generó una contraseña temporal nueva"
        : `Se generó una contraseña temporal nueva; ${fallaSesiones ? `no se pudieron cerrar sus sesiones (${fallaSesiones})` : "se cerraron sus sesiones abiertas"}`,
  });

  const aviso = avisoTrasClaveNueva(fallaSesiones);
  return aviso ? { contrasena, aviso } : { contrasena };
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

/**
 * El rol base de una persona. Queda en el historial con el rol de antes y el de después (auditoría de seguridad, 18 nov 2026). Devuelve
 * el error como valor: en producción, Next.js oculta el mensaje de una excepción de un server action.
 */
export async function cambiarRolUsuario(formData: FormData): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura("usuarios");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sin permiso." };
  }
  const id = formData.get("id") as string;
  const rolId = (formData.get("rol_id") as string) || null;
  if (!esUuid(id)) return { error: "Persona no válida." };
  if (rolId !== null && !esUuid(rolId)) return { error: "Rol no válido." };
  const supabase = createServiceClient();
  const { data: antes, error: errorAntes } = await supabase.from("perfiles").select("email, rol_id").eq("id", id).maybeSingle();
  if (errorAntes || !antes) return { error: "No se encontró a la persona." };
  if ((antes.rol_id ?? null) === rolId) return {};

  const { error } = await supabase.from("perfiles").update({ rol_id: rolId }).eq("id", id);
  if (error) return { error: "No se pudo cambiar el rol." };

  const ids = [antes.rol_id, rolId].filter((r): r is string => !!r);
  const { data: roles } = ids.length ? await supabase.from("roles").select("id, nombre").in("id", ids) : { data: [] };
  const nombres = Object.fromEntries((roles ?? []).map((r) => [String(r.id), String(r.nombre)]));
  await registrarAuditoria({
    accion: "cambiar_rol_usuario",
    entidad: "perfiles",
    entidadId: id,
    detalle: antes.email ?? undefined,
    antes: { Rol: textoRol(antes.rol_id ?? null, nombres) },
    despues: { Rol: textoRol(rolId, nombres) },
  });
  revalidatePath("/usuarios");
  return {};
}

/**
 * "Suspender"/"Reactivar" en la ficha: no borra nada, solo le quita (o le devuelve) el paso al sistema. Al suspender, además de marcarla
 * inactiva se le bloquea el ingreso y se cierran sus sesiones abiertas (auditoría de seguridad, 18 nov 2026): la suspensión se guarda
 * primero, y si lo demás falla vuelve un `aviso` para quien suspendió en vez de callarlo. Al reactivar, primero se quita el bloqueo: si
 * eso falla no se reactiva (seguiría sin poder entrar) y vuelve el error.
 */
export async function cambiarActivoUsuario(formData: FormData): Promise<{ error?: string; aviso?: string }> {
  let usuario;
  try {
    usuario = await requireModuloEscritura("usuarios");
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Sin permiso." };
  }
  const id = formData.get("id") as string;
  const activo = formData.get("activo") === "true";
  if (!esUuid(id)) return { error: "Persona no válida." };
  if (!activo && id === usuario.id) return { error: "No puedes suspender tu propia cuenta." };
  const supabase = createServiceClient();
  const { data: antes } = await supabase.from("perfiles").select("email, activo").eq("id", id).maybeSingle();
  if (!antes) return { error: "No se encontró a la persona." };

  if (activo) {
    const desbloqueo = await bloquearIngreso(id, false);
    if (desbloqueo.error) return { error: `No se pudo reactivar: ${desbloqueo.error}. Inténtalo de nuevo.` };
  }

  const { error } = await supabase.from("perfiles").update({ activo }).eq("id", id);
  if (error) return { error: "No se pudo cambiar el estado." };

  const salida = activo ? null : await sacarDelSistema(id);
  const estado = (a: boolean) => (a ? "Activo" : "Suspendido");
  await registrarAuditoria({
    accion: "suspender_usuario",
    entidad: "perfiles",
    entidadId: id,
    detalle: `${antes.email ?? id}${salida ? `: ${detalleSalida(salida)}` : ""}`,
    antes: { Estado: estado(antes.activo !== false) },
    despues: { Estado: estado(activo) },
  });

  revalidatePath("/usuarios");
  const aviso = salida ? avisoTrasSuspender(salida) : null;
  return aviso ? { aviso } : {};
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
  const id = String(formData.get("id") ?? "");
  // El id va en la ruta del archivo: solo un UUID (auditoría de seguridad, 13 oct 2026).
  if (!esUuid(id)) return { error: "Persona no válida." };
  const archivo = formData.get("foto") as File | null;
  if (!archivo || archivo.size === 0) return { error: "Selecciona una imagen." };
  if (archivo.size > 2 * 1024 * 1024) return { error: "La imagen debe pesar menos de 2MB." };
  // El tipo y la extensión salen del contenido (su firma), no del nombre ni del tipo que manda el navegador.
  const contenido = new Uint8Array(await archivo.arrayBuffer());
  const imagen = detectarImagen(contenido);
  if (!imagen) return { error: "La imagen debe ser JPG, PNG, WebP o GIF." };

  const supabase = createServiceClient();
  const ruta = `${id}/avatar.${imagen.extension}`;

  const { error: errorSubida } = await supabase.storage
    .from("avatars")
    .upload(ruta, contenido, { upsert: true, contentType: imagen.tipo });
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

/**
 * Los países que puede ver una persona (migración 0087): `null` = todos; una lista = solo esos (códigos de `paises`, y
 * «importacion» para Compras Importadora). Limita Compras, el histórico de compras y el país de la barra de arriba.
 */
export async function guardarPaisesUsuario(id: string, paises: string[] | null): Promise<{ error?: string }> {
  await requireModuloEscritura("usuarios");
  if (typeof id !== "string" || !/^[0-9a-fA-F-]{8,64}$/.test(id)) return { error: "Persona no válida." };
  const supabase = createServiceClient();
  let lista: string[] | null = null;
  if (paises !== null) {
    if (!Array.isArray(paises)) return { error: "Países no válidos." };
    const { data: existentes } = await supabase.from("paises").select("codigo");
    const validos = new Set([...(existentes ?? []).map((p) => p.codigo as string), "importacion"]);
    lista = [...new Set(paises.map(String))].filter((c) => validos.has(c));
  }
  const { data: antes } = await supabase.from("perfiles").select("email, paises_permitidos").eq("id", id).maybeSingle();
  const { error } = await supabase.from("perfiles").update({ paises_permitidos: lista }).eq("id", id);
  if (error) return { error: error.message.includes("paises_permitidos") ? "Falta correr la migración 0087 en Supabase." : "No se pudo guardar." };
  const texto = (v: unknown) => (Array.isArray(v) ? (v.length ? v.join(", ") : "ninguno") : "todos");
  await registrarAuditoria({
    accion: "cambiar_paises_usuario",
    entidad: "perfiles",
    entidadId: id,
    detalle: `${antes?.email ?? id}: países ${texto(antes?.paises_permitidos)} → ${texto(lista)}`,
  });
  revalidatePath("/usuarios");
  return {};
}

/** Los países que se pueden elegir en la ficha de una persona. */
export async function listarPaisesParaPermisos(): Promise<{ codigo: string; nombre: string }[]> {
  await requireModuloEscritura("usuarios");
  const { data } = await createServiceClient().from("paises").select("codigo, nombre").order("nombre");
  return (data ?? []) as { codigo: string; nombre: string }[];
}

/**
 * Las tiendas de Finanzas que puede ver una persona (migración 0937): `null` = todas; una lista = solo esas
 * (`fin_unidades`). Limita Estado de resultados, Panel, Rentabilidad, Ventas por tienda y el Libro de movimientos.
 */
export async function guardarTiendasUsuario(id: string, tiendas: string[] | null): Promise<{ error?: string }> {
  await requireModuloEscritura("usuarios");
  if (typeof id !== "string" || !/^[0-9a-fA-F-]{8,64}$/.test(id)) return { error: "Persona no válida." };
  const supabase = createServiceClient();
  let lista: string[] | null = null;
  if (tiendas !== null) {
    if (!Array.isArray(tiendas)) return { error: "Tiendas no válidas." };
    const { data: existentes } = await supabase.from("fin_unidades").select("id");
    const validas = new Set((existentes ?? []).map((u) => String(u.id).toLowerCase()));
    lista = [...new Set(tiendas.map((t) => String(t).toLowerCase()))].filter((t) => validas.has(t));
  }
  const { data: antes } = await supabase.from("perfiles").select("email, tiendas_permitidas").eq("id", id).maybeSingle();
  const { error } = await supabase.from("perfiles").update({ tiendas_permitidas: lista }).eq("id", id);
  if (error) return { error: error.message.includes("tiendas_permitidas") ? "Falta correr la migración 0937 en Supabase." : "No se pudo guardar." };
  const { data: unidades } = await supabase.from("fin_unidades").select("id, nombre");
  const nombres = Object.fromEntries((unidades ?? []).map((u) => [String(u.id), String(u.nombre)]));
  const previo = leerTiendasPermitidas((antes as { tiendas_permitidas?: unknown } | null)?.tiendas_permitidas ?? null);
  await registrarAuditoria({
    accion: "cambiar_tiendas_usuario",
    entidad: "perfiles",
    entidadId: id,
    detalle: `${antes?.email ?? id}: tiendas ${textoTiendasPermitidas(previo, nombres)} → ${textoTiendasPermitidas(lista, nombres)}`,
  });
  revalidatePath("/usuarios");
  return {};
}

/** Las tiendas que se pueden elegir en la ficha de una persona. */
export async function listarTiendasParaPermisos(): Promise<{ id: string; nombre: string }[]> {
  await requireModuloEscritura("usuarios");
  const { data } = await createServiceClient().from("fin_unidades").select("id, nombre").eq("clase", "tienda").eq("activo", true).order("orden");
  return (data ?? []).map((u) => ({ id: String(u.id), nombre: String(u.nombre) }));
}
