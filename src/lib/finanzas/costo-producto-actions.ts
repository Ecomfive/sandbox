"use server";

// El costo de un producto que muestran la ficha de Inventario y la de Producto, leído de la hoja de Costos de producto
// (0992). Solo lectura: el costo se edita únicamente en la hoja. Solo Panamá (la hoja no tiene otros países). El costo
// lo ve solo quien abre Costos de producto y ve toda la empresa (como en Pedidos Dropi): bodega, despacho y quien tiene
// tiendas limitadas no lo ven aunque abran Inventario o Producto.

import { requireAlgunModulo } from "@/lib/auth";
import { soloSinLimite } from "@/lib/tienda/acceso";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { hoyPanama } from "@/lib/af4/fecha";
import { agregarPadres, cargarCatalogoCostos } from "./cargar-hoja-costos";
import { compraVigente, costoEn } from "./hoja-costos";
import { PAIS_HOJA_COSTOS } from "./sincronizar-costos-compras";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface CostoDeProducto {
  pais: string;
  /** La hoja es solo de Panamá: en otro país no hay nada que mostrar. */
  aplica: boolean;
  vigente: number | null;
  /** De dónde sale el costo cuando el producto no tiene compras propias. */
  fuente: "propio" | "componentes" | "principal" | null;
  compras: { codigo: string; llegada: string | null; cantidad: number; costoTotal: number; manual: boolean }[];
  puedeAbrirHoja: boolean;
}

export async function obtenerCostoProducto(skuId: string): Promise<CostoDeProducto | { error: string }> {
  const usuario = await requireAlgunModulo(["inventario", "producto", "costos-mercancia"]);
  if (!usuario.modulos.includes("costos-mercancia") || (await soloSinLimite())) return { error: "sin_permiso" }; // la ficha no dibuja el bloque
  if (typeof skuId !== "string" || !UUID.test(skuId)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const base = { pais: pais.nombre, puedeAbrirHoja: true };
  if (pais.codigo !== PAIS_HOJA_COSTOS) return { ...base, aplica: false, vigente: null, fuente: null, compras: [] };
  const { data, error } = await supabase
    .from("fin_costos_lotes")
    .select("linea, fecha_llegada, cantidad, costo_total, costo_final_manual")
    .eq("en_hoja_costos", true)
    .eq("sku_maestro_id", skuId)
    .order("fecha_llegada", { ascending: false, nullsFirst: false })
    .limit(50);
  if (error) return { ...base, aplica: true, vigente: null, fuente: null, compras: [] };
  const compras = (data ?? []).map((r) => ({
    codigo: String(r.linea ?? ""),
    llegada: typeof r.fecha_llegada === "string" ? r.fecha_llegada.slice(0, 10) : null,
    cantidad: Number(r.cantidad ?? 0),
    costoTotal: Number(r.costo_total ?? 0),
    manual: r.costo_final_manual !== null,
  }));
  const hoy = hoyPanama();
  const propia = compraVigente(compras.map((c) => ({ llegada: c.llegada, costo: c.costoTotal })), hoy);
  if (propia) return { ...base, aplica: true, vigente: propia.costo, fuente: "propio", compras };
  // Sin compras propias: un pack suma sus componentes y una variante toma la de su principal.
  const cat = await cargarCatalogoCostos(supabase);
  await agregarPadres(supabase, cat, [skuId]);
  const v = costoEn(cat, skuId, hoy);
  return { ...base, aplica: true, vigente: v, fuente: v === null ? null : cat.componentes.has(skuId) ? "componentes" : "principal", compras };
}
