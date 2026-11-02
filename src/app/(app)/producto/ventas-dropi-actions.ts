"use server";

import { getUsuarioActual } from "@/lib/auth";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { mesesEntre, resumirProductos, ventasDePublicacion } from "@/lib/publicaciones/ventas";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);

/** Un ID de Dropi del producto con lo que vendió. */
export interface IdDropiVentas {
  id: number;
  nombre: string;
  archivado: boolean;
  privado: boolean;
  netas30: number;
  netasTotal: number;
  ultimaVenta: string | null;
  /** Su stock en Dropi: el de la última lectura de «Mis productos» o, si no aparece ahí, el de la carga de ventas. */
  stock: number;
}

/** Las ventas en Dropi de un producto en un país: todos sus IDs de Dropi juntos. */
export interface VentasDropiPais {
  pais: string;
  /** Hasta qué día llegan los datos (la última carga de ventas). */
  corte: string;
  netas30: number;
  netas30Antes: number;
  netasTotal: number;
  pedidas: number;
  pctDevolucion: number | null;
  stock: number;
  diasInventario: number | null;
  primeraVenta: string | null;
  ultimaVenta: string | null;
  /** Netas por mes, desde el primer mes con ventas hasta el del corte (los meses sin ventas en 0). */
  meses: { mes: string; netas: number }[];
  ids: IdDropiVentas[];
}

/**
 * Las ventas en Dropi de un producto (bloque «Ventas en Dropi» de su ficha): suma todos los IDs de Dropi de sus publicaciones de
 * Gestión de IDs Dropi —activas y archivadas, públicas y privadas, de cualquier bodega— y las de sus variantes, por país. Sale de
 * las ventas diarias de Dropi (migración 0120). Lo ven quienes abren Producto o Inventario, solo en sus países; con `soloPais` (el código, «PA»),
 * solo ese país. Devuelve el error
 * como valor; sin la migración o sin publicaciones, una lista vacía.
 */
export async function obtenerVentasDropiProducto(id: string, soloPais?: string): Promise<{ paises: VentasDropiPais[] } | { error: string }> {
  const usuario = await getUsuarioActual();
  // También Gestión de IDs Dropi: la ficha de una publicación muestra las ventas de todo su producto (25 oct 2026).
  if (!usuario || !(usuario.modulos.includes("producto") || usuario.modulos.includes("inventario") || usuario.modulos.includes("publicaciones-dropi"))) return { error: "No tienes acceso." };
  if (!ES_ID(id)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const { data: variantes } = await supabase.from("skus_maestros").select("id").eq("padre_id", id);
  const skus = [id, ...(variantes ?? []).map((v) => v.id as string)];
  const { data: pubs, error } = await supabase.from("dropi_publicaciones").select("dropi_id, pais_id, paises(codigo, nombre)").in("sku_maestro_id", skus);
  if (error) return { error: "No se pudieron cargar las ventas." };

  // Los IDs de Dropi por país («7231-7679» son dos).
  const porPais = new Map<string, { nombre: string; ids: Set<number> }>();
  for (const p of pubs ?? []) {
    const pais = (Array.isArray(p.paises) ? p.paises[0] : p.paises) as { codigo: string; nombre: string } | null;
    if (!pais || !puedeVerPais(usuario.paisesPermitidos, pais.codigo)) continue;
    // Gestión de IDs Dropi pide solo el país de la barra (28 oct 2026, pedido de Alcides): en Panamá, solo lo de Panamá.
    if (soloPais && pais.codigo.toUpperCase() !== soloPais.toUpperCase()) continue;
    const ids = String(p.dropi_id ?? "").match(/\d{3,6}/g) ?? [];
    if (!ids.length) continue;
    const x = porPais.get(p.pais_id as string) ?? { nombre: pais.nombre, ids: new Set<number>() };
    porPais.set(p.pais_id as string, x);
    for (const n of ids) x.ids.add(Number(n));
  }

  const paises: VentasDropiPais[] = [];
  for (const [paisId, { nombre, ids: set }] of porPais) {
    const ids = [...set];
    const [cargaR, productosR, diasR, stockR] = await Promise.all([
      supabase.from("dropi_ventas_cargas").select("corte").eq("pais_id", paisId).order("corte", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("dropi_ventas_productos").select("dropi_producto_id, nombre, lista, privado, variable, stock, primera_venta, ultima_venta").eq("pais_id", paisId).in("dropi_producto_id", ids),
      traerTodasConError<Record<string, unknown>>((d, h) => supabase.from("dropi_ventas_diarias").select("dropi_producto_id, dia, pedidas, ordenes, canceladas, rechazadas, devueltas").eq("pais_id", paisId).in("dropi_producto_id", ids).order("dropi_producto_id").order("dia").range(d, h)),
      supabase.from("dropi_productos_proveedor").select("dropi_producto_id, stock").eq("pais_id", paisId).in("dropi_producto_id", ids),
    ]);
    if (cargaR.error || !cargaR.data || productosR.error || diasR.error) continue;
    const corte = new Date(new Date(cargaR.data.corte as string).getTime() - 5 * 3600e3).toISOString().slice(0, 10);
    // El stock de la última lectura de «Mis productos» de Dropi manda sobre el de la carga de ventas (migración 0131).
    const stockActual = stockR.error ? undefined : new Map((stockR.data ?? []).map((f) => [Number(f.dropi_producto_id), Number(f.stock ?? 0)]));
    const resumen = resumirProductos(
      (productosR.data ?? []).map((p) => ({
        id: Number(p.dropi_producto_id),
        nombre: p.nombre as string,
        lista: p.lista === "archivado" ? ("archivado" as const) : ("activo" as const),
        privado: !!p.privado,
        variable: !!p.variable,
        stock: stockActual?.get(Number(p.dropi_producto_id)) ?? Number(p.stock),
        primeraVenta: (p.primera_venta as string | null) ?? null,
        ultimaVenta: (p.ultima_venta as string | null) ?? null,
      })),
      (diasR.data ?? []).map((d) => ({ producto: Number(d.dropi_producto_id), dia: d.dia as string, pedidas: Number(d.pedidas), ordenes: Number(d.ordenes), canceladas: Number(d.canceladas), rechazadas: Number(d.rechazadas), devueltas: Number(d.devueltas) })),
      corte,
    );
    const v = ventasDePublicacion(ids, new Map(resumen.map((r) => [r.id, r])), stockActual);
    if (!v) continue;
    const primerMes = Object.keys(v.porMes).filter((m) => v.porMes[m] !== 0).sort()[0];
    paises.push({
      pais: nombre,
      corte,
      netas30: v.netas30,
      netas30Antes: v.netas30Antes,
      netasTotal: v.netasTotal,
      pedidas: v.pedidas,
      pctDevolucion: v.pctDevolucion,
      stock: v.stock,
      diasInventario: v.diasInventario,
      primeraVenta: v.primeraVenta,
      ultimaVenta: v.ultimaVenta,
      meses: primerMes ? mesesEntre(primerMes, corte).map((mes) => ({ mes, netas: v.porMes[mes] ?? 0 })) : [],
      ids: resumen
        .map((r) => ({ id: r.id, nombre: r.nombre, archivado: r.lista === "archivado", privado: r.privado, netas30: r.netas30, netasTotal: r.netasTotal, ultimaVenta: r.ultimaVenta, stock: r.stock }))
        .sort((a, b) => b.netasTotal - a.netasTotal),
    });
  }
  paises.sort((a, b) => b.netasTotal - a.netasTotal);
  return { paises };
}
