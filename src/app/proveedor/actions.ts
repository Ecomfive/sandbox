"use server";

import { randomUUID } from "node:crypto";
import { aplicarCotizacion, aplicarEnvio } from "@/lib/proveedor/aplicar";
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

/** Confirmar que llegó un pago que avisó Ecomfive: recién ahí sus cuotas cuentan como pagadas (con la fecha del pago). */
export async function confirmarAvisoPago(avisoId: string, nota: string): Promise<{ error?: string }> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return SIN_SESION;
  if (!esUuid(avisoId)) return { error: "Aviso no válido." };
  const supabase = createServiceClient();
  const { data: aviso } = await supabase.from("proveedor_avisos_pago").select("id, proveedor_id, estado, fecha, monto, referencia, proveedor_aviso_cuotas(pedido_id, cuota, monto)").eq("id", avisoId).maybeSingle();
  if (!aviso || aviso.proveedor_id !== cuenta.proveedor.id) return { error: "Ese aviso no existe." };
  if (aviso.estado !== "avisado") return { error: "Ya lo confirmaste." };
  const texto = typeof nota === "string" ? nota.trim().slice(0, 300) : "";
  // Primero se marca confirmado (solo si seguía avisado): así dos clics no registran el pago dos veces.
  const { data: marcado } = await supabase
    .from("proveedor_avisos_pago")
    .update({ estado: "confirmado", confirmado_por: cuenta.cuentaId, confirmado_en: new Date().toISOString(), nota: texto || null })
    .eq("id", avisoId)
    .eq("estado", "avisado")
    .select("id");
  if (!marcado?.length) return { error: "Ya lo confirmaste." };
  const cuotas = (aviso.proveedor_aviso_cuotas as { pedido_id: string; cuota: string; monto: number }[] | null) ?? [];
  const { error } = await supabase
    .from("proveedor_pagos")
    .insert(cuotas.map((c) => ({ proveedor_id: cuenta.proveedor.id, pedido_id: c.pedido_id, cuota: c.cuota, monto: c.monto, fecha: aviso.fecha, origen: "aviso", aviso_id: avisoId })));
  if (error) {
    await supabase.from("proveedor_avisos_pago").update({ estado: "avisado", confirmado_por: null, confirmado_en: null, nota: null }).eq("id", avisoId);
    return { error: "No se pudo confirmar. Inténtalo de nuevo." };
  }
  const dinero = `$${Number(aviso.monto).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const titulo = `${cuenta.proveedor.nombre} confirmó el pago de ${dinero}${aviso.referencia ? ` (${aviso.referencia})` : ""}`;
  const detalle = `${cuotas.length} cuotas${texto ? ` · «${texto}»` : ""}`;
  await Promise.all([
    supabase.from("proveedor_novedades").insert({ proveedor_id: cuenta.proveedor.id, lado: "proveedor", tipo: "pago", texto: titulo, detalle, autor_nombre: cuenta.nombre }),
    cuenta.proveedor.notificarA
      ? supabase.from("notificaciones_usuario").insert({ usuario_id: cuenta.proveedor.notificarA, tipo: "proveedor", titulo, texto: detalle, href: "/portal-proveedor?tab=pagos", autor_nombre: `${cuenta.proveedor.nombre} (proveedor)` })
      : Promise.resolve(),
    supabase.from("historial_auditoria").insert({ usuario_id: null, usuario_nombre: `${cuenta.proveedor.nombre} (proveedor)`, accion: "editar_campo_compra", entidad: "proveedor_avisos_pago", entidad_id: avisoId, detalle: `${titulo}. ${detalle}` }),
  ]);
  return {};
}

/** Lo nuevo de Ecomfive (decisiones, llegadas) queda visto al abrir el portal. */
export async function marcarVistoPorProveedor(): Promise<void> {
  const cuenta = await cuentaProveedorActual();
  if (!cuenta) return;
  await createServiceClient().from("proveedor_novedades").update({ leida_en: new Date().toISOString() }).eq("proveedor_id", cuenta.proveedor.id).eq("lado", "ecomfive").is("leida_en", null);
}
