"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura, type UsuarioActual } from "@/lib/auth";
import { cargarBodegasPedido, cargarStock, stockInventario } from "@/lib/pedidos-inventario/datos";
import { avisoEdicion, avisoPedido, cambiosDeEdicion, numeroPedido, estadoAntesDeEnviar, puedeArchivar, puedeDeshacerEnvio, puedeEditar, revisarEdicion, revisarEntregas, revisarLineas, revisarStockPedido, type EstadoPedido } from "@/lib/pedidos-inventario/reglas";
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
    const { destino, origenes } = await cargarBodegasPedido(supabase);
    if (!destino) return { error: "No encontré la bodega de despacho de Panamá (una bodega propia activa que empiece con «Despacho»)." };
    const ids = revisadas.lineas.map((l) => l.skuId);
    const { data: skus } = await supabase.from("skus_maestros").select("id, codigo, nombre, tipo, opciones_variantes").in("id", ids);
    const porId = new Map(((skus ?? []) as { id: string; codigo: string; nombre: string; tipo: string; opciones_variantes: unknown }[]).map((s) => [s.id, s]));
    for (const l of revisadas.lineas) {
      const s = porId.get(l.skuId);
      if (!s) return { error: "Un producto ya no existe: elígelo otra vez de la lista." };
      if (s.tipo !== "simple" || s.opciones_variantes) return { error: `«${s.nombre}» no se puede pedir así: elige el producto suelto (sin combo) o la variante exacta.` };
    }
    // No se pide lo que inventario no tiene (19 nov 2026): se revisa aquí también, no solo en la pantalla.
    const sinStock = revisarStockPedido(revisadas.lineas, await stockInventario(supabase, origenes, ids), Object.fromEntries([...porId].map(([id, s]) => [id, s.nombre])));
    if (sinStock) return { error: sinStock };
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

/**
 * Despacho edita su pedido (20 nov 2026, pedido de Jhokser): quita productos, cambia cantidades o notas y agrega productos, mientras inventario no lo haya enviado (solicitud o en proceso). Recibe todas las líneas
 * que deben quedar: las que ya existían llevan su `id` y las que no vienen se quitan. Un pedido no puede quedar vacío (para eso se cancela). Lo que se agrega o se sube de cantidad se revisa contra lo que hay en inventario,
 * como al hacer un pedido; lo que no cambia no se vuelve a revisar. Si inventario ya lo tenía, le llega un aviso con lo que cambió.
 */
export async function editarPedidoInventario(id: string, lineas: unknown): Promise<Resultado> {
  return conPermiso(MODULO_DESPACHO, async (u) => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const { data: p } = await supabase
      .from("despacho_pedidos_inventario")
      .select("id, numero, estado, despacho_pedidos_inventario_items(id, sku_id, producto, cantidad_pedida, nota)")
      .eq("id", id)
      .maybeSingle();
    if (!p) return { error: "Ese pedido ya no existe." };
    const estado = p.estado as EstadoPedido;
    if (!puedeEditar(estado)) return { error: "Ya no se puede editar: inventario ya lo envió o se cerró. Recarga la página." };
    const items = ((p.despacho_pedidos_inventario_items as { id: string; sku_id: string; producto: string; cantidad_pedida: number; nota: string | null }[] | null) ?? []).map((it) => ({ id: it.id, skuId: it.sku_id, producto: it.producto, cantidad: it.cantidad_pedida, nota: it.nota }));
    const revisadas = revisarEdicion(lineas, items);
    if ("error" in revisadas) return revisadas;

    // Los productos nuevos: del catálogo, simples o la variante exacta (como al hacer el pedido).
    const nuevosIds = revisadas.lineas.filter((l) => !l.id).map((l) => l.skuId);
    const { data: skus } = nuevosIds.length ? await supabase.from("skus_maestros").select("id, codigo, nombre, tipo, opciones_variantes").in("id", nuevosIds) : { data: [] };
    const porId = new Map(((skus ?? []) as { id: string; codigo: string; nombre: string; tipo: string; opciones_variantes: unknown }[]).map((s) => [s.id, s]));
    for (const l of revisadas.lineas.filter((x) => !x.id)) {
      const s = porId.get(l.skuId);
      if (!s) return { error: "Un producto ya no existe: elígelo otra vez de la lista." };
      if (s.tipo !== "simple" || s.opciones_variantes) return { error: `«${s.nombre}» no se puede pedir así: elige el producto suelto (sin combo) o la variante exacta.` };
    }
    const nombres: Record<string, string> = { ...Object.fromEntries(items.map((it) => [it.skuId, it.producto])), ...Object.fromEntries([...porId].map(([k, s]) => [k, s.nombre])) };
    const cambios = cambiosDeEdicion(items, revisadas.lineas, nombres);
    if (!cambios.resumen.length) return { ok: true, mensaje: "No cambiaste nada." };

    // Solo lo nuevo o lo que sube de cantidad se compara con lo que hay en inventario.
    const previas = new Map(items.map((it) => [it.id, it]));
    const aRevisar = [...cambios.agregar, ...cambios.cambiar.filter((l) => l.cantidad > (previas.get(l.id!)?.cantidad ?? 0))];
    if (aRevisar.length) {
      const { origenes } = await cargarBodegasPedido(supabase);
      const sinStock = revisarStockPedido(aRevisar, await stockInventario(supabase, origenes, aRevisar.map((l) => l.skuId)), nombres);
      if (sinStock) return { error: sinStock };
    }

    if (cambios.quitar.length) {
      const { error } = await supabase.from("despacho_pedidos_inventario_items").delete().eq("pedido_id", id).in("id", cambios.quitar);
      if (error) return { error: "No se pudo quitar el producto del pedido." };
    }
    for (const l of cambios.cambiar) {
      const { error } = await supabase.from("despacho_pedidos_inventario_items").update({ cantidad_pedida: l.cantidad, nota: l.nota }).eq("id", l.id!).eq("pedido_id", id);
      if (error) return { error: "No se pudo guardar un cambio del pedido. Revisa cómo quedó y vuelve a intentarlo." };
    }
    if (cambios.agregar.length) {
      const orden = revisadas.lineas.length;
      const { error } = await supabase.from("despacho_pedidos_inventario_items").insert(
        cambios.agregar.map((l, i) => {
          const s = porId.get(l.skuId)!;
          return { pedido_id: id, orden: orden + i, sku_id: s.id, producto: String(s.nombre).slice(0, 300), codigo: s.codigo, cantidad_pedida: l.cantidad, nota: l.nota };
        }),
      );
      if (error) return { error: "No se pudo agregar el producto al pedido. Revisa cómo quedó y vuelve a intentarlo." };
    }
    const n = numeroPedido(p.numero as number);
    await registrarAuditoria({ accion: "editar_pedido_inventario", entidad: "despacho_pedidos_inventario", entidadId: id, detalle: `${n}: ${cambios.resumen.join("; ")}` });
    // Inventario se entera de lo que cambió (ya lo haya tomado o no).
    await avisar(supabase, await quienesAtienden(supabase), u, avisoEdicion(p.numero as number, nombreDe(u), cambios.resumen), "/inventario-pedidos-despacho");
    return { ok: true, mensaje: `${n} editado.` };
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

/**
 * Inventario marca el pedido como entregado (20 nov 2026, pedido de Jhokser: para que la orden finalice sin esperar a que despacho pulse «Recibido»): queda cerrado igual que si despacho lo recibe y
 * le llega el aviso a quien lo pidió. Solo un pedido enviado; el cambio es un `update … eq(estado previo)`, así que dos clics (o despacho y inventario a la vez) no lo cierran dos veces.
 */
export async function marcarEntregadoPedidoInventario(id: string): Promise<Resultado> {
  return conPermiso(MODULO_INVENTARIO, async (u) => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("despacho_pedidos_inventario")
      .update({ estado: "recibido", recibido_en: new Date().toISOString(), recibido_por: u.id, recibido_por_nombre: nombreDe(u) })
      .eq("id", id)
      .eq("estado", "enviado")
      .select("numero, pedido_por, despacho_pedidos_inventario_items(id)");
    const p = data?.[0];
    if (!p) return { error: "Ese pedido no está enviado: recarga la página." };
    const items = (p.despacho_pedidos_inventario_items as unknown[] | null)?.length ?? 0;
    await registrarAuditoria({ accion: "entregar_pedido_inventario", entidad: "despacho_pedidos_inventario", entidadId: id, detalle: `${numeroPedido(p.numero as number)} marcado entregado desde inventario` });
    await avisar(supabase, [p.pedido_por as string | null], u, avisoPedido({ numero: p.numero as number, items }, nombreDe(u), "entregado"), "/despacho-ciudad/pedir-inventario");
    return { ok: true, mensaje: `${numeroPedido(p.numero as number)} entregado.` };
  });
}

/**
 * Deshace «Entregado» (23 nov 2026, pedido de Jhokser: se marcó entregado un pedido por error): el pedido vuelve a «Enviado» y a «Esperando que despacho lo reciba». Lo puede hacer quien atiende los pedidos
 * (inventario) o despacho. No toca el inventario: el traslado se hizo al enviar y sigue igual. Solo un pedido «Entregado» (`update … eq(estado previo)`), queda en la auditoría y le llega el aviso a la otra parte.
 */
export async function deshacerEntregaPedidoInventario(id: string): Promise<Resultado> {
  const hacer = async (u: UsuarioActual, lado: "inventario" | "despacho"): Promise<Resultado> => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("despacho_pedidos_inventario")
      .update({ estado: "enviado", recibido_en: null, recibido_por: null, recibido_por_nombre: null })
      .eq("id", id)
      .eq("estado", "recibido")
      .select("numero, pedido_por, responsable_id, despacho_pedidos_inventario_items(id)");
    const p = data?.[0];
    if (!p) return { error: "Ese pedido ya no está entregado: recarga la página." };
    const items = (p.despacho_pedidos_inventario_items as unknown[] | null)?.length ?? 0;
    await registrarAuditoria({ accion: "deshacer_entrega_pedido_inventario", entidad: "despacho_pedidos_inventario", entidadId: id, detalle: `${numeroPedido(p.numero as number)} volvió a Enviado (se había marcado entregado por error)` });
    const aviso = avisoPedido({ numero: p.numero as number, items }, nombreDe(u), "entrega_deshecha");
    if (lado === "inventario") await avisar(supabase, [p.pedido_por as string | null], u, aviso, "/despacho-ciudad/pedir-inventario");
    else await avisar(supabase, [p.responsable_id as string | null], u, aviso, "/inventario-pedidos-despacho");
    return { ok: true, mensaje: `${numeroPedido(p.numero as number)} volvió a «Enviado».` };
  };
  // Quien tiene edición en inventario o en despacho.
  const deInventario = await conPermiso(MODULO_INVENTARIO, (u) => hacer(u, "inventario"));
  if ("ok" in deInventario) return deInventario;
  const deDespacho = await conPermiso(MODULO_DESPACHO, (u) => hacer(u, "despacho"));
  if ("ok" in deDespacho) return deDespacho;
  // Si la persona sí podía y el pedido ya cambió, ese es el error útil; si no podía con ninguno, el de permiso.
  return /ya no está entregado|no válido/.test(deInventario.error) ? deInventario : /ya no está entregado|no válido/.test(deDespacho.error) ? deDespacho : deInventario;
}

/**
 * Deshace un envío hecho por error (23 nov 2026, pedido de Jhokser: Dinora envió un pedido sin querer): el pedido vuelve al estado de ANTES de enviarlo («Solicitud» si se envió directo, «En proceso» si ya lo había puesto en
 * proceso: `estadoAntesDeEnviar`) y se hace un **traslado de reversa** (de la bodega de despacho a la de origen, `wms_crear_traslado`, todo o nada) con lo que se había enviado; el traslado original queda en el historial
 * y el de reversa lo dice en su nota. Si despacho ya no tiene esas unidades (se vendieron o se movieron), la reversa no se hace y el pedido sigue «Enviado». **Si el traslado ya se devolvió a mano** (hay otro traslado
 * «Reversa de TRA-…» en sentido contrario) no se hace una segunda reversa: solo se corrige el estado. Solo inventario (edición); primero cambia el estado (un segundo clic no hace dos reversas) y, si la reversa falla, lo devuelve.
 */
export async function deshacerEnvioPedidoInventario(id: string): Promise<Resultado> {
  return conPermiso(MODULO_INVENTARIO, async (u) => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const { data: p } = await supabase
      .from("despacho_pedidos_inventario")
      .select("id, numero, estado, pedido_por, traslado_id, bodega_origen_id, bodega_destino_id, enviado_en, en_proceso_en, responsable_id, responsable_nombre, traslado:wms_traslados(numero), despacho_pedidos_inventario_items(id, sku_id, producto, cantidad_entregada)")
      .eq("id", id)
      .maybeSingle();
    if (!p) return { error: "Ese pedido ya no existe." };
    if (!puedeDeshacerEnvio(p.estado as EstadoPedido)) return { error: "Ese pedido ya no está enviado: recarga la página." };
    const origenId = p.bodega_origen_id as string | null;
    const destinoId = p.bodega_destino_id as string | null;
    if (!p.traslado_id || !origenId || !destinoId) return { error: "Ese pedido no tiene un traslado que revertir." };
    if (!(await puedeVerBodega(supabase, u.paisesPermitidos, origenId))) return { error: "No tienes acceso al país de esa bodega." };
    const items = (p.despacho_pedidos_inventario_items as { id: string; sku_id: string; producto: string; cantidad_entregada: number | null }[] | null) ?? [];
    const lineas = items.filter((it) => (it.cantidad_entregada ?? 0) > 0).map((it) => ({ sku: it.sku_id, cantidad: it.cantidad_entregada as number }));
    const tr = (Array.isArray(p.traslado) ? p.traslado[0] : p.traslado) as { numero: number } | null;
    const numOriginal = tr ? numeroTraslado(tr.numero) : "el traslado";
    const anterior = estadoAntesDeEnviar(p.en_proceso_en as string | null, p.enviado_en as string | null);
    const nombreAnterior = anterior === "solicitud" ? "Solicitud" : "En proceso";

    // ¿Ya se devolvió ese traslado (a mano, con otro traslado en sentido contrario)? Entonces solo falta corregir el estado.
    const { data: yaHecha } = tr
      ? await supabase.from("wms_traslados").select("numero").ilike("notas", `Reversa de ${numOriginal}%`).eq("bodega_origen_id", destinoId).eq("bodega_destino_id", origenId).limit(1)
      : { data: [] };
    const yaRevertida = (yaHecha?.length ?? 0) > 0;
    if (!yaRevertida) {
      if (!lineas.length) return { error: "Ese pedido no tiene nada enviado que devolver." };
      // Despacho tiene que tener todavía lo que se le envió: si ya lo vendió o lo movió, no se devuelve (nunca se deja su inventario en negativo).
      const hayEnDespacho = (await cargarStock(supabase, [destinoId], lineas.map((l) => l.sku)))[destinoId] ?? {};
      const faltan = items.filter((it) => (it.cantidad_entregada ?? 0) > (hayEnDespacho[it.sku_id] ?? 0));
      if (faltan.length) {
        const detalle = faltan.slice(0, 3).map((it) => `${it.producto} (envió ${it.cantidad_entregada}, hay ${hayEnDespacho[it.sku_id] ?? 0})`).join("; ");
        return { error: `Despacho ya no tiene lo que se le envió, así que no se puede devolver: ${detalle}${faltan.length > 3 ? " y más" : ""}.` };
      }
    }

    const { data: tomado } = await supabase
      .from("despacho_pedidos_inventario")
      .update(
        anterior === "solicitud"
          ? { estado: "solicitud", enviado_en: null, bodega_origen_id: null, traslado_id: null, en_proceso_en: null, responsable_id: null, responsable_nombre: null }
          : { estado: "en_proceso", enviado_en: null, bodega_origen_id: null, traslado_id: null },
      )
      .eq("id", id)
      .eq("estado", "enviado")
      .select("id");
    if (!tomado?.length) return { error: "Ese pedido ya cambió de estado: recarga la página." };

    let numRev: string | null = null;
    if (!yaRevertida) {
      const nota = `Reversa de ${numOriginal} · ${numeroPedido(p.numero as number)} (envío deshecho)`;
      const { data: rev, error } = await supabase.rpc("wms_crear_traslado", { p_desde: destinoId, p_hacia: origenId, p_items: lineas, p_notas: nota, p_usuario: u.id, p_nombre: nombreDe(u) });
      if (error || !rev) {
        await supabase
          .from("despacho_pedidos_inventario")
          .update({ estado: "enviado", enviado_en: p.enviado_en, bodega_origen_id: origenId, traslado_id: p.traslado_id, en_proceso_en: p.en_proceso_en, responsable_id: p.responsable_id, responsable_nombre: p.responsable_nombre })
          .eq("id", id);
        const msg = error?.message ?? "";
        return { error: msg && msg.length < 220 && !/wms_crear_traslado/.test(msg) ? `No se pudo devolver el inventario: ${msg}` : "No se pudo hacer el traslado de reversa." };
      }
      numRev = numeroTraslado((rev as { numero: number }).numero);
    }
    await supabase.from("despacho_pedidos_inventario_items").update({ cantidad_entregada: null, observacion: null }).eq("pedido_id", id);
    const unidades = lineas.reduce((t, l) => t + l.cantidad, 0);
    await registrarAuditoria({
      accion: "deshacer_envio_pedido_inventario",
      entidad: "despacho_pedidos_inventario",
      entidadId: id,
      detalle: yaRevertida
        ? `${numeroPedido(p.numero as number)}: volvió a ${nombreAnterior}; ${numOriginal} ya estaba devuelto con otro traslado, así que no se hizo una segunda reversa`
        : `${numeroPedido(p.numero as number)}: volvió a ${nombreAnterior} con el traslado de reversa ${numRev} (${unidades.toLocaleString("es-PA")} unidades de vuelta a la bodega de origen; el original fue ${numOriginal})`,
    });
    await avisar(supabase, [p.pedido_por as string], u, avisoPedido({ numero: p.numero as number, items: items.length }, nombreDe(u), "envio_deshecho", nombreAnterior), "/despacho-ciudad/pedir-inventario");
    revalidatePath("/inventario");
    revalidatePath("/inventario/traslados");
    return {
      ok: true,
      mensaje: yaRevertida
        ? `${numeroPedido(p.numero as number)} volvió a «${nombreAnterior}» (el inventario ya estaba devuelto).`
        : `${numeroPedido(p.numero as number)} volvió a «${nombreAnterior}»: el traslado de reversa ${numRev} devolvió lo enviado.`,
    };
  });
}

/** Inventario devuelve a «Solicitud» un pedido que puso «En proceso» por error (23 nov 2026, pedido de Jhokser: «que regrese a la acción anterior»). No toca inventario. */
export async function volverASolicitudPedido(id: string): Promise<Resultado> {
  return conPermiso(MODULO_INVENTARIO, async (u) => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("despacho_pedidos_inventario")
      .update({ estado: "solicitud", en_proceso_en: null, responsable_id: null, responsable_nombre: null })
      .eq("id", id)
      .eq("estado", "en_proceso")
      .select("numero");
    const p = data?.[0];
    if (!p) return { error: "Ese pedido ya no está en proceso: recarga la página." };
    await registrarAuditoria({ accion: "volver_solicitud_pedido_inventario", entidad: "despacho_pedidos_inventario", entidadId: id, detalle: `${numeroPedido(p.numero as number)} volvió a Solicitud (se había puesto en proceso por error) · ${nombreDe(u)}` });
    return { ok: true, mensaje: `${numeroPedido(p.numero as number)} volvió a «Solicitud».` };
  });
}

/** Despacho reabre un pedido que canceló por error: vuelve a «Solicitud» y le llega el aviso a inventario. */
export async function reabrirPedidoInventario(id: string): Promise<Resultado> {
  return conPermiso(MODULO_DESPACHO, async (u) => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const { data } = await supabase
      .from("despacho_pedidos_inventario")
      .update({ estado: "solicitud", cancelado_en: null })
      .eq("id", id)
      .eq("estado", "cancelado")
      .is("archivado_en", null)
      .select("numero, despacho_pedidos_inventario_items(id)");
    const p = data?.[0];
    if (!p) return { error: "Ese pedido ya no está cancelado (o está archivado): recarga la página." };
    const items = (p.despacho_pedidos_inventario_items as unknown[] | null)?.length ?? 0;
    await registrarAuditoria({ accion: "reabrir_pedido_inventario", entidad: "despacho_pedidos_inventario", entidadId: id, detalle: `${numeroPedido(p.numero as number)} reabierto (estaba cancelado) · ${nombreDe(u)}` });
    await avisar(supabase, await quienesAtienden(supabase), u, avisoPedido({ numero: p.numero as number, items }, nombreDe(u), "reabierto"), "/inventario-pedidos-despacho");
    return { ok: true, mensaje: `${numeroPedido(p.numero as number)} reabierto.` };
  });
}

/**
 * Archiva un pedido ya realizado (entregado) o cancelado, o lo saca del archivo (23 nov 2026, pedido de Jhokser; migración 0354): sale de la lista de siempre y queda en «Ver archivados». Lo puede hacer
 * quien tenga edición en inventario o en despacho; no toca inventario ni cambia el estado. Un solo `update … eq(estado)` (solo recibido o cancelado).
 */
export async function archivarPedidoInventario(id: string, archivar = true): Promise<Resultado> {
  const hacer = async (u: UsuarioActual): Promise<Resultado> => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const cambio = archivar ? { archivado_en: new Date().toISOString(), archivado_por: u.id, archivado_por_nombre: nombreDe(u) } : { archivado_en: null, archivado_por: null, archivado_por_nombre: null };
    const base = supabase.from("despacho_pedidos_inventario").update(cambio).eq("id", id);
    const { data, error } = await (archivar ? base.in("estado", ["recibido", "cancelado"]).is("archivado_en", null) : base.not("archivado_en", "is", null)).select("numero, estado");
    if (error) return { error: /archivado_/.test(error.message) ? "Falta correr en Supabase la migración 0354 (archivar pedidos)." : "No se pudo guardar. Intenta otra vez." };
    const p = data?.[0];
    if (!p) return { error: archivar ? "Solo se archiva un pedido entregado o cancelado que no esté ya archivado: recarga la página." : "Ese pedido ya no está archivado: recarga la página." };
    if (archivar && !puedeArchivar(p.estado as EstadoPedido)) return { error: "Solo se archiva un pedido entregado o cancelado." };
    await registrarAuditoria({ accion: archivar ? "archivar_pedido_inventario" : "desarchivar_pedido_inventario", entidad: "despacho_pedidos_inventario", entidadId: id, detalle: `${numeroPedido(p.numero as number)} ${archivar ? "archivado" : "sacado del archivo"}` });
    return { ok: true, mensaje: `${numeroPedido(p.numero as number)} ${archivar ? "archivado" : "sacado del archivo"}.` };
  };
  const deInventario = await conPermiso(MODULO_INVENTARIO, hacer);
  if ("ok" in deInventario) return deInventario;
  const deDespacho = await conPermiso(MODULO_DESPACHO, hacer);
  if ("ok" in deDespacho) return deDespacho;
  const util = (e: string) => /migración|Solo se archiva|ya no está archivado|no válido/.test(e);
  return util(deInventario.error) ? deInventario : util(deDespacho.error) ? deDespacho : deInventario;
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
