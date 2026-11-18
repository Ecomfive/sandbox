"use server";

import { sinAccesoAOrdenes, soloSinLimite } from "@/lib/tienda/acceso";
import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModuloEscritura } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { TAMANO_LOTE_VENTAS, validarOrden } from "@/lib/ventas/guardar";
import { metodoDePago, type OrdenVenta } from "@/lib/ventas/matriz";
import { editablePorColumna, valorEditado } from "@/lib/ventas/reporteria";
import { guardarLoteMatriz, type ResultadoMatriz } from "@/lib/ventas/reporteria-importar";

// Reportería de pedidos (17 nov 2026): editar a mano las columnas de administración y cargar la Matriz. Leer pide el módulo «tienda-reporteria»
// (migración 0310); escribir, poder modificarlo. Solo se editan las columnas de `EDITABLES` (el estado del pedido lo llevan Shopify, Monday y
// Servientrega: no se cambia a mano) y solo en pedidos de una tienda del país que se mira.

const MODULO = "tienda-reporteria";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const comoTexto = (v: unknown) => (v === null || v === undefined || v === "" ? null : typeof v === "boolean" ? (v ? "Sí" : "No") : String(v));

/** Cambia una columna de un pedido y lo deja en Movimientos (`ven_orden_ediciones`). Desde ahí, actualizar desde la Matriz ya no la pisa. */
export async function editarCampoReporteria(ordenId: string, columna: string, valor: unknown): Promise<{ error?: string; valor?: string | number | boolean | null }> {
  const usuario = await requireModuloEscritura(MODULO);
  if (!UUID.test(String(ordenId))) return { error: "Pedido no válido." };
  const campo = editablePorColumna(String(columna));
  if (!campo) return { error: "Esa columna no se edita a mano." };
  const v = valorEditado(campo, valor);
  if (!v.ok) return { error: v.error };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  // La columna se arma con un nombre de `EDITABLES` (no del navegador): se declara como texto para leer la fila como un objeto cualquiera.
  const columnas: string = `id, numero, ${campo.columna}, monto_envio, monto_envio_se, fin_unidades!inner(pais_id, nombre)`;
  const { data, error } = await supabase.from("ven_ordenes").select(columnas).eq("id", ordenId).maybeSingle();
  const o = data as unknown as (Record<string, unknown> & { monto_envio: number | null; monto_envio_se: number | null; fin_unidades: unknown }) | null;
  if (error) return { error: /column|schema/i.test(error.message) ? "Falta correr la migración 0310 (Reportería de pedidos) en Supabase." : "No se pudo leer el pedido." };
  const unidad = (Array.isArray(o?.fin_unidades) ? o?.fin_unidades[0] : o?.fin_unidades) as { pais_id: string; nombre: string } | undefined;
  if (!o || unidad?.pais_id !== pais.id) return { error: "No se encontró el pedido." };
  // Solo pedidos de las tiendas de la persona (17 nov 2026).
  const sinAcceso = await sinAccesoAOrdenes(supabase, [ordenId]);
  if (sinAcceso) return { error: sinAcceso };
  const antes = o[campo.columna];
  if (comoTexto(antes) === comoTexto(v.valor)) return { valor: v.valor };

  const cambio: Record<string, unknown> = { [campo.columna]: v.valor, actualizado_en: new Date().toISOString() };
  // El envío del pedido sigue siendo la suma de los dos (lo que usa Ventas por tienda).
  if (campo.columna === "monto_envio" || campo.columna === "monto_envio_se") {
    const otro = campo.columna === "monto_envio" ? o.monto_envio_se : o.monto_envio;
    cambio.costo_envio = Math.round(((Number(v.valor) || 0) + (Number(otro) || 0)) * 100) / 100;
  }
  // La forma de pago también dice cómo se cobró (el método que usan Finanzas y la conciliación).
  if (campo.columna === "forma_pago_texto") cambio.metodo_pago = metodoDePago(v.valor as string | null);
  const { error: e2 } = await supabase.from("ven_ordenes").update(cambio).eq("id", ordenId);
  if (e2) return { error: "No se pudo guardar." };
  await supabase.from("ven_orden_ediciones").insert({
    orden_id: ordenId,
    campo: campo.columna,
    antes: comoTexto(antes)?.slice(0, 300) ?? null,
    despues: comoTexto(v.valor)?.slice(0, 300) ?? null,
    usuario_id: usuario.id,
    usuario_nombre: usuario.nombre || usuario.email,
  });
  return { valor: v.valor };
}

/** Un lote de pedidos leídos de la Matriz en el navegador («Actualizar desde la Matriz»): se validan y se guardan sin duplicar ni pisar. */
export async function importarLoteMatriz(ordenes: unknown[]): Promise<{ error: string } | (ResultadoMatriz & { rechazadas: number })> {
  try {
    await requireModuloEscritura(MODULO);
    // La Matriz trae todas las tiendas: la carga solo la hace quien ve todas (17 nov 2026).
    const limite = await soloSinLimite();
    if (limite) return { error: limite };
    if (!Array.isArray(ordenes) || ordenes.length === 0 || ordenes.length > TAMANO_LOTE_VENTAS) return { error: "Lote inválido." };
    const buenas: OrdenVenta[] = [];
    for (const o of ordenes) {
      const r = validarOrden(o);
      if (r.ok) buenas.push(r.orden);
    }
    const r = await guardarLoteMatriz(createServiceClient(), buenas);
    return { ...r, rechazadas: ordenes.length - buenas.length };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar el lote." };
  }
}

/** Cierra la carga: deja la auditoría y refresca las pantallas que leen los pedidos. */
export async function terminarImportacionMatriz(archivo: string, resumen: { ordenes: number; nuevas: number; completadas: number }): Promise<{ ok: true }> {
  await requireModuloEscritura(MODULO);
  const n = (v: unknown) => (Number.isInteger(v) ? Number(v) : 0);
  await registrarAuditoria({
    accion: "importar_matriz_reporteria",
    entidad: "ven_ordenes",
    detalle: `${String(archivo ?? "").slice(0, 120)}: ${n(resumen?.ordenes)} pedidos leídos, ${n(resumen?.nuevas)} nuevos, ${n(resumen?.completadas)} de Shopify completados`,
  });
  revalidatePath("/tienda-reporteria");
  revalidatePath("/ventas-tiendas", "layout");
  return { ok: true };
}
