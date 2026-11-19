"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura, type UsuarioActual } from "@/lib/auth";
import { cargarTiendasCuantoHay } from "@/lib/cuanto-hay/datos";
import { registrarAuditoria } from "@/lib/auditoria";
import { PROVEEDURIA, avisoPregunta, avisoRespuesta, decidirConteoDespacho, leerCantidad, limpiarNota, motivoConteoDespacho, tiendasDePersona } from "@/lib/cuanto-hay/reglas";
import { SIN_ACCESO_TIENDA } from "@/lib/finanzas/acceso-tienda";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";

// «¿Cuánto hay?» (16 nov 2026, migración 0302): la tienda pregunta y Yiletsi responde. Cada acción revisa su permiso en el servidor.

const MODULO_TIENDA = "tienda-cuanto-hay";
const MODULO_DESPACHO = "despacho-cuanto-hay";
const RUTAS = ["/inventario-pedidos-despacho/cuanto-hay", "/despacho-ciudad/cuanto-hay"];
const ES_UUID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const SIN_MIGRACION = "Falta correr en Supabase la migración 0302 («¿Cuánto hay?»).";
const nombreDe = (u: UsuarioActual) => (u.nombre || u.email || "Alguien").trim();

/** Lo que pasó con el inventario de Despacho al responder: `ok` si quedó en la cantidad contada (o ya estaba), y el texto para mostrarlo. */
export type EstadoInventario = { ok: boolean; texto: string };
type Resultado = { ok: true; inventario?: EstadoInventario } | { error: string };

async function conPermiso<T>(modulo: string, hacer: (u: UsuarioActual) => Promise<T>): Promise<T | { error: string }> {
  let u: UsuarioActual;
  try {
    u = await requireModuloEscritura(modulo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No tienes permiso." };
  }
  return hacer(u);
}

/**
 * Una tienda (o Proveeduría, `PROVEEDURIA.id`: solo quien ve toda la empresa) pregunta cuánto hay de un producto del catálogo, con una nota
 * opcional. Le llega el aviso a quien responde.
 */
export async function preguntarCuantoHay(tiendaId: string, skuId: string, nota: string): Promise<Resultado> {
  return conPermiso(MODULO_TIENDA, async (u) => {
    const deProveeduria = tiendaId === PROVEEDURIA.id;
    if (!deProveeduria && !ES_UUID(tiendaId)) return { error: "Elige para quién es." };
    if (!ES_UUID(skuId)) return { error: "Elige el producto de la lista." };
    const supabase = createServiceClient();
    const permitidas = await cargarTiendasPermitidas();
    let tienda: { id: string | null; nombre: string } | undefined;
    if (deProveeduria) {
      if (permitidas !== null) return { error: "No puedes preguntar para Proveeduría." };
      tienda = { id: null, nombre: PROVEEDURIA.nombre };
    } else tienda = tiendasDePersona(await cargarTiendasCuantoHay(supabase), permitidas, (t) => t.unidadId).find((t) => t.id === tiendaId);
    if (!tienda) return { error: "No puedes preguntar por esa tienda." };
    const { data: sku } = await supabase.from("skus_maestros").select("id, nombre, tipo").eq("id", skuId).maybeSingle();
    if (!sku || sku.tipo !== "simple") return { error: "Elige un producto de la lista (los combos no se cuentan: pregunta por cada producto)." };
    const fila = { tienda_id: tienda.id, sku_id: sku.id as string, producto: String(sku.nombre).slice(0, 300), nota: limpiarNota(nota), pedido_por: u.id, pedido_por_nombre: nombreDe(u) };
    const { error } = await supabase.from("tienda_cuanto_hay").insert(fila);
    if (error && deProveeduria && /tienda_id/.test(error.message)) return { error: "Falta correr en Supabase la migración 0336 (Cuánto hay para Proveeduría)." };
    if (error) return { error: /tienda_cuanto_hay/.test(error.message) ? SIN_MIGRACION : "No se pudo guardar la pregunta." };
    // El aviso «Para ti» a quien tiene el panel para ella sola (Yiletsi, migración 0302); a los administradores no, para no llenarles la campana.
    const { data: responden } = await supabase.from("permisos_persona").select("perfil_id").eq("modulo", MODULO_DESPACHO).eq("nivel", "edicion");
    const aviso = avisoPregunta({ producto: fila.producto, tienda: tienda.nombre, nota: fila.nota }, nombreDe(u));
    const destinos = ((responden ?? []) as { perfil_id: string }[]).map((r) => r.perfil_id).filter((id) => id !== u.id);
    if (destinos.length)
      await supabase
        .from("notificaciones_usuario")
        .insert(destinos.map((id) => ({ usuario_id: id, tipo: "tarea", titulo: aviso.titulo, texto: aviso.texto, href: "/despacho-ciudad/cuanto-hay", autor_id: u.id, autor_nombre: nombreDe(u) })));
    for (const r of RUTAS) revalidatePath(r);
    return { ok: true as const };
  });
}

/** Yiletsi responde con la cantidad que contó despacho (también corrige una respuesta). El aviso le llega a quien preguntó. */
export async function responderCuantoHay(id: string, cantidadCruda: string): Promise<Resultado> {
  return conPermiso(MODULO_DESPACHO, async (u) => {
    if (!ES_UUID(id)) return { error: "Pregunta no válida." };
    const cantidad = leerCantidad(cantidadCruda);
    if (cantidad === null) return { error: "Escribe la cantidad (un número entero, 0 si no hay)." };
    const supabase = createServiceClient();
    const { data: p, error: e0 } = await supabase.from("tienda_cuanto_hay").select("id, tienda_id, sku_id, producto, pedido_por, pedido_por_nombre").eq("id", id).maybeSingle();
    // Las de Proveeduría no tienen tienda (migración 0336).
    if (e0) return { error: SIN_MIGRACION };
    if (!p) return { error: "Esa pregunta ya no existe." };
    // Con tiendas limitadas, solo responde las de sus tiendas (auditoría de seguridad, 18 nov 2026).
    const permitidas = await cargarTiendasPermitidas();
    if (permitidas) {
      const suyas = tiendasDePersona(await cargarTiendasCuantoHay(supabase), permitidas, (t) => t.unidadId);
      if (!suyas.some((t) => t.id === p.tienda_id)) return { error: SIN_ACCESO_TIENDA };
    }
    const { error } = await supabase
      .from("tienda_cuanto_hay")
      .update({ cantidad, respondido_por: u.id, respondido_por_nombre: nombreDe(u), respondido_en: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: "No se pudo guardar la respuesta." };
    if (p.pedido_por !== u.id) {
      const { data: t } = p.tienda_id ? await supabase.from("tiendas").select("nombre").eq("id", p.tienda_id).maybeSingle() : { data: { nombre: PROVEEDURIA.nombre } };
      const aviso = avisoRespuesta({ producto: p.producto as string, tienda: (t?.nombre as string | undefined) ?? "tu tienda" }, cantidad, nombreDe(u));
      await supabase
        .from("notificaciones_usuario")
        .insert({ usuario_id: p.pedido_por, tipo: "tarea", titulo: aviso.titulo, texto: aviso.texto, href: "/inventario-pedidos-despacho/cuanto-hay", autor_id: u.id, autor_nombre: nombreDe(u) });
    }
    // Al responder, el inventario de la bodega Despacho queda en lo contado (19 nov 2026, pedido de Hernán: no hacerlo doble). Si no se puede, la respuesta ya quedó guardada y se dice por qué.
    const inventario = await ajustarInventarioDeDespacho(supabase, { skuId: (p.sku_id as string | null) ?? null, cantidad, u, pidio: (p.pedido_por_nombre as string | null) ?? null });
    for (const r of RUTAS) revalidatePath(r);
    revalidatePath("/inventario");
    return { ok: true as const, inventario };
  });
}

/**
 * Deja el stock físico del producto en la bodega «Despacho» de Panamá (código `despacho`, la propia y activa) en la cantidad que contó Yiletsi, con un ajuste que lleva el motivo en el historial.
 * Nunca lanza ni deshace la respuesta: devuelve el resultado en palabras. Los productos con vencimiento, con variantes, compuestos o de prueba no se ajustan (ver `decidirConteoDespacho`).
 */
async function ajustarInventarioDeDespacho(
  supabase: ReturnType<typeof createServiceClient>,
  d: { skuId: string | null; cantidad: number; u: UsuarioActual; pidio: string | null },
): Promise<EstadoInventario> {
  const NO = (texto: string): EstadoInventario => ({ ok: false, texto: `La respuesta quedó guardada, pero el inventario no se actualizó: ${texto}.` });
  try {
    if (!d.skuId) return NO("la pregunta no tiene un producto del catálogo");
    const { data: bodega } = await supabase.from("wms_bodegas").select("id, nombre, paises!inner(codigo)").eq("codigo", "despacho").eq("tipo", "propia").eq("activa", true).eq("paises.codigo", "PA").maybeSingle();
    if (!bodega) return NO("no se encontró la bodega Despacho de Panamá");
    const [{ data: sku }, { data: hijas }, { data: fila }] = await Promise.all([
      supabase.from("skus_maestros").select("codigo, tipo, clase, maneja_vencimiento").eq("id", d.skuId).maybeSingle(),
      supabase.from("skus_maestros").select("id").eq("padre_id", d.skuId).limit(1),
      supabase.from("wms_stock").select("fisico").eq("sku_maestro_id", d.skuId).eq("bodega_id", bodega.id as string).maybeSingle(),
    ]);
    if (!sku) return NO("el producto ya no existe");
    const actual = Number(fila?.fisico ?? 0);
    const decision = decidirConteoDespacho({ actual, cantidad: d.cantidad, tipo: String(sku.tipo), clase: String(sku.clase ?? "fisico"), manejaVencimiento: sku.maneja_vencimiento === true, conVariantes: (hijas ?? []).length > 0 });
    if (decision.tipo === "no") return NO(decision.motivo);
    if (decision.tipo === "igual") return { ok: true, texto: `El inventario de ${bodega.nombre} ya decía ${d.cantidad.toLocaleString("es-PA")}.` };
    const { error } = await supabase.rpc("wms_registrar_movimiento", {
      p_sku: d.skuId,
      p_bodega: bodega.id,
      p_tipo: "ajuste",
      p_cantidad: decision.diferencia,
      p_origen: "manual",
      p_referencia: "¿Cuánto hay?",
      p_motivo: motivoConteoDespacho({ quien: nombreDe(d.u), pidio: d.pidio, antes: actual, despues: d.cantidad }),
      p_usuario: d.u.id,
    });
    if (error) return NO(error.message.length < 160 ? error.message.replace(/\.$/, "") : "la base no lo dejó");
    await registrarAuditoria({
      accion: "conteo_despacho_inventario",
      entidad: "skus_maestros",
      entidadId: d.skuId,
      detalle: `¿Cuánto hay? ${sku.codigo}: ${actual} → ${d.cantidad} en ${bodega.nombre} · Panamá`,
    });
    return { ok: true, texto: `El inventario de ${bodega.nombre} pasó de ${actual.toLocaleString("es-PA")} a ${d.cantidad.toLocaleString("es-PA")}.` };
  } catch {
    return NO("no se pudo guardar el ajuste");
  }
}
