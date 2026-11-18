"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual } from "@/lib/auth";
import { hoyPanama } from "@/lib/af4/fecha";
import { pagadoTrasSegundoPago, revisarPago } from "@/lib/compras/llegadas-avisos";
import { esAdministrador } from "@/lib/permisos/acceso";
import { esUuid } from "@/lib/seguridad/ruta-almacen";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoACompras } from "../compras/acceso-compras";
import { restriccionesDe, vePagosProveedor } from "../compras/permisos-compras";

type Supabase = ReturnType<typeof createServiceClient>;
type Usuario = NonNullable<Awaited<ReturnType<typeof getUsuarioActual>>>;

/**
 * La llegada (de bodega) y si la persona puede registrar pagos en ella: un administrador o quien modifica Compras y ve el segundo pago (Francis). Quien recibe el aviso de En Bodega (María José) lo recibe para
 * enterarse de lo que se debe pagar, no para registrarlo (17 nov 2026). Devuelve el error en palabras.
 */
async function autorizarPagos(supabase: Supabase, usuario: Usuario, llegadaId: string, compraIds: string[]): Promise<string | null> {
  const { data: llegada } = await supabase.from("compras_llegadas").select("id, tipo").eq("id", llegadaId).maybeSingle();
  if (!llegada) return "Esa llegada ya no existe.";
  if (llegada.tipo !== "bodega") return "Solo se paga en una llegada «En Bodega».";
  const comprasEscribe = usuario.modulos.includes("compras") && !usuario.modulosSoloLectura.includes("compras") && vePagosProveedor(restriccionesDe(usuario.afinado.compras));
  if (!esAdministrador(usuario) && !comprasEscribe) return "Los pagos los registra quien gestiona Compras: tu usuario solo ve esta llegada.";
  if (!esAdministrador(usuario)) {
    const sinAcceso = await sinAccesoACompras(compraIds, usuario);
    if (sinAcceso) return sinAcceso;
  }
  return null;
}

/**
 * Registra el segundo pago de una compra de una llegada «En Bodega» (16 nov 2026, pedido de Hernán): queda el día, el monto y quién lo registró, el «Pagado a Proveedor» de la compra
 * sube hasta primer pago + este pago y la compra pasa a «08 - Completado» (la mercancía ya está en bodega y el segundo pago está hecho). Ya revisadas la persona y la llegada.
 */
async function pagarCompra(supabase: Supabase, usuario: Usuario, llegadaId: string, compraId: string, monto: unknown, dia: unknown): Promise<{ error?: string }> {
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
  return {};
}

/** Registra el segundo pago de una compra de una llegada «En Bodega». Devuelve el error como valor. */
export async function registrarPagoLlegada(llegadaId: string, compraId: string, monto: unknown, dia: unknown): Promise<{ error?: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario) return { error: "Vuelve a iniciar sesión." };
  if (!esUuid(llegadaId) || !esUuid(compraId)) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const noAutorizado = await autorizarPagos(supabase, usuario, llegadaId, [compraId]);
  if (noAutorizado) return { error: noAutorizado };
  const r = await pagarCompra(supabase, usuario, llegadaId, compraId, monto, dia);
  if (r.error) return r;
  revalidatePath(`/llegadas/${llegadaId}`);
  revalidatePath("/compras/lista");
  return {};
}

/**
 * «Pago total» (17 nov 2026, pedido de Hernán: la llegada se paga completa): registra el segundo pago de **todas** las compras de la llegada que siguen sin pagar, cada una con su monto de segundo pago
 * y el mismo día, y las pasa a Completado. Si alguna no tiene monto no hace nada (hay que registrarla a mano). Si una falla a medias, dice cuántas quedaron pagadas; las demás se pueden volver a intentar.
 */
export async function registrarPagoTotalLlegada(llegadaId: string, dia: unknown): Promise<{ error?: string; pagadas?: number; total?: number }> {
  const usuario = await getUsuarioActual();
  if (!usuario) return { error: "Vuelve a iniciar sesión." };
  if (!esUuid(llegadaId)) return { error: "Datos no válidos." };
  const supabase = createServiceClient();
  const { data: items } = await supabase.from("compras_llegada_items").select("compra_id, pagado_en").eq("llegada_id", llegadaId);
  const pendientes = ((items ?? []) as { compra_id: string; pagado_en: string | null }[]).filter((i) => !i.pagado_en).map((i) => i.compra_id);
  if (pendientes.length === 0) return { error: "Todas las compras de esta llegada ya están pagadas." };
  const noAutorizado = await autorizarPagos(supabase, usuario, llegadaId, pendientes);
  if (noAutorizado) return { error: noAutorizado };
  const { data: compras } = await supabase.from("wms_compras").select("id, etapa, segundo_pago").in("id", pendientes);
  const lista = (compras ?? []) as { id: string; etapa: string; segundo_pago: number | string | null }[];
  const sinMonto = lista.filter((c) => c.segundo_pago == null || Number(c.segundo_pago) <= 0).length;
  if (sinMonto > 0) return { error: `${sinMonto === 1 ? "Una compra no tiene" : `${sinMonto} compras no tienen`} monto de segundo pago: regístralas una por una con el monto que pagaste.` };
  const fueraDeBodega = lista.filter((c) => c.etapa !== "en_bodega").length;
  if (fueraDeBodega > 0) return { error: `${fueraDeBodega === 1 ? "Una compra ya no está" : `${fueraDeBodega} compras ya no están`} en «07 - En Bodega»; revisa su etapa en Compras.` };
  let pagadas = 0;
  for (const c of lista) {
    const r = await pagarCompra(supabase, usuario, llegadaId, c.id, Number(c.segundo_pago), dia);
    if (r.error) {
      revalidatePath(`/llegadas/${llegadaId}`);
      revalidatePath("/compras/lista");
      return { error: `Se pagaron ${pagadas} de ${lista.length}. ${r.error}`, pagadas, total: lista.length };
    }
    pagadas += 1;
  }
  revalidatePath(`/llegadas/${llegadaId}`);
  revalidatePath("/compras/lista");
  return { pagadas, total: lista.length };
}
