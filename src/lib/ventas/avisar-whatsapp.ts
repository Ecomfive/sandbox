import type { createServiceClient } from "@/lib/supabase/server";
import { aE164, chatmaidConfigurado, enviarChatmaid, PLANTILLAS, textoAviso, type PlantillaAviso } from "@/lib/ventas/chatmaid";
import { normalizarTelefono, type PaisOp } from "@/lib/ventas/operacion";

type Cliente = ReturnType<typeof createServiceClient>;

/**
 * Manda un aviso por WhatsApp (Chatmaid) al cliente de una orden y lo deja registrado.
 * El teléfono se lee aquí, en el servidor: nunca viaja al navegador. Respeta la lista negra y no repite el mismo aviso en 12 horas.
 */
export async function avisarOrden(supabase: Cliente, ordenId: string, plantilla: PlantillaAviso, quien: string): Promise<{ ok: true; aviso?: string } | { error: string }> {
  if (!PLANTILLAS.some((p) => p.id === plantilla)) return { error: "Aviso inválido." };
  const { data: o } = await supabase.from("ven_ordenes").select("id, numero, unidad_id, total, guia, transportista, repartidor_id, prometida_para, ven_orden_lineas(producto, cantidad)").eq("id", ordenId).maybeSingle();
  if (!o) return { error: "No encontré la orden." };
  const [{ data: u }, { data: c }] = await Promise.all([
    supabase.from("fin_unidades").select("nombre, pais").eq("id", o.unidad_id).maybeSingle(),
    supabase.from("ven_ordenes_clientes").select("nombre, telefono").eq("orden_id", ordenId).maybeSingle(),
  ]);
  const pais = ((u?.pais as PaisOp | undefined) ?? "PA") as PaisOp;
  const n = normalizarTelefono(pais, c?.telefono as string | null);
  if (!n.valido) return { error: `El teléfono del cliente no sirve: ${n.motivo ?? "inválido"}.` };
  const cfg = chatmaidConfigurado(pais);
  if (!cfg) return { error: "Falta configurar Chatmaid (CHATMAID_API_KEY y el número de envío) en el servidor." };
  const { data: l } = await supabase.from("ven_clientes_lista").select("tipo").eq("telefono_clave", n.clave).maybeSingle();
  if (l?.tipo === "negra") return { error: "El cliente está en la lista negra: no se le escribe." };
  const desde = new Date(Date.now() - 12 * 3_600_000).toISOString();
  const { data: previo } = await supabase.from("ven_whatsapp_mensajes").select("id").eq("orden_id", ordenId).eq("plantilla", plantilla).eq("direccion", "saliente").neq("estado", "fallido").gte("creado_en", desde).limit(1);
  if (previo && previo.length) return { error: "Ese aviso ya se envió hace menos de 12 horas." };
  let con: string | null = (o.transportista as string | null) ?? null;
  if (!con && o.repartidor_id) {
    const { data: r } = await supabase.from("del_repartidores").select("nombre").eq("id", o.repartidor_id).maybeSingle();
    con = (r?.nombre as string | undefined) ?? null;
  }
  const lineas = ((o.ven_orden_lineas ?? []) as { producto: string; cantidad: number }[]).map((x) => `${x.cantidad} × ${x.producto}`).join(", ");
  const cuerpo = textoAviso(plantilla, { nombre: c?.nombre as string | null, tienda: (u?.nombre as string | undefined) ?? "la tienda", numero: String(o.numero), productos: lineas || "tu compra", total: Number(o.total) || null, guia: (o.guia as string | null) ?? null, con, fechaPrometida: (o.prometida_para as string | null) ?? null });
  const { data: fila, error: eIns } = await supabase.from("ven_whatsapp_mensajes").insert({ orden_id: ordenId, telefono_clave: n.clave, direccion: "saliente", plantilla, cuerpo, estado: "pendiente", por: quien }).select("id").single();
  if (eIns || !fila) return { error: /ven_whatsapp/.test(eIns?.message ?? "") ? "Falta correr la migración 0958 en Supabase." : (eIns?.message ?? "No se pudo registrar el mensaje.") };
  const r = await enviarChatmaid(cfg, aE164(pais, n.clave)!, cuerpo, `${ordenId.slice(0, 8)}-${plantilla}-${String(fila.id).slice(0, 8)}`);
  if (!r.ok) {
    await supabase.from("ven_whatsapp_mensajes").update({ estado: "fallido", error: r.error, actualizado_en: new Date().toISOString() }).eq("id", fila.id);
    return { error: r.error };
  }
  await supabase.from("ven_whatsapp_mensajes").update({ proveedor_id: r.id, estado: r.estado === "sent" ? "enviado" : "pendiente", actualizado_en: new Date().toISOString() }).eq("id", fila.id);
  await supabase.from("ven_orden_eventos").insert({ orden_id: ordenId, tipo: "nota", detalle: `WhatsApp enviado: ${PLANTILLAS.find((p) => p.id === plantilla)?.nombre}`, usuario: quien });
  return { ok: true };
}

/** Aviso automático al cambiar de fase, solo si ese aviso está encendido en `ven_config.whatsapp_auto`. Nunca rompe el cambio de fase. */
export async function avisoAutomaticoDeFase(supabase: Cliente, ordenId: string, fase: string): Promise<void> {
  try {
    const p = PLANTILLAS.find((x) => x.fase === fase);
    if (!p) return;
    const { data: cfg } = await supabase.from("ven_config").select("valor").eq("clave", "whatsapp_auto").maybeSingle();
    if (!(cfg?.valor as Record<string, boolean> | undefined)?.[fase]) return;
    await avisarOrden(supabase, ordenId, p.id, "Sistema");
  } catch {
    /* el aviso es un extra */
  }
}
