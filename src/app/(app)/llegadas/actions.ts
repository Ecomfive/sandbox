"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual } from "@/lib/auth";
import { hoyPanama } from "@/lib/af4/fecha";
import { pagadoTrasSegundoPago, revisarPago } from "@/lib/compras/llegadas-avisos";
import { destinatariosDe } from "@/lib/compras/llegadas-servidor";
import { esAdministrador } from "@/lib/permisos/acceso";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoACompras } from "../compras/acceso-compras";
import { campoOculto, restriccionesDe } from "../compras/permisos-compras";

/**
 * Registra el segundo pago de una compra de una llegada «En Bodega» (16 nov 2026, pedido de Hernán): queda el día, el monto y quién lo registró, el «Pagado a Proveedor» de la compra
 * sube hasta primer pago + este pago y la compra pasa a «08 - Completado» (la mercancía ya está en bodega y el segundo pago está hecho). Puede hacerlo quien recibe el aviso de pagos,
 * un administrador o quien modifica Compras y ve ese monto. Devuelve el error como valor.
 */
export async function registrarPagoLlegada(llegadaId: string, compraId: string, monto: unknown, dia: unknown): Promise<{ error?: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario) return { error: "Vuelve a iniciar sesión." };
  if (!esUuid(llegadaId) || !esUuid(compraId)) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { data: llegada } = await supabase.from("compras_llegadas").select("id, tipo").eq("id", llegadaId).maybeSingle();
  if (!llegada) return { error: "Esa llegada ya no existe." };
  if (llegada.tipo !== "bodega") return { error: "Solo se paga en una llegada «En Bodega»." };

  const destinatarias = await destinatariosDe(supabase, "llegada_bodega");
  const comprasEscribe = usuario.modulos.includes("compras") && !usuario.modulosSoloLectura.includes("compras") && !campoOculto(restriccionesDe(usuario.afinado.compras), "pago2");
  if (!destinatarias.includes(usuario.id) && !esAdministrador(usuario) && !comprasEscribe) return { error: "Tu usuario no puede registrar este pago." };
  if (!destinatarias.includes(usuario.id) && !esAdministrador(usuario)) {
    const sinAcceso = await sinAccesoACompras([compraId], usuario);
    if (sinAcceso) return { error: sinAcceso };
  }

  const revisado = revisarPago(monto, dia, hoyPanama());
  if ("error" in revisado) return revisado;

  const { data: item } = await supabase.from("compras_llegada_items").select("id, pagado_en").eq("llegada_id", llegadaId).eq("compra_id", compraId).maybeSingle();
  if (!item) return { error: "Esa compra no está en esta llegada." };
  if (item.pagado_en) return { error: "El pago de esta compra ya está registrado." };
  const { data: compra } = await supabase.from("wms_compras").select("id, codigo, numero, etapa, estado, primer_pago, segundo_pago, pagado_a_proveedor, cerrado_en").eq("id", compraId).maybeSingle();
  if (!compra) return { error: "La compra ya no existe." };
  if (compra.etapa !== "en_bodega") return { error: "La compra ya no está en «07 - En Bodega»; revisa su etapa en Compras." };

  const nombre = usuario.nombre || usuario.email;
  // Primero la marca del pago (con la guarda de «todavía sin pagar»: dos personas a la vez no lo registran dos veces) y después la compra.
  const { data: marcado, error: errPago } = await supabase
    .from("compras_llegada_items")
    .update({ pagado_en: revisado.dia, monto_pagado: revisado.monto, pagado_por: usuario.id, pagado_por_nombre: nombre })
    .eq("id", item.id)
    .is("pagado_en", null)
    .select("id");
  if (errPago) return { error: errPago.message.length < 200 ? errPago.message : "No se pudo registrar el pago." };
  if (!marcado || marcado.length === 0) return { error: "El pago de esta compra ya está registrado." };

  const ahora = new Date().toISOString();
  const pagado = pagadoTrasSegundoPago(compra.pagado_a_proveedor == null ? null : Number(compra.pagado_a_proveedor), compra.primer_pago == null ? null : Number(compra.primer_pago), revisado.monto);
  const { error: errCompra } = await supabase
    .from("wms_compras")
    .update({
      etapa: "completado",
      pagado_a_proveedor: pagado,
      ...(compra.segundo_pago == null ? { segundo_pago: revisado.monto } : {}),
      cerrado_en: compra.cerrado_en ?? ahora,
      actualizado_en: ahora,
    })
    .eq("id", compraId);
  if (errCompra) {
    // La compra no cambió: se deshace la marca para que se pueda volver a intentar.
    await supabase.from("compras_llegada_items").update({ pagado_en: null, monto_pagado: null, pagado_por: null, pagado_por_nombre: null }).eq("id", item.id);
    return { error: errCompra.message.length < 200 ? errCompra.message : "No se pudo completar la compra." };
  }
  await supabase.from("wms_compra_eventos").insert({ compra_id: compraId, campo: "etapa", valor_antes: "en_bodega", valor_despues: "completado", autor: nombre, origen: "sistema" });
  await registrarAuditoria({
    accion: "registrar_pago_llegada",
    entidad: "wms_compras",
    entidadId: compraId,
    detalle: `Segundo pago registrado (${revisado.monto.toLocaleString("es-PA", { minimumFractionDigits: 2 })} el ${revisado.dia}); la compra pasó a Completado`,
    antes: { Etapa: "07 - En Bodega", "Pagado a Proveedor": compra.pagado_a_proveedor == null ? "—" : String(compra.pagado_a_proveedor) },
    despues: { Etapa: "08 - Completado", "Pagado a Proveedor": String(pagado) },
  });
  revalidatePath(`/llegadas/${llegadaId}`);
  revalidatePath("/compras/lista");
  return {};
}
