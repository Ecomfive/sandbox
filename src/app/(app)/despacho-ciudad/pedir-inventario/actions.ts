"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura, type UsuarioActual } from "@/lib/auth";
import { cargarBodegasPedido } from "@/lib/pedidos-inventario/datos";
import { avisoPedido, numeroPedido, revisarEntregas, revisarLineas } from "@/lib/pedidos-inventario/reglas";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { numeroTraslado } from "@/lib/wms/traslado";

// Pedir a inventario (16 nov 2026, migración 0305): despacho pide, inventario pone en proceso y envía (hace el traslado), despacho recibe.
// Cada acción revisa su permiso en el servidor y cambia el estado solo si el pedido sigue en el estado que corresponde (dos clics no hacen dos traslados).

const MODULO_DESPACHO = "despacho-pedir-inventario";
const MODULO_INVENTARIO = "inventario-pedidos-despacho";
const RUTAS = ["/despacho-ciudad/pedir-inventario", "/inventario-pedidos-despacho"];
const ES_UUID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const SIN_MIGRACION = "Falta correr en Supabase la migración 0305 («Pedir a inventario»).";
const nombreDe = (u: UsuarioActual) => (u.nombre || u.email || "Alguien").trim();

type Resultado = { ok: true; mensaje?: string } | { error: string };

async function conPermiso(modulo: string, hacer: (u: UsuarioActual) => Promise<Resultado>): Promise<Resultado> {
  let u: UsuarioActual;
  try {
    u = await requireModuloEscritura(modulo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No tienes permiso." };
  }
  const r = await hacer(u);
  if ("ok" in r) for (const ruta of RUTAS) revalidatePath(ruta);
  return r;
}

type Supa = ReturnType<typeof createServiceClient>;

/** Deja un aviso «Para ti» a esas personas (menos a quien hace la acción). */
async function avisar(supabase: Supa, a: (string | null | undefined)[], u: UsuarioActual, aviso: { titulo: string; texto: string }, href: string) {
  const destinos = [...new Set(a.filter((id): id is string => !!id && id !== u.id))];
  if (!destinos.length) return;
  await supabase
    .from("notificaciones_usuario")
    .insert(destinos.map((id) => ({ usuario_id: id, tipo: "tarea", titulo: aviso.titulo, texto: aviso.texto, href, autor_id: u.id, autor_nombre: nombreDe(u) })));
}

/** Quienes atienden los pedidos como permiso propio (Dinora, migración 0305); a los administradores no, para no llenarles la campana. */
async function quienesAtienden(supabase: Supa): Promise<string[]> {
  const { data } = await supabase.from("permisos_persona").select("perfil_id").eq("modulo", MODULO_INVENTARIO).eq("nivel", "edicion");
  return ((data ?? []) as { perfil_id: string }[]).map((r) => r.perfil_id);
}

/** Despacho hace un pedido: uno o varios productos del catálogo, con su cantidad y una nota. Le llega el aviso a inventario. */
export async function crearPedidoInventario(lineas: unknown): Promise<Resultado> {
  return conPermiso(MODULO_DESPACHO, async (u) => {
    const revisadas = revisarLineas(lineas);
    if ("error" in revisadas) return revisadas;
    const supabase = createServiceClient();
    const { destino } = await cargarBodegasPedido(supabase);
    if (!destino) return { error: "No encontré la bodega de despacho de Panamá (una bodega propia activa que empiece con «Despacho»)." };
    const ids = revisadas.lineas.map((l) => l.skuId);
    const { data: skus } = await supabase.from("skus_maestros").select("id, codigo, nombre, tipo, opciones_variantes").in("id", ids);
    const porId = new Map(((skus ?? []) as { id: string; codigo: string; nombre: string; tipo: string; opciones_variantes: unknown }[]).map((s) => [s.id, s]));
    for (const l of revisadas.lineas) {
      const s = porId.get(l.skuId);
      if (!s) return { error: "Un producto ya no existe: elígelo otra vez de la lista." };
      if (s.tipo !== "simple" || s.opciones_variantes) return { error: `«${s.nombre}» no se puede pedir así: elige el producto suelto (sin combo) o la variante exacta.` };
    }
    const { data: pedido, error } = await supabase
      .from("despacho_pedidos_inventario")
      .insert({ bodega_destino_id: destino.id, pedido_por: u.id, pedido_por_nombre: nombreDe(u) })
      .select("id, numero")
      .single();
    if (error || !pedido) return { error: error && /despacho_pedidos_inventario/.test(error.message) ? SIN_MIGRACION : "No se pudo guardar el pedido." };
    const { error: e2 } = await supabase.from("despacho_pedidos_inventario_items").insert(
      revisadas.lineas.map((l, i) => {
        const s = porId.get(l.skuId)!;
        return { pedido_id: pedido.id, orden: i, sku_id: s.id, producto: String(s.nombre).slice(0, 300), codigo: s.codigo, cantidad_pedida: l.cantidad, nota: l.nota };
      }),
    );
    if (e2) {
      await supabase.from("despacho_pedidos_inventario").delete().eq("id", pedido.id);
      return { error: "No se pudo guardar el pedido." };
    }
    await avisar(supabase, await quienesAtienden(supabase), u, avisoPedido({ numero: pedido.numero, items: revisadas.lineas.length }, nombreDe(u), "nuevo"), "/inventario-pedidos-despacho");
    return { ok: true, mensaje: `${numeroPedido(pedido.numero)} enviado a inventario.` };
  });
}

/** Despacho cancela un pedido que inventario todavía no tomó. */
export async function cancelarPedidoInventario(id: string): Promise<Resultado> {
  return conPermiso(MODULO_DESPACHO, async (u) => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("despacho_pedidos_inventario")
      .update({ estado: "cancelado", cancelado_en: new Date().toISOString() })
      .eq("id", id)
      .eq("estado", "solicitud")
      .select("numero, despacho_pedidos_inventario_items(id)");
    const p = data?.[0];
    if (!p) return { error: "Ya no se puede cancelar: inventario ya lo tomó." };
    const items = (p.despacho_pedidos_inventario_items as unknown[] | null)?.length ?? 0;
    await avisar(supabase, await quienesAtienden(supabase), u, avisoPedido({ numero: p.numero as number, items }, nombreDe(u), "cancelado"), "/inventario-pedidos-despacho");
    return { ok: true, mensaje: `${numeroPedido(p.numero as number)} cancelado.` };
  });
}

/** Inventario toma el pedido: queda «En proceso» y le llega el aviso a quien lo pidió. */
export async function ponerEnProcesoPedido(id: string): Promise<Resultado> {
  return conPermiso(MODULO_INVENTARIO, async (u) => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("despacho_pedidos_inventario")
      .update({ estado: "en_proceso", en_proceso_en: new Date().toISOString(), responsable_id: u.id, responsable_nombre: nombreDe(u) })
      .eq("id", id)
      .eq("estado", "solicitud")
      .select("numero, pedido_por, despacho_pedidos_inventario_items(id)");
    const p = data?.[0];
    if (!p) return { error: "Ese pedido ya cambió de estado: recarga la página." };
    const items = (p.despacho_pedidos_inventario_items as unknown[] | null)?.length ?? 0;
    await avisar(supabase, [p.pedido_por as string], u, avisoPedido({ numero: p.numero as number, items }, nombreDe(u), "en_proceso"), "/despacho-ciudad/pedir-inventario");
    return { ok: true, mensaje: `${numeroPedido(p.numero as number)} en proceso.` };
  });
}

/**
 * Inventario envía: guarda cuánto mandó de cada producto y hace el traslado de la bodega elegida a la de despacho
 * (`wms_crear_traslado`: todo o nada). Primero marca el pedido como enviado (así un segundo clic no hace otro traslado);
 * si el traslado falla, lo devuelve al estado que tenía.
 */
export async function enviarPedidoInventario(id: string, origenId: string, entregas: unknown): Promise<Resultado> {
  return conPermiso(MODULO_INVENTARIO, async (u) => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    if (!ES_UUID(origenId)) return { error: "Elige de qué bodega sale." };
    const supabase = createServiceClient();
    const { destino, origenes } = await cargarBodegasPedido(supabase);
    if (!destino || !origenes.some((b) => b.id === origenId)) return { error: "Esa bodega no puede enviar a despacho." };
    if (!(await puedeVerBodega(supabase, u.paisesPermitidos, origenId))) return { error: "No tienes acceso al país de esa bodega." };
    const { data: p } = await supabase
      .from("despacho_pedidos_inventario")
      .select("id, numero, estado, pedido_por, bodega_destino_id, responsable_id, responsable_nombre, en_proceso_en, despacho_pedidos_inventario_items(id, sku_id)")
      .eq("id", id)
      .maybeSingle();
    if (!p) return { error: "Ese pedido ya no existe." };
    const estadoAntes = p.estado as string;
    if (estadoAntes !== "solicitud" && estadoAntes !== "en_proceso") return { error: "Ese pedido ya fue enviado o cerrado: recarga la página." };
    const items = (p.despacho_pedidos_inventario_items as { id: string; sku_id: string }[] | null) ?? [];
    const revisadas = revisarEntregas(items, entregas);
    if ("error" in revisadas) return revisadas;

    const ahora = new Date().toISOString();
    const { data: tomado } = await supabase
      .from("despacho_pedidos_inventario")
      .update({ estado: "enviado", enviado_en: ahora, bodega_origen_id: origenId, responsable_id: u.id, responsable_nombre: nombreDe(u), en_proceso_en: p.en_proceso_en ?? ahora })
      .eq("id", id)
      .eq("estado", estadoAntes)
      .select("id");
    if (!tomado?.length) return { error: "Ese pedido ya cambió de estado: recarga la página." };

    const skuDe = new Map(items.map((it) => [it.id, it.sku_id]));
    const lineas = revisadas.entregas.filter((e) => e.cantidad > 0).map((e) => ({ sku: skuDe.get(e.id)!, cantidad: e.cantidad }));
    const nota = `${numeroPedido(p.numero as number)} · pedido de despacho`;
    const { data: tr, error } = await supabase.rpc("wms_crear_traslado", { p_desde: origenId, p_hacia: p.bodega_destino_id, p_items: lineas, p_notas: nota, p_usuario: u.id, p_nombre: nombreDe(u) });
    if (error || !tr) {
      await supabase
        .from("despacho_pedidos_inventario")
        .update({ estado: estadoAntes, enviado_en: null, bodega_origen_id: null, responsable_id: p.responsable_id, responsable_nombre: p.responsable_nombre, en_proceso_en: p.en_proceso_en })
        .eq("id", id);
      const msg = error?.message ?? "";
      return { error: msg && msg.length < 200 && !/wms_crear_traslado/.test(msg) ? `No se pudo hacer el traslado: ${msg}` : "No se pudo hacer el traslado." };
    }
    const creado = tr as { id: string; numero: number };
    const numTr = numeroTraslado(creado.numero);
    await supabase.from("despacho_pedidos_inventario").update({ traslado_id: creado.id }).eq("id", id);
    await Promise.all(revisadas.entregas.map((e) => supabase.from("despacho_pedidos_inventario_items").update({ cantidad_entregada: e.cantidad, observacion: e.observacion }).eq("id", e.id)));
    const unidades = lineas.reduce((t, l) => t + l.cantidad, 0);
    await registrarAuditoria({
      accion: "traslado_inventario",
      entidad: "wms_traslados",
      entidadId: creado.id,
      detalle: `${numTr}: ${lineas.length} ${lineas.length === 1 ? "producto" : "productos"}, ${unidades.toLocaleString("es-PA")} unidades · ${nota}`,
    });
    await avisar(supabase, [p.pedido_por as string], u, avisoPedido({ numero: p.numero as number, items: items.length }, nombreDe(u), "enviado", numTr), "/despacho-ciudad/pedir-inventario");
    revalidatePath("/inventario");
    revalidatePath("/inventario/traslados");
    return { ok: true, mensaje: `Enviado: se hizo el traslado ${numTr} a ${destino.nombre}.` };
  });
}

/** Despacho marca que le llegó: el pedido queda cerrado y le llega el aviso a quien lo envió. */
export async function recibirPedidoInventario(id: string): Promise<Resultado> {
  return conPermiso(MODULO_DESPACHO, async (u) => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("despacho_pedidos_inventario")
      .update({ estado: "recibido", recibido_en: new Date().toISOString(), recibido_por: u.id, recibido_por_nombre: nombreDe(u) })
      .eq("id", id)
      .eq("estado", "enviado")
      .select("numero, responsable_id, despacho_pedidos_inventario_items(id)");
    const p = data?.[0];
    if (!p) return { error: "Ese pedido no está enviado: recarga la página." };
    const items = (p.despacho_pedidos_inventario_items as unknown[] | null)?.length ?? 0;
    await avisar(supabase, [p.responsable_id as string | null], u, avisoPedido({ numero: p.numero as number, items }, nombreDe(u), "recibido"), "/inventario-pedidos-despacho");
    return { ok: true, mensaje: `${numeroPedido(p.numero as number)} recibido.` };
  });
}
