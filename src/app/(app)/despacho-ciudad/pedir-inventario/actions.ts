"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura, type UsuarioActual } from "@/lib/auth";
import { cargarBodegasPedido, cargarComprometido, cargarStock, cargarStockLibre, stockInventario } from "@/lib/pedidos-inventario/datos";
import { avisoEdicion, avisoPedido, cambiosDeEdicion, diferenciasDeEnvio, numeroPedido, estadoAntesDeEnviar, partirPorBodega, puedeArchivar, puedeDeshacerEnvio, puedeEditar, revisarConfirmacion, revisarEdicion, revisarEnvio, revisarLineas, revisarQuedan, revisarStockPedido, MAX_LINEAS, type EstadoPedido } from "@/lib/pedidos-inventario/reglas";
import { puedeVerBodega } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { numeroTraslado } from "@/lib/wms/traslado";

// Pedir a inventario (16 nov 2026, migración 0305): despacho pide, inventario pone en proceso y envía, despacho confirma lo que llegó y lo recibe.
// Desde el 26 nov 2026 (migración 0368) «Enviar» solo anota de qué bodega sale cada producto: el inventario se mueve cuando despacho confirma y recibe.
// Cada acción revisa su permiso en el servidor y cambia el estado solo si el pedido sigue en el estado que corresponde (dos clics no hacen dos traslados).

const MODULO_DESPACHO = "despacho-pedir-inventario";
const MODULO_INVENTARIO = "inventario-pedidos-despacho";
const RUTAS = ["/inventario-despacho/solicitudes", "/inventario-pedidos-despacho"];
const ES_UUID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const SIN_MIGRACION = "Falta correr en Supabase la migración 0305 («Solicitud de inventario»).";
const SIN_MIGRACION_ENVIOS = "Falta correr en Supabase la migración 0368 (confirmación de despacho).";
const errorDeBase = (mensaje: string | undefined, porDefecto: string) => (!mensaje ? porDefecto : /despacho_(pedidos_inventario_envios|recibir_pedido|deshacer_recepcion)|schema cache/i.test(mensaje) ? SIN_MIGRACION_ENVIOS : mensaje.length < 220 ? mensaje : porDefecto);
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

/** Despacho hace una lista (productos del catálogo, con su cantidad y una nota) y salen uno o varios pedidos: uno por bodega, según dónde haya (26 nov 2026). Le llega el aviso a inventario. */
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
    const sinStock = revisarStockPedido(revisadas.lineas, await stockInventario(supabase, origenes, ids, await cargarComprometido(supabase)), Object.fromEntries([...porId].map(([id, s]) => [id, s.nombre])));
    if (sinStock) return { error: sinStock };
    // Un pedido por bodega, según dónde haya (descontando lo que ya va en camino).
    const partes = partirPorBodega(revisadas.lineas, origenes.map((o) => o.id), await cargarStockLibre(supabase, origenes.map((o) => o.id), ids));
    if (!partes.length) return { error: "No hay stock en ninguna bodega para ese pedido." };
    const grupo = partes.length > 1 ? crypto.randomUUID() : null;
    const creados: { id: string; numero: number; bodega: string }[] = [];
    // Todo o nada: si un pedido no se puede guardar, se borran los ya creados.
    const fallar = async (mensaje: string): Promise<Resultado> => {
      if (creados.length) await supabase.from("despacho_pedidos_inventario").delete().in("id", creados.map((x) => x.id));
      return { error: mensaje };
    };
    for (const parte of partes) {
      const { data: pedido, error } = await supabase
        .from("despacho_pedidos_inventario")
        .insert({ bodega_destino_id: destino.id, bodega_asignada_id: parte.bodegaId, solicitud_grupo: grupo, pedido_por: u.id, pedido_por_nombre: nombreDe(u) })
        .select("id, numero")
        .single();
      if (error || !pedido) return fallar(error && /bodega_asignada|solicitud_grupo/.test(error.message) ? SIN_MIGRACION_ENVIOS : error && /despacho_pedidos_inventario/.test(error.message) ? SIN_MIGRACION : "No se pudo guardar el pedido.");
      creados.push({ id: pedido.id as string, numero: pedido.numero as number, bodega: origenes.find((o) => o.id === parte.bodegaId)?.nombre ?? "bodega" });
      const { error: e2 } = await supabase.from("despacho_pedidos_inventario_items").insert(
        parte.lineas.map((l, i) => {
          const s = porId.get(l.skuId)!;
          return { pedido_id: pedido.id, orden: i, sku_id: s.id, producto: String(s.nombre).slice(0, 300), codigo: s.codigo, cantidad_pedida: l.cantidad, nota: l.nota };
        }),
      );
      if (e2) return fallar("No se pudo guardar el pedido.");
    }
    const lista = creados.map((x) => `${numeroPedido(x.numero)} (${x.bodega})`).join(", ");
    await avisar(supabase, await quienesAtienden(supabase), u, avisoPedido({ numero: creados[0].numero, items: revisadas.lineas.length }, nombreDe(u), "nuevo", lista), "/inventario-pedidos-despacho");
    return { ok: true, mensaje: creados.length === 1 ? `${lista} enviado a inventario.` : `Se crearon ${creados.length} pedidos según dónde está la mercancía: ${lista}.` };
  });
}

/**
 * Despacho edita su pedido (20 nov 2026, pedido de Jhokser): quita productos, cambia cantidades o notas y agrega productos, mientras inventario no lo haya enviado (solicitud o en proceso). Recibe todas las líneas
 * que deben quedar: las que ya existían llevan su `id` y las que no vienen se quitan. Un pedido no puede quedar vacío (para eso se cancela). Lo que se agrega o se sube de cantidad se revisa contra lo que hay en inventario,
 * como al hacer un pedido; lo que no cambia no se vuelve a revisar. Si inventario ya lo tenía, le llega un aviso con lo que cambió.
 * Desde el 27 nov 2026 (pedido de Hernán) también lo edita inventario (Dinora): entonces el aviso le llega a quien lo pidió.
 */
export async function editarPedidoInventario(id: string, lineas: unknown): Promise<Resultado> {
  const hacer = async (u: UsuarioActual, lado: "inventario" | "despacho"): Promise<Resultado> => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const { data: p } = await supabase
      .from("despacho_pedidos_inventario")
      .select("id, numero, estado, pedido_por, despacho_pedidos_inventario_items(id, sku_id, producto, cantidad_pedida, nota, cantidad_entregada)")
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
    // Lo ya entregado (27 nov 2026) movió inventario: no se quita ni se cambia desde aquí.
    const entregados = new Map(((p.despacho_pedidos_inventario_items as { id: string; producto: string; cantidad_entregada: number | null }[] | null) ?? []).filter((it) => it.cantidad_entregada !== null).map((it) => [it.id, it.producto]));
    const tocaEntregado = [...cambios.quitar, ...cambios.cambiar.map((l) => l.id!)].find((x) => entregados.has(x));
    if (tocaEntregado) return { error: `«${entregados.get(tocaEntregado)}» ya se entregó: vuélvelo a «En proceso» con ↶ antes de cambiarlo.` };

    // Solo lo nuevo o lo que sube de cantidad se compara con lo que hay en inventario.
    const previas = new Map(items.map((it) => [it.id, it]));
    const aRevisar = [...cambios.agregar, ...cambios.cambiar.filter((l) => l.cantidad > (previas.get(l.id!)?.cantidad ?? 0))];
    if (aRevisar.length) {
      const { origenes } = await cargarBodegasPedido(supabase);
      const sinStock = revisarStockPedido(aRevisar, await stockInventario(supabase, origenes, aRevisar.map((l) => l.skuId), await cargarComprometido(supabase)), nombres);
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
    await registrarAuditoria({ accion: "editar_pedido_inventario", entidad: "despacho_pedidos_inventario", entidadId: id, detalle: `${n}: ${cambios.resumen.join("; ")}${lado === "inventario" ? " (lo editó inventario)" : ""}` });
    // La otra parte se entera de lo que cambió: inventario si lo editó despacho, y quien lo pidió si lo editó inventario.
    if (lado === "despacho") await avisar(supabase, await quienesAtienden(supabase), u, avisoEdicion(p.numero as number, nombreDe(u), cambios.resumen), "/inventario-pedidos-despacho");
    else await avisar(supabase, [p.pedido_por as string], u, avisoEdicion(p.numero as number, nombreDe(u), cambios.resumen), "/inventario-despacho/solicitudes");
    return { ok: true, mensaje: `${n} editado.` };
  };
  // Quien tiene edición en inventario o en despacho.
  const deInventario = await conPermiso(MODULO_INVENTARIO, (u) => hacer(u, "inventario"));
  if ("ok" in deInventario) return deInventario;
  const deDespacho = await conPermiso(MODULO_DESPACHO, (u) => hacer(u, "despacho"));
  if ("ok" in deDespacho) return deDespacho;
  const util = (e: string) => !/permiso|No tienes acceso/i.test(e);
  return util(deInventario.error) ? deInventario : util(deDespacho.error) ? deDespacho : deInventario;
}

/**
 * Inventario marca productos como «En proceso» (ya se están preparando) o los vuelve a pendientes (27 nov 2026, pedido de Hernán; migración 0371): uno, varios o toda una bodega.
 * Lo marcado se oculta de lo pendiente en la pantalla. Marcar el primero pone el pedido «En proceso» (y le avisa a quien lo pidió). No mueve inventario.
 */
export async function marcarEnProcesoItems(id: string, itemIds: unknown, enProceso: boolean): Promise<Resultado> {
  return conPermiso(MODULO_INVENTARIO, async (u) => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    if (!Array.isArray(itemIds) || !itemIds.length || itemIds.length > MAX_LINEAS || !itemIds.every(ES_UUID)) return { error: "Elige los productos." };
    const supabase = createServiceClient();
    const { data: p } = await supabase.from("despacho_pedidos_inventario").select("id, numero, estado, pedido_por, en_proceso_en, bodega_destino_id, despacho_pedidos_inventario_items(id)").eq("id", id).maybeSingle();
    if (!p) return { error: "Ese pedido ya no existe." };
    if (p.estado !== "solicitud" && p.estado !== "en_proceso") return { error: "Ese pedido ya fue enviado o cerrado: recarga la página." };
    if (!(await puedeVerBodega(supabase, u.paisesPermitidos, p.bodega_destino_id as string))) return { error: "No tienes acceso al país de ese pedido." };
    const ahora = new Date().toISOString();
    const { data: cambiados, error } = await supabase
      .from("despacho_pedidos_inventario_items")
      .update(enProceso ? { en_proceso_en: ahora, en_proceso_por: u.id, en_proceso_por_nombre: nombreDe(u) } : { en_proceso_en: null, en_proceso_por: null, en_proceso_por_nombre: null })
      .eq("pedido_id", id)
      .in("id", itemIds as string[])
      .is("cantidad_entregada", null)
      .select("id");
    if (error) return { error: /en_proceso_(en|por)/.test(error.message) ? "Falta correr en Supabase la migración 0371 (en proceso por producto)." : "No se pudo guardar." };
    if (!cambiados?.length) return { error: "Esos productos ya no están pendientes en el pedido (o ya se entregaron): recarga la página." };
    const n = numeroPedido(p.numero as number);
    // Sin nada en proceso ni entregado (27 nov 2026: la flecha ↶ de cada producto), el pedido vuelve a «Solicitud».
    if (!enProceso && p.estado === "en_proceso") {
      const { data: siguen } = await supabase.from("despacho_pedidos_inventario_items").select("id").eq("pedido_id", id).or("en_proceso_en.not.is.null,cantidad_entregada.not.is.null").limit(1);
      if (!siguen?.length) await supabase.from("despacho_pedidos_inventario").update({ estado: "solicitud", en_proceso_en: null, responsable_id: null, responsable_nombre: null }).eq("id", id).eq("estado", "en_proceso");
    }
    // El primer producto en proceso pone el pedido «En proceso».
    if (enProceso && p.estado === "solicitud") {
      const { data: tomado } = await supabase
        .from("despacho_pedidos_inventario")
        .update({ estado: "en_proceso", en_proceso_en: p.en_proceso_en ?? ahora, responsable_id: u.id, responsable_nombre: nombreDe(u) })
        .eq("id", id)
        .eq("estado", "solicitud")
        .select("id");
      if (tomado?.length) {
        const items = (p.despacho_pedidos_inventario_items as unknown[] | null)?.length ?? 0;
        await avisar(supabase, [p.pedido_por as string], u, avisoPedido({ numero: p.numero as number, items }, nombreDe(u), "en_proceso"), "/inventario-despacho/solicitudes");
      }
    }
    const cuantos = cambiados.length;
    await registrarAuditoria({ accion: "en_proceso_productos_pedido", entidad: "despacho_pedidos_inventario", entidadId: id, detalle: `${n}: ${cuantos} ${cuantos === 1 ? "producto" : "productos"} ${enProceso ? "en proceso" : "vuelven a pendientes"}` });
    return { ok: true, mensaje: enProceso ? `${cuantos === 1 ? "1 producto" : `${cuantos} productos`} en proceso en ${n}.` : `${cuantos === 1 ? "1 producto vuelve" : `${cuantos} productos vuelven`} a pendientes.` };
  });
}

/**
 * Inventario marca un producto «Entregado» (27 nov 2026, pedido de Hernán; prototipo aprobado https://claude.ai/artifact/4LWfh9jjXdp12BUdwcEXg3): lo llevó a despacho. Anota de qué bodega sale y cuánto,
 * pero **no mueve inventario**: el traslado se hace cuando despacho confirma lo que llegó y lo recibe («Recibir y transferir»). Solo un producto ya «En proceso».
 * Primero se aparta el producto (`cantidad_entregada` de null a lo entregado: un segundo clic no lo anota dos veces). Mientras despacho no confirma, lo entregado no se puede prometer en otro pedido.
 */
export async function entregarItemPedido(id: string, itemId: string, partes: unknown, observacion: unknown): Promise<Resultado> {
  return conPermiso(MODULO_INVENTARIO, async (u) => {
    if (!ES_UUID(id) || !ES_UUID(itemId)) return { error: "Producto no válido." };
    const supabase = createServiceClient();
    const { destino, origenes } = await cargarBodegasPedido(supabase);
    if (!destino || !origenes.length) return { error: "No encontré las bodegas de Panamá para entregar a despacho." };
    const { data: p } = await supabase
      .from("despacho_pedidos_inventario")
      .select("id, numero, estado, pedido_por, archivado_en, bodega_destino_id, despacho_pedidos_inventario_items(id, sku_id, producto, cantidad_entregada, en_proceso_en)")
      .eq("id", id)
      .maybeSingle();
    if (!p) return { error: "Ese pedido ya no existe." };
    if ((p.estado !== "solicitud" && p.estado !== "en_proceso") || p.archivado_en) return { error: "Ese pedido ya está cerrado: recarga la página." };
    const items = (p.despacho_pedidos_inventario_items as { id: string; sku_id: string; producto: string; cantidad_entregada: number | null; en_proceso_en: string | null }[] | null) ?? [];
    const it = items.find((x) => x.id === itemId);
    if (!it) return { error: "Ese producto ya no está en el pedido: recarga la página." };
    if (it.cantidad_entregada !== null) return { error: `«${it.producto}» ya está entregado: recarga la página.` };
    if (!it.en_proceso_en) return { error: `Pasa «${it.producto}» a «En proceso» antes de entregarlo.` };
    if (!(await puedeVerBodega(supabase, u.paisesPermitidos, p.bodega_destino_id as string))) return { error: "No tienes acceso al país de ese pedido." };

    const stock = await cargarStockLibre(supabase, origenes.map((b) => b.id), [it.sku_id]);
    const revisadas = revisarEnvio([{ id: it.id, skuId: it.sku_id, producto: it.producto }], [{ id: it.id, partes, observacion }], origenes, stock);
    if ("error" in revisadas) return revisadas;
    const usadas = [...new Set(revisadas.envios.map((e) => e.bodegaId))];
    for (const b of usadas) if (!(await puedeVerBodega(supabase, u.paisesPermitidos, b))) return { error: "No tienes acceso al país de esa bodega." };
    const { data: enCajas } = await supabase.from("wms_cajas").select("bodega_id").in("bodega_id", usadas).eq("sku_maestro_id", it.sku_id).limit(1);
    if (enCajas?.length) return { error: `«${it.producto}» está guardado por cajas en esa bodega: pásalo con «Nuevo traslado».` };

    // ¿Ya había algo entregado sin confirmar? Entonces despacho ya tiene el aviso.
    const { data: yaHabia } = await supabase.from("despacho_pedidos_inventario_envios").select("id").eq("pedido_id", id).is("traslado_id", null).limit(1);
    const total = revisadas.envios.reduce((t, e) => t + e.cantidad, 0);
    const { data: apartado } = await supabase
      .from("despacho_pedidos_inventario_items")
      .update({ cantidad_entregada: total, observacion: revisadas.observaciones[it.id] ?? null })
      .eq("id", it.id)
      .eq("pedido_id", id)
      .is("cantidad_entregada", null)
      .select("id");
    if (!apartado?.length) return { error: `«${it.producto}» ya está entregado: recarga la página.` };
    await supabase.from("despacho_pedidos_inventario_envios").delete().eq("item_id", it.id).is("traslado_id", null);
    const { error } = await supabase.from("despacho_pedidos_inventario_envios").insert(revisadas.envios.map((e) => ({ pedido_id: id, item_id: it.id, bodega_id: e.bodegaId, cantidad_enviada: e.cantidad })));
    if (error) {
      await supabase.from("despacho_pedidos_inventario_items").update({ cantidad_entregada: null }).eq("id", it.id);
      return { error: errorDeBase(error.message, "No se pudo guardar la entrega.") };
    }
    const n = numeroPedido(p.numero as number);
    const nombres = usadas.map((b) => origenes.find((o) => o.id === b)?.nombre ?? "bodega").join(", ");
    await registrarAuditoria({ accion: "entregar_producto_pedido_inventario", entidad: "despacho_pedidos_inventario", entidadId: id, detalle: `${n}: «${it.producto}» entregado, ${total.toLocaleString("es-PA")} desde ${nombres}; falta que despacho confirme` });
    if (!yaHabia?.length) await avisar(supabase, [p.pedido_por as string], u, avisoPedido({ numero: p.numero as number, items: 1 }, nombreDe(u), "entregado", it.producto), "/inventario-despacho/solicitudes");
    return { ok: true, mensaje: `«${it.producto}» entregado. El inventario se mueve cuando despacho confirme lo que llegó.` };
  });
}

/**
 * La flecha ↶ de un producto entregado (27 nov 2026). Si despacho todavía no lo recibió, solo se borra la entrega (no se había movido inventario) y vuelve a «En proceso».
 * Si ya lo recibió, lo entregado regresa a su bodega con un traslado de reversa por cada bodega (despacho tiene que tener todavía esas unidades) y, si el pedido estaba cerrado, vuelve a «En proceso».
 */
export async function deshacerEntregaItemPedido(id: string, itemId: string): Promise<Resultado> {
  return conPermiso(MODULO_INVENTARIO, async (u) => {
    if (!ES_UUID(id) || !ES_UUID(itemId)) return { error: "Producto no válido." };
    const supabase = createServiceClient();
    const { data: p } = await supabase
      .from("despacho_pedidos_inventario")
      .select("id, numero, estado, pedido_por, archivado_en, bodega_destino_id, despacho_pedidos_inventario_items(id, sku_id, producto, cantidad_entregada)")
      .eq("id", id)
      .maybeSingle();
    if (!p) return { error: "Ese pedido ya no existe." };
    if (p.archivado_en) return { error: "Ese pedido está archivado: sácalo del archivo primero." };
    if (p.estado !== "en_proceso" && p.estado !== "recibido" && p.estado !== "solicitud") return { error: "Ese pedido no se puede cambiar así: recarga la página." };
    const it = ((p.despacho_pedidos_inventario_items as { id: string; sku_id: string; producto: string; cantidad_entregada: number | null }[] | null) ?? []).find((x) => x.id === itemId);
    if (!it || it.cantidad_entregada === null) return { error: "Ese producto ya no está entregado: recarga la página." };
    const destinoId = p.bodega_destino_id as string;
    if (!(await puedeVerBodega(supabase, u.paisesPermitidos, destinoId))) return { error: "No tienes acceso al país de ese pedido." };
    const n = numeroPedido(p.numero as number);
    const { data: todos } = await supabase.from("despacho_pedidos_inventario_envios").select("id, bodega_id, cantidad_recibida, traslado_id, traslado:wms_traslados(numero)").eq("item_id", it.id);
    const sinRecibir = (todos ?? []).filter((e) => !e.traslado_id);
    if (sinRecibir.length && p.estado !== "recibido") {
      const { data: tomado } = await supabase.from("despacho_pedidos_inventario_items").update({ cantidad_entregada: null }).eq("id", it.id).not("cantidad_entregada", "is", null).select("id");
      if (!tomado?.length) return { error: "Ese producto ya no está entregado: recarga la página." };
      await supabase.from("despacho_pedidos_inventario_envios").delete().in("id", sinRecibir.map((e) => e.id as string));
      await registrarAuditoria({ accion: "deshacer_entrega_producto_pedido_inventario", entidad: "despacho_pedidos_inventario", entidadId: id, detalle: `${n}: «${it.producto}» volvió a En proceso (despacho aún no lo recibía: no se movió inventario)` });
      return { ok: true, mensaje: `«${it.producto}» volvió a «En proceso». El inventario no se había movido.` };
    }
    const lineas = (todos ?? []).filter((e) => e.traslado_id && Number(e.cantidad_recibida ?? 0) > 0);
    if (!lineas.length) return { error: `«${it.producto}» se recibió con el sistema anterior: corrígelo desde Inventario › Traslados.` };
    for (const e of lineas) if (!(await puedeVerBodega(supabase, u.paisesPermitidos, e.bodega_id as string))) return { error: "No tienes acceso al país de esa bodega." };
    const total = lineas.reduce((t, e) => t + Number(e.cantidad_recibida), 0);
    const hay = (await cargarStock(supabase, [destinoId], [it.sku_id]))[destinoId]?.[it.sku_id] ?? 0;
    if (hay < total) return { error: `Despacho ya no tiene lo recibido de «${it.producto}» (recibió ${total.toLocaleString("es-PA")}, hay ${hay.toLocaleString("es-PA")}): no se puede devolver.` };

    const { data: tomado } = await supabase.from("despacho_pedidos_inventario_items").update({ cantidad_entregada: null }).eq("id", it.id).not("cantidad_entregada", "is", null).select("id");
    if (!tomado?.length) return { error: "Ese producto ya no está entregado: recarga la página." };
    const reversas: string[] = [];
    for (const [i, e] of lineas.entries()) {
      const tr = (Array.isArray(e.traslado) ? e.traslado[0] : e.traslado) as { numero: number } | null;
      const original = tr ? numeroTraslado(tr.numero) : "el traslado";
      const { data: rev, error } = await supabase.rpc("wms_crear_traslado", { p_desde: destinoId, p_hacia: e.bodega_id, p_items: [{ sku: it.sku_id, cantidad: Number(e.cantidad_recibida) }], p_notas: `Reversa de ${original} · ${n} (entrega deshecha)`, p_usuario: u.id, p_nombre: nombreDe(u) });
      if (error || !rev) {
        // Lo que ya se devolvió queda devuelto; el producto sigue recibido con lo que falta devolver.
        await supabase.from("despacho_pedidos_inventario_items").update({ cantidad_entregada: lineas.slice(i).reduce((t, x) => t + Number(x.cantidad_recibida), 0) }).eq("id", it.id);
        const msg = error?.message ?? "";
        return { error: msg && msg.length < 220 && !/wms_crear_traslado/.test(msg) ? `No se pudo devolver: ${msg}` : "No se pudo hacer el traslado de reversa." };
      }
      reversas.push(numeroTraslado((rev as { numero: number }).numero));
      await supabase.from("despacho_pedidos_inventario_envios").delete().eq("id", e.id as string);
    }
    let reabierto = false;
    if (p.estado !== "en_proceso") {
      const { data: c } = await supabase
        .from("despacho_pedidos_inventario")
        .update({ estado: "en_proceso", recibido_en: null, recibido_por: null, recibido_por_nombre: null })
        .eq("id", id)
        .in("estado", ["recibido", "solicitud"])
        .select("id");
      reabierto = p.estado === "recibido" && !!c?.length;
    }
    await registrarAuditoria({ accion: "deshacer_entrega_producto_pedido_inventario", entidad: "despacho_pedidos_inventario", entidadId: id, detalle: `${n}: «${it.producto}» volvió a En proceso; ${total.toLocaleString("es-PA")} de vuelta a su bodega (${reversas.join(", ")})` });
    if (reabierto) await avisar(supabase, [p.pedido_por as string], u, avisoPedido({ numero: p.numero as number, items: 1 }, nombreDe(u), "entrega_reabierta", it.producto), "/inventario-despacho/solicitudes");
    revalidatePath("/inventario");
    revalidatePath("/inventario/traslados");
    return { ok: true, mensaje: `«${it.producto}» volvió a «En proceso»: ${reversas.join(", ")} lo devolvió a su bodega.` };
  });
}

/**
 * Despacho recibe lo que inventario marcó entregado y ya confirmó producto por producto (27 nov 2026): un traslado por cada bodega con lo que llegó, hacia la de despacho. Lo que llegó en 0 se borra
 * (el producto vuelve a «En proceso» para entregarlo otra vez). Si un traslado falla, los ya hechos se devuelven. Cuando ya se recibió todo el pedido, queda «Entregado» (cerrado).
 */
async function recibirEntregados(supabase: Supa, u: UsuarioActual, p: { id: string; numero: number; responsable_id: string | null; bodega_destino_id: string; items: { id: string; sku_id: string; producto: string }[] }): Promise<Resultado> {
  const id = p.id;
  const n = numeroPedido(p.numero);
  const { data: filas } = await supabase.from("despacho_pedidos_inventario_envios").select("id, item_id, bodega_id, cantidad_enviada, cantidad_recibida, nota, bodega:wms_bodegas(nombre)").eq("pedido_id", id).is("traslado_id", null);
  const pendientes = (filas ?? []) as { id: string; item_id: string; bodega_id: string; cantidad_enviada: number; cantidad_recibida: number | null; nota: string | null; bodega: unknown }[];
  if (!pendientes.length) return { error: "No hay nada entregado por recibir: recarga la página." };
  if (pendientes.some((e) => e.cantidad_recibida === null)) return { error: "Faltan productos por confirmar." };
  const skuDe = new Map(p.items.map((it) => [it.id, it]));
  const bodegas = [...new Set(pendientes.filter((e) => Number(e.cantidad_recibida) > 0).map((e) => e.bodega_id))];
  for (const b of bodegas) if (!(await puedeVerBodega(supabase, u.paisesPermitidos, b))) return { error: "No tienes acceso al país de esa bodega." };
  const hechos: { bodegaId: string; id: string; numero: number; lineas: { sku: string; cantidad: number }[] }[] = [];
  for (const b of bodegas) {
    const porSku = new Map<string, number>();
    for (const e of pendientes.filter((x) => x.bodega_id === b && Number(x.cantidad_recibida) > 0)) {
      const sku = skuDe.get(e.item_id)?.sku_id;
      if (sku) porSku.set(sku, (porSku.get(sku) ?? 0) + Number(e.cantidad_recibida));
    }
    const lineas = [...porSku].map(([sku, cantidad]) => ({ sku, cantidad }));
    const { data: tr, error } = await supabase.rpc("wms_crear_traslado", { p_desde: b, p_hacia: p.bodega_destino_id, p_items: lineas, p_notas: `${n} · pedido de despacho, recibido y confirmado`, p_usuario: u.id, p_nombre: nombreDe(u) });
    if (error || !tr) {
      for (const h of hechos) await supabase.rpc("wms_crear_traslado", { p_desde: p.bodega_destino_id, p_hacia: h.bodegaId, p_items: h.lineas, p_notas: `Reversa de ${numeroTraslado(h.numero)} · ${n} (no se pudo recibir)`, p_usuario: u.id, p_nombre: nombreDe(u) });
      const msg = error?.message ?? "";
      return { error: msg && msg.length < 220 && !/wms_crear_traslado/.test(msg) ? `No se pudo recibir: ${msg}. Avisa a inventario.` : "No se pudo hacer el traslado. Avisa a inventario." };
    }
    const hecho = tr as { id: string; numero: number };
    hechos.push({ bodegaId: b, id: hecho.id, numero: hecho.numero, lineas });
    await supabase.from("despacho_pedidos_inventario_envios").update({ traslado_id: hecho.id }).in("id", pendientes.filter((x) => x.bodega_id === b && Number(x.cantidad_recibida) > 0).map((x) => x.id));
  }
  // Lo que no llegó (0) se borra; cada producto queda con lo que de verdad recibió despacho.
  const enCero = pendientes.filter((e) => Number(e.cantidad_recibida) === 0).map((e) => e.id);
  if (enCero.length) await supabase.from("despacho_pedidos_inventario_envios").delete().in("id", enCero);
  const tocados = [...new Set(pendientes.map((e) => e.item_id))];
  const { data: quedan } = await supabase.from("despacho_pedidos_inventario_envios").select("item_id, cantidad_recibida").in("item_id", tocados);
  for (const itemId of tocados) {
    const suyos = (quedan ?? []).filter((e) => e.item_id === itemId);
    await supabase.from("despacho_pedidos_inventario_items").update({ cantidad_entregada: suyos.length ? suyos.reduce((t, e) => t + Number(e.cantidad_recibida ?? 0), 0) : null }).eq("id", itemId);
  }
  const diferencias = diferenciasDeEnvio(
    p.items,
    pendientes.map((e) => ({ itemId: e.item_id, bodega: ((Array.isArray(e.bodega) ? e.bodega[0] : e.bodega) as { nombre: string } | null)?.nombre ?? "bodega", cantidadEnviada: Number(e.cantidad_enviada), cantidadRecibida: Number(e.cantidad_recibida), nota: e.nota })),
  );
  // ¿Ya se recibió todo? Entonces el pedido se cierra.
  const { data: abiertos } = await supabase.from("despacho_pedidos_inventario_items").select("id").eq("pedido_id", id).is("cantidad_entregada", null).limit(1);
  let cerrado = false;
  if (!abiertos?.length) {
    const { data: c } = await supabase.from("despacho_pedidos_inventario").update({ estado: "recibido", recibido_en: new Date().toISOString(), recibido_por: u.id, recibido_por_nombre: nombreDe(u) }).eq("id", id).in("estado", ["solicitud", "en_proceso"]).select("id");
    cerrado = !!c?.length;
  }
  const traslados = hechos.map((h) => numeroTraslado(h.numero));
  const unidades = hechos.reduce((t, h) => t + h.lineas.reduce((s, l) => s + l.cantidad, 0), 0);
  await registrarAuditoria({ accion: "recibir_pedido_inventario", entidad: "despacho_pedidos_inventario", entidadId: id, detalle: `${n}: ${unidades.toLocaleString("es-PA")} unidades recibidas${traslados.length ? ` (${traslados.join(", ")})` : ""}${diferencias.length ? ` · Diferencias: ${diferencias.join("; ")}` : ""}`.slice(0, 1000) });
  for (const h of hechos) await registrarAuditoria({ accion: "traslado_inventario", entidad: "wms_traslados", entidadId: h.id, detalle: `${numeroTraslado(h.numero)}: ${n} · pedido de despacho, recibido y confirmado` });
  await avisar(supabase, [p.responsable_id, ...(await quienesAtienden(supabase))], u, avisoPedido({ numero: p.numero, items: tocados.length }, nombreDe(u), "recibido", diferencias.length ? `Diferencias: ${diferencias.join("; ")}` : undefined), "/inventario-pedidos-despacho");
  revalidatePath("/inventario");
  revalidatePath("/inventario/traslados");
  return { ok: true, mensaje: `Recibido${traslados.length ? `: se hizo ${traslados.length === 1 ? "el traslado" : "los traslados"} ${traslados.join(", ")}` : ""}.${cerrado ? ` ${n} quedó entregado completo.` : ""}` };
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
    await avisar(supabase, [p.pedido_por as string], u, avisoPedido({ numero: p.numero as number, items }, nombreDe(u), "en_proceso"), "/inventario-despacho/solicitudes");
    return { ok: true, mensaje: `${numeroPedido(p.numero as number)} en proceso.` };
  });
}

/**
 * Inventario envía: anota de qué bodega sale cada producto (puede repartirlo entre varias) y cuánto. **No mueve inventario** (26 nov 2026): eso pasa cuando despacho confirma y recibe.
 * Primero marca el pedido como enviado (así un segundo clic no anota dos veces); si algo falla, lo devuelve al estado que tenía.
 * `quedan` (26 nov 2026, pedido de Hernán): los productos que no van en este envío. Pasan a un pedido nuevo de la misma lista, en el estado que tenía, para enviarlos después.
 */
export async function enviarPedidoInventario(id: string, entregas: unknown, quedan?: unknown): Promise<Resultado> {
  return conPermiso(MODULO_INVENTARIO, async (u) => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const { destino, origenes } = await cargarBodegasPedido(supabase);
    if (!destino || !origenes.length) return { error: "No encontré las bodegas de Panamá para enviar a despacho." };
    const { data: p } = await supabase
      .from("despacho_pedidos_inventario")
      .select("id, numero, estado, pedido_por, pedido_por_nombre, creado_en, bodega_destino_id, bodega_asignada_id, solicitud_grupo, responsable_id, responsable_nombre, en_proceso_en, despacho_pedidos_inventario_items(id, sku_id, producto)")
      .eq("id", id)
      .maybeSingle();
    if (!p) return { error: "Ese pedido ya no existe." };
    const estadoAntes = p.estado as string;
    if (estadoAntes !== "solicitud" && estadoAntes !== "en_proceso") return { error: "Ese pedido ya fue enviado o cerrado: recarga la página." };
    const todos = ((p.despacho_pedidos_inventario_items as { id: string; sku_id: string; producto: string }[] | null) ?? []).map((it) => ({ id: it.id, skuId: it.sku_id, producto: it.producto }));
    const pendientes = revisarQuedan(todos, quedan);
    if ("error" in pendientes) return pendientes;
    const aparte = new Set(pendientes.quedan);
    // Lo que va en este envío; lo demás queda para después.
    const items = todos.filter((it) => !aparte.has(it.id));
    const skus = items.map((it) => it.skuId);
    // Lo disponible, descontando lo que ya va en camino en otros pedidos.
    const stock = await cargarStockLibre(supabase, origenes.map((b) => b.id), skus);
    const revisadas = revisarEnvio(items, entregas, origenes, stock);
    if ("error" in revisadas) return revisadas;
    const usadas = [...new Set(revisadas.envios.map((e) => e.bodegaId))];
    for (const b of usadas) if (!(await puedeVerBodega(supabase, u.paisesPermitidos, b))) return { error: "No tienes acceso al país de esa bodega." };
    // Lo guardado por cajas se mueve desde «Nuevo traslado», eligiendo las cajas: aquí fallaría al recibir.
    const { data: enCajas } = await supabase.from("wms_cajas").select("bodega_id, sku_maestro_id").in("bodega_id", usadas).in("sku_maestro_id", skus);
    const skuDe = new Map(items.map((it) => [it.id, it]));
    const conCaja = revisadas.envios.find((e) => (enCajas ?? []).some((x) => x.bodega_id === e.bodegaId && x.sku_maestro_id === skuDe.get(e.itemId)!.skuId));
    if (conCaja) return { error: `«${skuDe.get(conCaja.itemId)!.producto}» está guardado por cajas en esa bodega: pásalo con «Nuevo traslado» y déjalo en 0 aquí.` };

    const ahora = new Date().toISOString();
    const unaSola = usadas.length === 1 ? usadas[0] : null;
    const { data: tomado } = await supabase
      .from("despacho_pedidos_inventario")
      .update({ estado: "enviado", enviado_en: ahora, bodega_origen_id: unaSola, responsable_id: u.id, responsable_nombre: nombreDe(u), en_proceso_en: p.en_proceso_en ?? ahora })
      .eq("id", id)
      .eq("estado", estadoAntes)
      .select("id");
    if (!tomado?.length) return { error: "Ese pedido ya cambió de estado: recarga la página." };
    const volver = () =>
      supabase
        .from("despacho_pedidos_inventario")
        .update({ estado: estadoAntes, enviado_en: null, bodega_origen_id: null, responsable_id: p.responsable_id, responsable_nombre: p.responsable_nombre, en_proceso_en: p.en_proceso_en })
        .eq("id", id);

    // Lo que no va ahora pasa a un pedido nuevo de la misma lista, con el estado, la fecha y quién lo pidió del original.
    let resto: { id: string; numero: number } | null = null;
    if (aparte.size) {
      const grupo = (p.solicitud_grupo as string | null) ?? crypto.randomUUID();
      const { data: nuevo, error: eNuevo } = await supabase
        .from("despacho_pedidos_inventario")
        .insert({
          estado: estadoAntes,
          bodega_destino_id: p.bodega_destino_id,
          bodega_asignada_id: p.bodega_asignada_id,
          solicitud_grupo: grupo,
          pedido_por: p.pedido_por,
          pedido_por_nombre: p.pedido_por_nombre,
          creado_en: p.creado_en,
          responsable_id: p.responsable_id,
          responsable_nombre: p.responsable_nombre,
          en_proceso_en: p.en_proceso_en,
        })
        .select("id, numero")
        .single();
      if (eNuevo || !nuevo) {
        await volver();
        return { error: errorDeBase(eNuevo?.message, "No se pudo separar lo que queda pendiente.") };
      }
      resto = { id: nuevo.id as string, numero: nuevo.numero as number };
      const { data: movidos, error: eMover } = await supabase.from("despacho_pedidos_inventario_items").update({ pedido_id: resto.id }).eq("pedido_id", id).in("id", [...aparte]).select("id");
      if (eMover || (movidos?.length ?? 0) !== aparte.size) {
        await supabase.from("despacho_pedidos_inventario_items").update({ pedido_id: id }).eq("pedido_id", resto.id);
        await supabase.from("despacho_pedidos_inventario").delete().eq("id", resto.id);
        await volver();
        return { error: "No se pudo separar lo que queda pendiente. Recarga la página y vuelve a intentarlo." };
      }
      if (!p.solicitud_grupo) await supabase.from("despacho_pedidos_inventario").update({ solicitud_grupo: grupo }).eq("id", id);
    }
    /** Si el envío no se guarda, lo separado vuelve al pedido original. */
    const juntar = async () => {
      if (!resto) return;
      await supabase.from("despacho_pedidos_inventario_items").update({ pedido_id: id }).eq("pedido_id", resto.id);
      await supabase.from("despacho_pedidos_inventario").delete().eq("id", resto.id);
    };

    await supabase.from("despacho_pedidos_inventario_envios").delete().eq("pedido_id", id);
    const { error } = await supabase.from("despacho_pedidos_inventario_envios").insert(revisadas.envios.map((e) => ({ pedido_id: id, item_id: e.itemId, bodega_id: e.bodegaId, cantidad_enviada: e.cantidad })));
    if (error) {
      await juntar();
      await volver();
      return { error: errorDeBase(error.message, "No se pudo guardar el envío.") };
    }
    await Promise.all(
      items.map((it) =>
        supabase
          .from("despacho_pedidos_inventario_items")
          .update({ cantidad_entregada: revisadas.envios.filter((e) => e.itemId === it.id).reduce((t, e) => t + e.cantidad, 0), observacion: revisadas.observaciones[it.id] ?? null })
          .eq("id", it.id),
      ),
    );
    const unidades = revisadas.envios.reduce((t, e) => t + e.cantidad, 0);
    const nombres = usadas.map((b) => origenes.find((o) => o.id === b)?.nombre ?? "bodega").join(", ");
    const n = numeroPedido(p.numero as number);
    const quedanTexto = resto ? `${aparte.size} ${aparte.size === 1 ? "producto queda pendiente" : "productos quedan pendientes"} en ${numeroPedido(resto.numero)}` : "";
    await registrarAuditoria({ accion: "enviar_pedido_inventario", entidad: "despacho_pedidos_inventario", entidadId: id, detalle: `${n}: ${unidades.toLocaleString("es-PA")} unidades desde ${nombres}; falta que despacho confirme${quedanTexto ? `; ${quedanTexto}` : ""}` });
    await avisar(supabase, [p.pedido_por as string], u, avisoPedido({ numero: p.numero as number, items: items.length }, nombreDe(u), "enviado", `desde ${nombres}${quedanTexto ? `; ${quedanTexto}` : ""}`), "/inventario-despacho/solicitudes");
    return { ok: true, mensaje: `${n} enviado${quedanTexto ? ` (${quedanTexto})` : ""}. El inventario se mueve cuando despacho confirme lo que llegó.` };
  });
}

/** Despacho confirma un producto (de una bodega): cuántas llegaron y, si no son las enviadas, qué pasó. Se puede corregir hasta que recibe el pedido. No mueve inventario. */
export async function confirmarLineaPedido(envioId: string, recibida: unknown, nota: unknown): Promise<Resultado> {
  return conPermiso(MODULO_DESPACHO, async (u) => {
    if (!ES_UUID(envioId)) return { error: "Producto no válido." };
    const supabase = createServiceClient();
    const { data: e, error: eLeer } = await supabase
      .from("despacho_pedidos_inventario_envios")
      .select("id, cantidad_enviada, pedido:despacho_pedidos_inventario!inner(estado, bodega_destino_id)")
      .eq("id", envioId)
      .maybeSingle();
    if (eLeer) return { error: errorDeBase(eLeer.message, "No se pudo leer el pedido.") };
    if (!e) return { error: "Ese producto ya no está en el envío: recarga la página." };
    const pedido = (Array.isArray(e.pedido) ? e.pedido[0] : e.pedido) as { estado: string; bodega_destino_id: string };
    // Desde el 27 nov 2026 lo entregado se confirma mientras el pedido sigue abierto (ya no pasa por «Enviado»).
    if (!["enviado", "solicitud", "en_proceso"].includes(pedido.estado)) return { error: "Ese pedido ya no está por recibir: recarga la página." };
    if (!(await puedeVerBodega(supabase, u.paisesPermitidos, pedido.bodega_destino_id))) return { error: "No tienes acceso al país de ese pedido." };
    const r = revisarConfirmacion(Number(e.cantidad_enviada), recibida, nota);
    if ("error" in r) return r;
    const { error } = await supabase
      .from("despacho_pedidos_inventario_envios")
      .update({ cantidad_recibida: r.recibida, nota: r.nota, confirmado_por: u.id, confirmado_por_nombre: nombreDe(u), confirmado_en: new Date().toISOString() })
      .eq("id", envioId)
      .is("traslado_id", null);
    if (error) return { error: "No se pudo guardar la confirmación." };
    return { ok: true };
  });
}

/**
 * Deshace «Entregado» (23 nov 2026, pedido de Jhokser: se marcó entregado un pedido por error): el pedido vuelve a «Enviado». Si se recibió con confirmación (26 nov 2026) hubo traslados, así que
 * **solo inventario** puede deshacerlo y se hacen los traslados de reversa (`despacho_deshacer_recepcion`, todo o nada), conservando las confirmaciones para corregirlas. En un pedido recibido antes
 * de ese cambio no se toca inventario (el traslado se hizo al enviar) y lo puede deshacer inventario o despacho. Queda en la auditoría y le llega el aviso a la otra parte.
 */
export async function deshacerEntregaPedidoInventario(id: string): Promise<Resultado> {
  const hacer = async (u: UsuarioActual, lado: "inventario" | "despacho"): Promise<Resultado> => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const { data: conEnvios } = await supabase.from("despacho_pedidos_inventario_envios").select("id").eq("pedido_id", id).limit(1);
    let numero: number;
    let pedidoPor: string | null = null;
    let responsable: string | null = null;
    let items = 0;
    let detalle: string;
    if (conEnvios?.length) {
      if (lado !== "inventario") return { error: "Esa recepción movió inventario: solo la puede deshacer la persona a cargo del inventario." };
      const { data: destino } = await supabase.from("despacho_pedidos_inventario").select("bodega_destino_id").eq("id", id).maybeSingle();
      if (!destino || !(await puedeVerBodega(supabase, u.paisesPermitidos, destino.bodega_destino_id as string))) return { error: "No tienes acceso al país de ese pedido." };
      const { data, error } = await supabase.rpc("despacho_deshacer_recepcion", { p_pedido: id, p_usuario: u.id, p_nombre: nombreDe(u) });
      if (error) return { error: errorDeBase(error.message, "No se pudo deshacer la recepción.") };
      const { data: p } = await supabase.from("despacho_pedidos_inventario").select("numero, pedido_por, responsable_id, despacho_pedidos_inventario_items(id)").eq("id", id).maybeSingle();
      numero = Number(p?.numero ?? 0);
      pedidoPor = (p?.pedido_por as string | null) ?? null;
      responsable = (p?.responsable_id as string | null) ?? null;
      items = (p?.despacho_pedidos_inventario_items as unknown[] | null)?.length ?? 0;
      const reversas = ((data as { traslados?: { numero: number }[] } | null)?.traslados ?? []).map((t) => numeroTraslado(t.numero));
      detalle = `${numeroPedido(numero)} volvió a Enviado (recepción deshecha)${reversas.length ? ` con los traslados de reversa ${reversas.join(", ")}` : ""}`;
    } else {
      const { data } = await supabase
        .from("despacho_pedidos_inventario")
        .update({ estado: "enviado", recibido_en: null, recibido_por: null, recibido_por_nombre: null })
        .eq("id", id)
        .eq("estado", "recibido")
        .select("numero, pedido_por, responsable_id, despacho_pedidos_inventario_items(id)");
      const p = data?.[0];
      if (!p) return { error: "Ese pedido ya no está entregado: recarga la página." };
      numero = p.numero as number;
      pedidoPor = (p.pedido_por as string | null) ?? null;
      responsable = (p.responsable_id as string | null) ?? null;
      items = (p.despacho_pedidos_inventario_items as unknown[] | null)?.length ?? 0;
      detalle = `${numeroPedido(numero)} volvió a Enviado (se había marcado entregado por error)`;
    }
    await registrarAuditoria({ accion: "deshacer_entrega_pedido_inventario", entidad: "despacho_pedidos_inventario", entidadId: id, detalle });
    const aviso = avisoPedido({ numero, items }, nombreDe(u), "entrega_deshecha");
    if (lado === "inventario") await avisar(supabase, [pedidoPor], u, aviso, "/inventario-despacho/solicitudes");
    else await avisar(supabase, [responsable], u, aviso, "/inventario-pedidos-despacho");
    revalidatePath("/inventario");
    revalidatePath("/inventario/traslados");
    return { ok: true, mensaje: `${numeroPedido(numero)} volvió a «Enviado».` };
  };
  // Quien tiene edición en inventario o en despacho.
  const deInventario = await conPermiso(MODULO_INVENTARIO, (u) => hacer(u, "inventario"));
  if ("ok" in deInventario) return deInventario;
  const deDespacho = await conPermiso(MODULO_DESPACHO, (u) => hacer(u, "despacho"));
  if ("ok" in deDespacho) return deDespacho;
  // Si la persona sí podía y el pedido ya cambió, ese es el error útil; si no podía con ninguno, el de permiso.
  const util = (e: string) => /ya no está entregado|no válido|Despacho ya no tiene|migración|solo la puede deshacer/.test(e);
  return util(deInventario.error) ? deInventario : util(deDespacho.error) ? deDespacho : deInventario;
}

/**
 * Deshace un envío hecho por error (23 nov 2026, pedido de Jhokser: Dinora envió un pedido sin querer): el pedido vuelve al estado de ANTES de enviarlo («Solicitud» si se envió directo, «En proceso» si ya lo había puesto en
 * proceso: `estadoAntesDeEnviar`). Un envío sin traslado (26 nov 2026) solo se devuelve. En los de antes, con traslado hecho, se hace un **traslado de reversa** (de la bodega de despacho a la de origen, `wms_crear_traslado`, todo o nada) con lo que se había enviado; el traslado original queda en el historial
 * y el de reversa lo dice en su nota. Si despacho ya no tiene esas unidades (se vendieron o se movieron), la reversa no se hace y el pedido sigue «Enviado». **Si el traslado ya se devolvió a mano** (hay otro traslado
 * «Reversa de TRA-…» en sentido contrario) no se hace una segunda reversa: solo se corrige el estado. Solo inventario (edición); primero cambia el estado (un segundo clic no hace dos reversas) y, si la reversa falla, lo devuelve.
 */
export async function deshacerEnvioPedidoInventario(id: string): Promise<Resultado> {
  return conPermiso(MODULO_INVENTARIO, async (u) => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const { data: p } = await supabase
      .from("despacho_pedidos_inventario")
      .select("id, numero, estado, pedido_por, traslado_id, bodega_origen_id, bodega_destino_id, enviado_en, en_proceso_en, responsable_id, responsable_nombre, traslado:wms_traslados!despacho_pedidos_inventario_traslado_id_fkey(numero), despacho_pedidos_inventario_items(id, sku_id, producto, cantidad_entregada)")
      .eq("id", id)
      .maybeSingle();
    if (!p) return { error: "Ese pedido ya no existe." };
    if (!puedeDeshacerEnvio(p.estado as EstadoPedido)) return { error: "Ese pedido ya no está enviado: recarga la página." };
    const anterior = estadoAntesDeEnviar(p.en_proceso_en as string | null, p.enviado_en as string | null);
    const nombreAnterior = anterior === "solicitud" ? "Solicitud" : "En proceso";
    const sinEnvio =
      anterior === "solicitud"
        ? { estado: "solicitud", enviado_en: null, bodega_origen_id: null, traslado_id: null, en_proceso_en: null, responsable_id: null, responsable_nombre: null }
        : { estado: "en_proceso", enviado_en: null, bodega_origen_id: null, traslado_id: null };
    // Desde el 26 nov 2026 enviar no mueve inventario: deshacerlo solo devuelve el pedido y borra de dónde salía.
    if (!p.traslado_id) {
      if (!(await puedeVerBodega(supabase, u.paisesPermitidos, p.bodega_destino_id as string))) return { error: "No tienes acceso al país de ese pedido." };
      const { data: hayEnvios } = await supabase.from("despacho_pedidos_inventario_envios").select("id").eq("pedido_id", id).limit(1);
      if (!hayEnvios?.length) return { error: "Ese pedido no tiene un envío que deshacer." };
      const { data: tomado } = await supabase.from("despacho_pedidos_inventario").update(sinEnvio).eq("id", id).eq("estado", "enviado").select("id");
      if (!tomado?.length) return { error: "Ese pedido ya cambió de estado: recarga la página." };
      await supabase.from("despacho_pedidos_inventario_envios").delete().eq("pedido_id", id);
      await supabase.from("despacho_pedidos_inventario_items").update({ cantidad_entregada: null, observacion: null }).eq("pedido_id", id);
      await registrarAuditoria({ accion: "deshacer_envio_pedido_inventario", entidad: "despacho_pedidos_inventario", entidadId: id, detalle: `${numeroPedido(p.numero as number)}: volvió a ${nombreAnterior} (no se había movido inventario)` });
      await avisar(supabase, [p.pedido_por as string], u, avisoPedido({ numero: p.numero as number, items: (p.despacho_pedidos_inventario_items as unknown[] | null)?.length ?? 0 }, nombreDe(u), "envio_deshecho", nombreAnterior), "/inventario-despacho/solicitudes");
      return { ok: true, mensaje: `${numeroPedido(p.numero as number)} volvió a «${nombreAnterior}». El inventario no se había movido.` };
    }
    const origenId = p.bodega_origen_id as string | null;
    const destinoId = p.bodega_destino_id as string | null;
    if (!p.traslado_id || !origenId || !destinoId) return { error: "Ese pedido no tiene un traslado que revertir." };
    if (!(await puedeVerBodega(supabase, u.paisesPermitidos, origenId))) return { error: "No tienes acceso al país de esa bodega." };
    const items = (p.despacho_pedidos_inventario_items as { id: string; sku_id: string; producto: string; cantidad_entregada: number | null }[] | null) ?? [];
    const lineas = items.filter((it) => (it.cantidad_entregada ?? 0) > 0).map((it) => ({ sku: it.sku_id, cantidad: it.cantidad_entregada as number }));
    const tr = (Array.isArray(p.traslado) ? p.traslado[0] : p.traslado) as { numero: number } | null;
    const numOriginal = tr ? numeroTraslado(tr.numero) : "el traslado";

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

    const { data: tomado } = await supabase.from("despacho_pedidos_inventario").update(sinEnvio).eq("id", id).eq("estado", "enviado").select("id");
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
    await avisar(supabase, [p.pedido_por as string], u, avisoPedido({ numero: p.numero as number, items: items.length }, nombreDe(u), "envio_deshecho", nombreAnterior), "/inventario-despacho/solicitudes");
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

/**
 * Despacho recibe el pedido, con todos sus productos confirmados: un traslado por cada bodega de origen hacia la de despacho, todo o nada (`despacho_recibir_pedido`), y el pedido queda cerrado.
 * A quien lo envió le llega el aviso, con las diferencias si las hubo. Un pedido enviado antes del 26 nov 2026 ya tenía su traslado: solo se cierra.
 */
export async function recibirPedidoInventario(id: string): Promise<Resultado> {
  return conPermiso(MODULO_DESPACHO, async (u) => {
    if (!ES_UUID(id)) return { error: "Pedido no válido." };
    const supabase = createServiceClient();
    const { data: p } = await supabase
      .from("despacho_pedidos_inventario")
      .select("numero, estado, traslado_id, responsable_id, bodega_destino_id, despacho_pedidos_inventario_items(id, sku_id, producto)")
      .eq("id", id)
      .maybeSingle();
    if (!p) return { error: "Ese pedido ya no existe." };
    // Desde el 27 nov 2026: se recibe lo que inventario marcó entregado, producto por producto, sin pasar por «Enviado».
    if (p.estado === "solicitud" || p.estado === "en_proceso") {
      if (!(await puedeVerBodega(supabase, u.paisesPermitidos, p.bodega_destino_id as string))) return { error: "No tienes acceso al país de ese pedido." };
      return recibirEntregados(supabase, u, {
        id,
        numero: p.numero as number,
        responsable_id: (p.responsable_id as string | null) ?? null,
        bodega_destino_id: p.bodega_destino_id as string,
        items: (p.despacho_pedidos_inventario_items as { id: string; sku_id: string; producto: string }[] | null) ?? [],
      });
    }
    if (p.estado !== "enviado") return { error: "Ese pedido no está por recibir: recarga la página." };
    if (!(await puedeVerBodega(supabase, u.paisesPermitidos, p.bodega_destino_id as string))) return { error: "No tienes acceso al país de ese pedido." };
    const items = (p.despacho_pedidos_inventario_items as { id: string; producto: string }[] | null) ?? [];
    const n = numeroPedido(p.numero as number);

    if (p.traslado_id) {
      const { data } = await supabase
        .from("despacho_pedidos_inventario")
        .update({ estado: "recibido", recibido_en: new Date().toISOString(), recibido_por: u.id, recibido_por_nombre: nombreDe(u) })
        .eq("id", id)
        .eq("estado", "enviado")
        .select("id");
      if (!data?.length) return { error: "Ese pedido no está enviado: recarga la página." };
      await avisar(supabase, [p.responsable_id as string | null], u, avisoPedido({ numero: p.numero as number, items: items.length }, nombreDe(u), "recibido"), "/inventario-pedidos-despacho");
      return { ok: true, mensaje: `${n} recibido.` };
    }

    const { data, error } = await supabase.rpc("despacho_recibir_pedido", { p_pedido: id, p_usuario: u.id, p_nombre: nombreDe(u) });
    if (error) return { error: errorDeBase(error.message, "No se pudo recibir el pedido.") };
    const r = (data ?? {}) as { traslados?: { id: string; numero: number }[]; unidades?: number };
    const traslados = (r.traslados ?? []).map((t) => numeroTraslado(t.numero));
    const { data: envios } = await supabase.from("despacho_pedidos_inventario_envios").select("item_id, cantidad_enviada, cantidad_recibida, nota, bodega:wms_bodegas(nombre)").eq("pedido_id", id);
    const diferencias = diferenciasDeEnvio(
      items,
      (envios ?? []).map((e) => ({
        itemId: e.item_id as string,
        bodega: ((Array.isArray(e.bodega) ? e.bodega[0] : e.bodega) as { nombre: string } | null)?.nombre ?? "bodega",
        cantidadEnviada: Number(e.cantidad_enviada),
        cantidadRecibida: e.cantidad_recibida === null ? null : Number(e.cantidad_recibida),
        nota: (e.nota as string | null) ?? null,
      })),
    );
    const unidades = Number(r.unidades ?? 0).toLocaleString("es-PA");
    await registrarAuditoria({
      accion: "recibir_pedido_inventario",
      entidad: "despacho_pedidos_inventario",
      entidadId: id,
      detalle: `${n}: ${unidades} unidades recibidas${traslados.length ? ` (${traslados.join(", ")})` : ""}${diferencias.length ? ` · Diferencias: ${diferencias.join("; ")}` : ""}`.slice(0, 1000),
    });
    for (const t of r.traslados ?? [])
      await registrarAuditoria({ accion: "traslado_inventario", entidad: "wms_traslados", entidadId: t.id, detalle: `${numeroTraslado(t.numero)}: ${n} · pedido de despacho, recibido y confirmado` });
    await avisar(supabase, [p.responsable_id as string | null], u, avisoPedido({ numero: p.numero as number, items: items.length }, nombreDe(u), "recibido", diferencias.length ? `Diferencias: ${diferencias.join("; ")}` : undefined), "/inventario-pedidos-despacho");
    revalidatePath("/inventario");
    revalidatePath("/inventario/traslados");
    return { ok: true, mensaje: `${n} recibido${traslados.length ? `: se hizo ${traslados.length === 1 ? "el traslado" : "los traslados"} ${traslados.join(", ")}` : ""}.` };
  });
}
