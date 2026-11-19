"use server";

import { randomUUID } from "node:crypto";
import { aplicarCajas, aplicarCotizacion, aplicarEnvio } from "@/lib/proveedor/aplicar";
import { idiomaDeCuenta } from "@/lib/proveedor/cuenta";
import type { LineaHistorial } from "@/lib/proveedor/historial";
import { direccionesDeEtiquetas, type EtiquetaPedido } from "@/lib/proveedor/etiquetas-datos";
import { cargarHistorialPedido } from "@/lib/proveedor/historial-datos";
import { guardarCeldaRegistro } from "@/lib/proveedor/registro-datos";
import { traducirTextos } from "@/lib/proveedor/traducir";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioSesion } from "@/lib/auth";
import { cuentaProveedorActual } from "@/lib/proveedor/sesion";
import { BUCKET_PROVEEDOR, rutaEtiqueta, rutaFotoReal } from "@/lib/proveedor/rutas";
import { cerrarIntento, revisarIngreso } from "@/lib/seguridad/limite-ingreso";
import { DEMASIADOS_INTENTOS } from "@/lib/seguridad/limite-reglas";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createAnonClient, createServiceClient, createSessionClient } from "@/lib/supabase/server";

// Acciones del portal del proveedor. Cada una empieza con la cuenta de la sesión (nunca con un proveedor que mande el navegador) y
// devuelve el error como valor: en producción, Next.js oculta el mensaje de una excepción.

const SIN_SESION = { error: "Tu sesión terminó. Vuelve a entrar." };

/** Dirección firmada para subir la foto real de un pedido directo al almacenamiento (sin pasar por el límite de una acción). */
export async function prepararSubidaFotoReal(pedidoId: string, nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return SIN_SESION;
  if (!esUuid(pedidoId)) return { error: "Pedido no válido." };
  const supabase = createServiceClient();
  const { data } = await supabase.from("proveedor_pedidos").select("proveedor_id, etapa, visible").eq("id", pedidoId).maybeSingle();
  if (!data || data.proveedor_id !== cuenta.proveedor.id || !data.visible) return { error: "Ese pedido ya no está en tu portal." };
  if (data.etapa !== "por_cotizar" && data.etapa !== "cotizado" && data.etapa !== "produccion") return { error: "Este pedido ya no se cotiza." };
  const ruta = rutaFotoReal(cuenta.proveedor.id, pedidoId, String(nombreArchivo ?? ""), randomUUID());
  if (!ruta) return { error: "No se pudo preparar la subida." };
  const { data: firmada, error } = await supabase.storage.from(BUCKET_PROVEEDOR).createSignedUploadUrl(ruta);
  if (error || !firmada) return { error: "No se pudo preparar la subida." };
  return { ruta, token: firmada.token };
}

/** Cotizar o corregir la cotización: unidades y monto total (el costo por unidad se calcula), foto real (ya subida) y comentario. */
export async function cotizarPedido(
  pedidoId: string,
  datos: { unidades: string; montoTotal?: string; comentario?: string; fotoRuta?: string | null },
): Promise<{ error?: string }> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return SIN_SESION;
  if (!esUuid(pedidoId) || !datos || typeof datos !== "object") return { error: "Pedido no válido." };
  return aplicarCotizacion(cuenta, pedidoId, {
    unidades: datos.unidades,
    montoTotal: datos.montoTotal,
    comentario: datos.comentario,
    fotoRuta: datos.fotoRuta || undefined,
  });
}

/** Dirección firmada para subir una imagen de la etiqueta de las cajas de un pedido (en producción o ya enviado) directo al almacenamiento. */
export async function prepararSubidaEtiqueta(pedidoId: string, nombreArchivo: string): Promise<{ ruta: string; token: string } | { error: string }> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return SIN_SESION;
  if (!esUuid(pedidoId)) return { error: "Pedido no válido." };
  const supabase = createServiceClient();
  const { data } = await supabase.from("proveedor_pedidos").select("proveedor_id, etapa, visible").eq("id", pedidoId).maybeSingle();
  if (!data || data.proveedor_id !== cuenta.proveedor.id || !data.visible) return { error: "Ese pedido ya no está en tu portal." };
  if (data.etapa !== "produccion" && data.etapa !== "enviado") return { error: "Las cajas se anotan cuando el pedido está en producción o ya salió." };
  const ruta = rutaEtiqueta(cuenta.proveedor.id, pedidoId, String(nombreArchivo ?? ""), randomUUID());
  if (!ruta) return { error: "No se pudo preparar la subida." };
  const { data: firmada, error } = await supabase.storage.from(BUCKET_PROVEEDOR).createSignedUploadUrl(ruta);
  if (error || !firmada) return { error: "No se pudo preparar la subida." };
  return { ruta, token: firmada.token };
}

/** Marcar enviado, con la fecha en que salió, las cajas del envío y la etiqueta de las cajas (imágenes ya subidas). */
export async function marcarEnviado(
  pedidoId: string,
  fecha: string,
  cajas: string,
  etiquetas: string[],
): Promise<{ error?: string; fechaEnvio?: string; cajas?: number; etiquetas?: EtiquetaPedido[] }> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return SIN_SESION;
  if (!esUuid(pedidoId)) return { error: "Pedido no válido." };
  const r = await aplicarEnvio(cuenta, pedidoId, fecha, { cajas, nuevas: Array.isArray(etiquetas) ? etiquetas : [] });
  if (r.error) return { error: r.error };
  return { fechaEnvio: r.fechaEnvio, cajas: r.cajas, etiquetas: await direccionesDeEtiquetas(createServiceClient(), r.etiquetas ?? []) };
}

/** Anotar o corregir las cajas y la etiqueta de un pedido en producción o ya enviado: `nuevas` recién subidas, `quitar` las que ya tenía y se retiran. */
export async function guardarCajasPedido(
  pedidoId: string,
  datos: { cajas: string; nuevas: string[]; quitar: string[] },
): Promise<{ error?: string; cajas?: number; etiquetas?: EtiquetaPedido[] }> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return SIN_SESION;
  if (!esUuid(pedidoId) || !datos || typeof datos !== "object") return { error: "Pedido no válido." };
  const r = await aplicarCajas(cuenta, pedidoId, { cajas: datos.cajas, nuevas: datos.nuevas, quitar: datos.quitar });
  if ("error" in r) return r;
  return { cajas: r.cajas, etiquetas: await direccionesDeEtiquetas(createServiceClient(), r.etiquetas) };
}

/** «Registro de pagos»: el proveedor cambia una celda de su tabla (vacía, vuelve al valor de siempre). Ecomfive recibe el aviso. */
export async function guardarCeldaRegistroProveedor(fila: string, campo: string, valor: string): Promise<{ error?: string }> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return SIN_SESION;
  return guardarCeldaRegistro(createServiceClient(), cuenta.proveedor.id, fila, campo, valor, {
    lado: "proveedor",
    nombre: cuenta.nombre,
    proveedor: cuenta.proveedor.nombre,
    notificarA: cuenta.proveedor.notificarA,
  });
}

/** El historial de un pedido (cotizaciones, unidades, etapas, envío, nota y registro de pagos). Lo escrito en español va traducido al chino. */
export async function historialPedidoProveedor(pedidoId: string): Promise<{ lineas: LineaHistorial[]; traducciones: Record<string, string> } | { error: string }> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return SIN_SESION;
  if (!esUuid(pedidoId)) return { error: "Pedido no válido." };
  const supabase = createServiceClient();
  const r = await cargarHistorialPedido(supabase, cuenta.proveedor.id, pedidoId, false);
  if ("error" in r) return r;
  const idioma = await idiomaDeCuenta(cuenta.cuentaId);
  const libres = r.lineas.filter((l) => l.tipo === "nota" || l.tipo === "pagos").flatMap((l) => [l.antes, l.despues]);
  const traducciones = idioma === "zh" ? await traducirTextos(supabase, libres, "zh") : {};
  return { lineas: r.lineas, traducciones };
}

/** Lo nuevo de Ecomfive (decisiones, llegadas) queda visto al abrir el portal. */
export async function marcarVistoPorProveedor(): Promise<void> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return;
  await createServiceClient().from("proveedor_novedades").update({ leida_en: new Date().toISOString() }).eq("proveedor_id", cuenta.proveedor.id).eq("lado", "ecomfive").is("leida_en", null);
}

/** 中文 / Español: el idioma en que la cuenta ve su portal (se guarda en su cuenta). */
export async function cambiarIdiomaProveedor(idioma: string): Promise<{ error?: string }> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return SIN_SESION;
  if (idioma !== "zh" && idioma !== "es") return { error: "Idioma no válido." };
  const { error } = await createServiceClient().from("proveedor_usuarios").update({ idioma }).eq("id", cuenta.cuentaId);
  return error ? { error: "No se pudo cambiar el idioma." } : {};
}

/**
 * La cuenta cambia su clave: pide la actual (o la temporal que le dio Ecomfive) y la nueva dos veces. La actual se comprueba con un
 * cliente aparte, sin tocar la sesión de las cookies; la nueva se guarda y se quita la marca de clave temporal. Guardar la clave cierra
 * las sesiones abiertas, así que la de este navegador se vuelve a abrir con la clave nueva (sigue en su portal).
 */
export async function cambiarClaveProveedor(actual: string, nueva: string, repetida: string): Promise<{ error?: string }> {
  const cuenta = await cuentaProveedorActual();
  const usuario = await getUsuarioSesion();
  if (!cuenta || !usuario?.email || usuario.id !== cuenta.usuarioId) return SIN_SESION;
  const claveActual = String(actual ?? "");
  const claveNueva = String(nueva ?? "");
  if (claveNueva.length < 8) return { error: "La clave nueva debe tener al menos 8 caracteres." };
  if (claveNueva.length > 72) return { error: "La clave nueva es muy larga." };
  if (claveNueva !== String(repetida ?? "")) return { error: "Las claves nuevas no coinciden." };
  if (claveNueva === claveActual) return { error: "La clave nueva debe ser distinta de la actual." };

  // La clave actual cuenta como un ingreso: mismo tope de claves equivocadas que el login (seguridad · 19 nov 2026).
  const { intento, frenado } = await revisarIngreso(usuario.email);
  if (frenado) return { error: DEMASIADOS_INTENTOS };
  const comprobar = createAnonClient();
  const { error: errorActual } = await comprobar.auth.signInWithPassword({ email: usuario.email, password: claveActual });
  await cerrarIntento(intento, errorActual);
  if (errorActual) return { error: "La clave actual no es correcta." };
  await comprobar.auth.signOut({ scope: "local" });

  const { error } = await createServiceClient().auth.admin.updateUserById(cuenta.usuarioId, { password: claveNueva, app_metadata: { clave_temporal: false } });
  if (error) return { error: "No se pudo cambiar la clave." };
  await (await createSessionClient()).auth.signInWithPassword({ email: usuario.email, password: claveNueva });
  await registrarAuditoria({ accion: "cambiar_contrasena", entidad: "proveedor_usuarios", entidadId: cuenta.usuarioId, detalle: `${cuenta.nombre} (${cuenta.proveedor.nombre}) cambió su clave del portal` });
  return {};
}
