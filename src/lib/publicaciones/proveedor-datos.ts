import type { SupabaseClient } from "@supabase/supabase-js";
import { reservasGuardadas } from "./reservas-dropi";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import type { VariacionLeida } from "./privatizar-variable";
import type { BodegaDropi, ProductoProveedor } from "./sincronizar-dropi";

/**
 * Solo el stock de cada producto en la última lectura de «Mis productos» (y cuándo se leyó), para que Ventas Dropi, Compras ›
 * Reponer y Gestión de IDs no usen el de la carga de ventas, que puede tener días. `null` sin la migración 0131 o sin lectura.
 */
export async function cargarStockProveedor(supabase: SupabaseClient, paisId: string): Promise<{ leidoEn: string; stock: Map<number, number> } | null> {
  try {
    const filas = await traerTodasLasFilas<{ dropi_producto_id: number; stock: number; leido_en: string }>((d, h) =>
      supabase.from("dropi_productos_proveedor").select("dropi_producto_id, stock, leido_en").eq("pais_id", paisId).order("dropi_producto_id").range(d, h),
    );
    if (!filas.length) return null;
    return {
      leidoEn: filas.reduce((a, f) => (f.leido_en > a ? f.leido_en : a), ""),
      stock: new Map(filas.map((f) => [Number(f.dropi_producto_id), Number(f.stock ?? 0)])),
    };
  } catch {
    return null;
  }
}

/** El stock de un producto de Dropi: el de la última lectura de «Mis productos» si lo trae; si no, el de la carga de ventas. */
export const stockVigente = (id: number, deLaCarga: number, actual: Map<number, number> | null | undefined) => actual?.get(id) ?? deLaCarga;

/**
 * Nuestros productos tal como los ve ECOMFIVE en Dropi como proveedor (la última lectura de «Mis productos», migración 0131),
 * por su ID de Dropi, con la bodega y el stock de cada uno, y cuándo se leyó. `null` si falta la migración o nunca se leyó.
 */
export async function cargarProductosProveedor(supabase: SupabaseClient, paisId: string): Promise<{ leidoEn: string; productos: Map<number, ProductoProveedor> } | null> {
  try {
    const base = "dropi_producto_id, nombre, tipo, archivado, privado, precio, precio_sugerido, stock, stock_privado, bodegas, categorias, fotos, creado_dropi, leido_en, variaciones";
    const leer = (columnas: string) =>
      traerTodasLasFilas<Record<string, unknown>>((d, h) => supabase.from("dropi_productos_proveedor").select(columnas).eq("pais_id", paisId).order("dropi_producto_id").range(d, h) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: unknown }>);
    // Sin la migración 0254 todavía no están `privado_producto` ni `reservas`: se lee como antes.
    const filas = await leer(`${base}, privado_producto, reservas`).catch(() => leer(base));
    if (!filas.length) return null;
    const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
    let leidoEn = "";
    const productos = new Map<number, ProductoProveedor>();
    for (const f of filas) {
      if ((f.leido_en as string) > leidoEn) leidoEn = f.leido_en as string;
      const id = Number(f.dropi_producto_id);
      productos.set(id, {
        id,
        nombre: f.nombre as string,
        tipo: (f.tipo as string | null) ?? null,
        archivado: !!f.archivado,
        privado: !!f.privado,
        precio: n(f.precio),
        precioSugerido: n(f.precio_sugerido),
        stock: Number(f.stock ?? 0),
        stockPrivado: Number(f.stock_privado ?? 0),
        bodegas: Array.isArray(f.bodegas) ? (f.bodegas as BodegaDropi[]).map((b) => ({ id: Number(b.id), nombre: String(b.nombre), stock: Number(b.stock ?? 0) })) : [],
        categorias: (f.categorias as string[] | null) ?? [],
        fotos: Number(f.fotos ?? 0),
        creado: (f.creado_dropi as string | null) ?? null,
        variaciones: Array.isArray(f.variaciones) ? (f.variaciones as VariacionLeida[]) : null,
        privadoProducto: typeof f.privado_producto === "boolean" ? f.privado_producto : null,
        reservas: Array.isArray(f.reservas) ? reservasGuardadas(f.reservas) : null,
      });
    }
    return { leidoEn, productos };
  } catch {
    return null;
  }
}
