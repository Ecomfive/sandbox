"use server";

import { randomUUID } from "node:crypto";
import { aplicarCotizacion, aplicarEnvio } from "@/lib/proveedor/aplicar";
import { anotarLlegada, anotarPago, quitarPago } from "@/lib/proveedor/pagos-manuales";
import { cuentaProveedorActual } from "@/lib/proveedor/sesion";
import { BUCKET_PROVEEDOR, rutaFotoReal } from "@/lib/proveedor/rutas";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";

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
  if (data.etapa !== "por_cotizar" && data.etapa !== "cotizado") return { error: "Este pedido ya no se cotiza." };
  const ruta = rutaFotoReal(cuenta.proveedor.id, pedidoId, String(nombreArchivo ?? ""), randomUUID());
  if (!ruta) return { error: "No se pudo preparar la subida." };
  const { data: firmada, error } = await supabase.storage.from(BUCKET_PROVEEDOR).createSignedUploadUrl(ruta);
  if (error || !firmada) return { error: "No se pudo preparar la subida." };
  return { ruta, token: firmada.token };
}

/** Cotizar o corregir la cotización: unidades, costo por unidad o total, foto real (ya subida) y comentario. */
export async function cotizarPedido(
  pedidoId: string,
  datos: { unidades: string; costoUnitario?: string; montoTotal?: string; comentario?: string; fotoRuta?: string | null },
): Promise<{ error?: string }> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return SIN_SESION;
  if (!esUuid(pedidoId) || !datos || typeof datos !== "object") return { error: "Pedido no válido." };
  return aplicarCotizacion(cuenta, pedidoId, {
    unidades: datos.unidades,
    costoUnitario: datos.costoUnitario,
    montoTotal: datos.montoTotal,
    comentario: datos.comentario,
    fotoRuta: datos.fotoRuta || undefined,
  });
}

/** Marcar enviado, con la fecha en que salió. */
export async function marcarEnviado(pedidoId: string, fecha: string): Promise<{ error?: string; fechaEnvio?: string }> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return SIN_SESION;
  if (!esUuid(pedidoId)) return { error: "Pedido no válido." };
  return aplicarEnvio(cuenta, pedidoId, fecha);
}

/** «Registro de pagos»: el proveedor anota un pago que recibió (anticipo o saldo). */
export async function anotarPagoProveedor(pedidoId: string, cuota: string, monto: number, fecha: string): Promise<{ error?: string }> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return SIN_SESION;
  return anotarPago(cuenta, pedidoId, cuota, monto, fecha);
}

/** «Registro de pagos»: quita un pago que anotó el proveedor. */
export async function quitarPagoProveedor(pagoId: string): Promise<{ error?: string }> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return SIN_SESION;
  return quitarPago(cuenta, pagoId);
}

/** «Registro de pagos»: la fecha de llegada según el proveedor (vacía, la borra). */
export async function anotarLlegadaProveedor(pedidoId: string, fecha: string): Promise<{ error?: string }> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return SIN_SESION;
  return anotarLlegada(cuenta, pedidoId, fecha);
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
