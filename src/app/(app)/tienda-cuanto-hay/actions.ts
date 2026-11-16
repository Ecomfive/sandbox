"use server";

import { revalidatePath } from "next/cache";
import { requireModuloEscritura, type UsuarioActual } from "@/lib/auth";
import { cargarTiendasCuantoHay } from "@/lib/cuanto-hay/datos";
import { avisoPregunta, avisoRespuesta, leerCantidad, limpiarNota, tiendasDePersona } from "@/lib/cuanto-hay/reglas";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";

// «¿Cuánto hay?» (16 nov 2026, migración 0301): la tienda pregunta y Yiletsi responde. Cada acción revisa su permiso en el servidor.

const MODULO_TIENDA = "tienda-cuanto-hay";
const MODULO_DESPACHO = "despacho-cuanto-hay";
const RUTAS = ["/tienda-cuanto-hay", "/despacho-cuanto-hay"];
const ES_UUID = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const SIN_MIGRACION = "Falta correr en Supabase la migración 0301 («¿Cuánto hay?»).";
const nombreDe = (u: UsuarioActual) => (u.nombre || u.email || "Alguien").trim();

type Resultado = { ok: true } | { error: string };

async function conPermiso<T>(modulo: string, hacer: (u: UsuarioActual) => Promise<T>): Promise<T | { error: string }> {
  let u: UsuarioActual;
  try {
    u = await requireModuloEscritura(modulo);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No tienes permiso." };
  }
  return hacer(u);
}

/** La tienda pregunta cuánto hay de un producto del catálogo, con una nota opcional. Le llega el aviso a quien responde. */
export async function preguntarCuantoHay(tiendaId: string, skuId: string, nota: string): Promise<Resultado> {
  return conPermiso(MODULO_TIENDA, async (u) => {
    if (!ES_UUID(tiendaId)) return { error: "Elige la tienda." };
    if (!ES_UUID(skuId)) return { error: "Elige el producto de la lista." };
    const supabase = createServiceClient();
    const tiendas = tiendasDePersona(await cargarTiendasCuantoHay(supabase), await cargarTiendasPermitidas(), (t) => t.unidadId);
    const tienda = tiendas.find((t) => t.id === tiendaId);
    if (!tienda) return { error: "No puedes preguntar por esa tienda." };
    const { data: sku } = await supabase.from("skus_maestros").select("id, nombre, tipo").eq("id", skuId).maybeSingle();
    if (!sku || sku.tipo !== "simple") return { error: "Elige un producto de la lista (los combos no se cuentan: pregunta por cada producto)." };
    const fila = { tienda_id: tienda.id, sku_id: sku.id as string, producto: String(sku.nombre).slice(0, 300), nota: limpiarNota(nota), pedido_por: u.id, pedido_por_nombre: nombreDe(u) };
    const { error } = await supabase.from("tienda_cuanto_hay").insert(fila);
    if (error) return { error: /tienda_cuanto_hay/.test(error.message) ? SIN_MIGRACION : "No se pudo guardar la pregunta." };
    // El aviso «Para ti» a quien tiene el panel para ella sola (Yiletsi, migración 0301); a los administradores no, para no llenarles la campana.
    const { data: responden } = await supabase.from("permisos_persona").select("perfil_id").eq("modulo", MODULO_DESPACHO).eq("nivel", "edicion");
    const aviso = avisoPregunta({ producto: fila.producto, tienda: tienda.nombre, nota: fila.nota }, nombreDe(u));
    const destinos = ((responden ?? []) as { perfil_id: string }[]).map((r) => r.perfil_id).filter((id) => id !== u.id);
    if (destinos.length)
      await supabase
        .from("notificaciones_usuario")
        .insert(destinos.map((id) => ({ usuario_id: id, tipo: "tarea", titulo: aviso.titulo, texto: aviso.texto, href: "/despacho-cuanto-hay", autor_id: u.id, autor_nombre: nombreDe(u) })));
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
    const { data: p, error: e0 } = await supabase.from("tienda_cuanto_hay").select("id, tienda_id, producto, pedido_por").eq("id", id).maybeSingle();
    if (e0) return { error: SIN_MIGRACION };
    if (!p) return { error: "Esa pregunta ya no existe." };
    const { error } = await supabase
      .from("tienda_cuanto_hay")
      .update({ cantidad, respondido_por: u.id, respondido_por_nombre: nombreDe(u), respondido_en: new Date().toISOString() })
      .eq("id", id);
    if (error) return { error: "No se pudo guardar la respuesta." };
    if (p.pedido_por !== u.id) {
      const { data: t } = await supabase.from("tiendas").select("nombre").eq("id", p.tienda_id).maybeSingle();
      const aviso = avisoRespuesta({ producto: p.producto as string, tienda: (t?.nombre as string | undefined) ?? "tu tienda" }, cantidad, nombreDe(u));
      await supabase
        .from("notificaciones_usuario")
        .insert({ usuario_id: p.pedido_por, tipo: "tarea", titulo: aviso.titulo, texto: aviso.texto, href: "/tienda-cuanto-hay", autor_id: u.id, autor_nombre: nombreDe(u) });
    }
    for (const r of RUTAS) revalidatePath(r);
    return { ok: true as const };
  });
}
