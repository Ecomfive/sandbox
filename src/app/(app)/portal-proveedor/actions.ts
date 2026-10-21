"use server";

import { actualizarCampoCompra } from "../compras/actions";
import { getUsuarioActual, requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { ETIQUETA_ETAPA_PORTAL, type EtapaPortal } from "@/lib/proveedor/espejo";
import { hoyPanama } from "@/lib/proveedor/fechas";
import { puedePasar } from "@/lib/proveedor/permisos-proveedor";
import { createServiceClient } from "@/lib/supabase/server";

const ES_ID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const MAX_NOTA = 600;

type Resultado = { error?: string };

/** El pedido del espejo, si la persona puede tocarlo (módulo con escritura y su país). */
async function pedidoParaEditar(pedidoId: unknown) {
  await requireModuloEscritura("portal-proveedor");
  if (!ES_ID(pedidoId)) return { error: "Pedido no válido." } as const;
  const usuario = await getUsuarioActual();
  if (!usuario) return { error: "Tu sesión expiró. Vuelve a entrar." } as const;
  const supabase = createServiceClient();
  const { data } = await supabase.from("proveedor_pedidos").select("id, compra_id, proveedor_id, producto, etapa, pais_codigo, visible").eq("id", pedidoId).maybeSingle();
  if (!data || !data.visible) return { error: "Ese pedido ya no está en el portal." } as const;
  if (!puedeVerPais(usuario.paisesPermitidos, data.pais_codigo as string | null)) return { error: "No tienes acceso a las compras de ese país." } as const;
  return { supabase, usuario, pedido: data as { id: string; compra_id: string; proveedor_id: string; producto: string; etapa: EtapaPortal } };
}

/** Cambia la compra con la misma acción de Compras (sus permisos, su evento, su Actividad y su auditoría). */
async function cambiarCompra(compraId: string, campo: string, valor: unknown): Promise<Resultado> {
  try {
    const r = await actualizarCampoCompra(compraId, campo, valor);
    return r.error ? { error: r.error } : {};
  } catch {
    return { error: "Necesitas poder modificar Compras para hacer esto." };
  }
}

async function avisarAlProveedor(proveedorId: string, pedidoId: string, tipo: "decision" | "llegada" | "pedido", texto: string, autor: string | null) {
  await createServiceClient().from("proveedor_novedades").insert({ proveedor_id: proveedorId, pedido_id: pedidoId, lado: "ecomfive", tipo, texto, autor_nombre: autor });
}

/** «Por decidir»: un pedido cotizado pasa a Producción o se descarta. Cambia la etapa de la compra y Chin lo ve. */
export async function decidirPedido(pedidoId: string, decision: "produccion" | "descartado"): Promise<Resultado & { etapa?: EtapaPortal }> {
  const r = await pedidoParaEditar(pedidoId);
  if ("error" in r) return { error: r.error };
  if (decision !== "produccion" && decision !== "descartado") return { error: "Decisión no válida." };
  if (!puedePasar("ecomfive", r.pedido.etapa, decision)) return { error: `Ese pedido está en «${ETIQUETA_ETAPA_PORTAL[r.pedido.etapa]}»: ya no se decide aquí.` };
  const cambio = await cambiarCompra(r.pedido.compra_id, "etapa", decision);
  if (cambio.error) return cambio;
  await avisarAlProveedor(r.pedido.proveedor_id, r.pedido.id, "decision", decision === "produccion" ? `Ecomfive confirmó ${r.pedido.producto}: pasa a producción` : `Ecomfive descartó ${r.pedido.producto}`, r.usuario.nombre);
  return { etapa: decision };
}

/** «Tránsito»: llegó lo que Chin envió. La compra pasa a «Arribo mercancía» con la fecha de llegada de hoy; el saldo vence hoy. */
export async function marcarLlegada(pedidoId: string): Promise<Resultado & { fechaLlegada?: string }> {
  const r = await pedidoParaEditar(pedidoId);
  if ("error" in r) return { error: r.error };
  if (!puedePasar("ecomfive", r.pedido.etapa, "llegado")) return { error: "Solo se marca la llegada de lo que está enviado." };
  const hoy = hoyPanama();
  const fecha = await cambiarCompra(r.pedido.compra_id, "fechaLlegada", hoy);
  if (fecha.error) return fecha;
  const etapa = await cambiarCompra(r.pedido.compra_id, "etapa", "arribo_mercancia");
  if (etapa.error) return etapa;
  await avisarAlProveedor(r.pedido.proveedor_id, r.pedido.id, "llegada", `Llegó ${r.pedido.producto}`, r.usuario.nombre);
  return { fechaLlegada: hoy };
}

/** «En cotización»: la nota que Chin lee junto al pedido (vive en la compra, `wms_compras.nota_proveedor`). */
export async function guardarNotaProveedor(pedidoId: string, texto: string): Promise<Resultado> {
  const r = await pedidoParaEditar(pedidoId);
  if ("error" in r) return { error: r.error };
  const nota = typeof texto === "string" ? texto.trim().slice(0, MAX_NOTA) : "";
  const { data: antes } = await r.supabase.from("wms_compras").select("nota_proveedor").eq("id", r.pedido.compra_id).maybeSingle();
  const { error } = await r.supabase.from("wms_compras").update({ nota_proveedor: nota || null, actualizado_en: new Date().toISOString() }).eq("id", r.pedido.compra_id);
  if (error) return { error: "No se pudo guardar la nota." };
  await registrarAuditoria({
    accion: "editar_campo_compra",
    entidad: "wms_compras",
    entidadId: r.pedido.compra_id,
    antes: { "Nota para el proveedor": (antes?.nota_proveedor as string | null) ?? "" },
    despues: { "Nota para el proveedor": nota },
  });
  return {};
}

/** «Novedades del proveedor»: marca como leído todo lo que cambió el proveedor. */
export async function marcarNovedadesLeidas(proveedorId: string): Promise<Resultado> {
  await requireModuloEscritura("portal-proveedor");
  if (!ES_ID(proveedorId)) return { error: "Proveedor no válido." };
  const { error } = await createServiceClient().from("proveedor_novedades").update({ leida_en: new Date().toISOString() }).eq("proveedor_id", proveedorId).eq("lado", "proveedor").is("leida_en", null);
  return error ? { error: "No se pudo marcar como leído." } : {};
}
