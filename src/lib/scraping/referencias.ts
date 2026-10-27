import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { indexar, repetidos, type IndiceReferencias, type ItemRepetible, type Referencia } from "./cruces";

const fecha = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }) : null);

const ETAPA: Record<string, string> = {
  backlog: "Backlog",
  cotizar: "Cotizar",
  cotizado: "Cotizado",
  produccion: "En producción",
  tracking: "En camino",
  arribo_mercancia: "Arribo",
  completado: "Completada",
};

/**
 * Lo nuestro, para los cruces de Testing Lab: todos los tests de Test productos (de todos los países: un producto testeado en otro
 * país también cuenta), todos los productos de Producto (sin variantes), los productos de las compras no anuladas (Compras: «ya
 * se compró») y las publicaciones de Gestión de IDs Dropi (sin las duplicadas: «ya lo vendemos»), con la huella de su foto si la
 * tienen. Las dos últimas desde el 26 oct 2026 (pedido de Hernán); sin sus tablas, solo se omiten.
 */
export async function cargarReferencias(supabase: SupabaseClient): Promise<IndiceReferencias> {
  const [tests, productos, paises, compras, items, publicaciones] = await Promise.all([
    traerTodasConError<{ id: string; nombre: string; fecha_test: string | null; estado: string | null; test_numero: number | null; pais_id: string }>((a, b) =>
      supabase.from("wms_productos_test").select("id, nombre, fecha_test, estado, test_numero, pais_id").order("id").range(a, b),
    ),
    traerTodasConError<{ id: string; codigo: string; nombre: string; foto_huella: string | null; padre_id: string | null }>((a, b) =>
      supabase.from("skus_maestros").select("id, codigo, nombre, foto_huella, padre_id").order("id").range(a, b),
    ),
    supabase.from("paises").select("id, nombre, codigo"),
    traerTodasConError<{ id: string; numero: number | null; etapa: string; pais_id: string; sku_maestro_id: string | null; anulada_en: string | null }>((a, b) =>
      supabase.from("wms_compras").select("id, numero, etapa, pais_id, sku_maestro_id, anulada_en").is("anulada_en", null).order("id").range(a, b),
    ),
    traerTodasConError<{ compra_id: string; sku_maestro_id: string }>((a, b) => supabase.from("wms_compra_items").select("compra_id, sku_maestro_id").order("id").range(a, b)),
    traerTodasConError<{ id: string; numero: number | null; nombre: string; dropi_id: string | null; foto_huella: string | null; estado: string | null; pais_id: string; duplicada_de?: string | null }>((a, b) =>
      // Solo lo que se usa (rendimiento, 27 oct 2026): antes «*» traía también los datos para Dropi y otros jsonb pesados.
      supabase.from("dropi_publicaciones").select("id, numero, nombre, dropi_id, foto_huella, estado, pais_id, duplicada_de").order("id").range(a, b),
    ),
  ]);
  const pais = new Map((paises.data ?? []).map((p) => [p.id, p.nombre as string]));
  const codigoPais = new Map((paises.data ?? []).map((p) => [p.id, String(p.codigo ?? "").toUpperCase()]));
  const skus = new Map((productos.data ?? []).map((p) => [p.id, p]));
  // La huella de una variante sin foto propia es la de su producto.
  const huellaDe = (id: string) => skus.get(id)?.foto_huella ?? (skus.get(id)?.padre_id ? (skus.get(skus.get(id)!.padre_id!)?.foto_huella ?? null) : null);
  const refs: Referencia[] = [
    ...(tests.data ?? []).map((t) => ({
      tipo: "test" as const,
      id: t.id,
      nombre: t.nombre,
      huella: null,
      detalle: [t.test_numero ? `Test #${t.test_numero}` : null, fecha(t.fecha_test), t.estado, pais.get(t.pais_id)].filter(Boolean).join(" · "),
    })),
    ...(productos.data ?? []).filter((p) => !p.padre_id).map((p) => ({ tipo: "producto" as const, id: p.id, nombre: p.nombre, huella: p.foto_huella, detalle: `SKU ${p.codigo}` })),
  ];
  // Compras: un producto por compra (el de la compra y los de sus líneas).
  const productosDe = new Map<string, Set<string>>();
  for (const c of compras.error ? [] : (compras.data ?? [])) if (c.sku_maestro_id) productosDe.set(c.id, new Set([c.sku_maestro_id]));
  for (const it of items.error ? [] : (items.data ?? [])) productosDe.set(it.compra_id, new Set([...(productosDe.get(it.compra_id) ?? []), it.sku_maestro_id]));
  for (const c of compras.error ? [] : (compras.data ?? []))
    for (const skuId of productosDe.get(c.id) ?? []) {
      const sku = skus.get(skuId);
      if (!sku) continue;
      refs.push({
        tipo: "compra",
        id: c.id,
        nombre: sku.nombre,
        huella: huellaDe(skuId),
        detalle: [c.numero ? `OC-${c.numero}` : null, ETAPA[c.etapa] ?? c.etapa, pais.get(c.pais_id), `SKU ${sku.codigo}`].filter(Boolean).join(" · "),
      });
    }
  // Gestión de IDs Dropi: lo que publicamos (las duplicadas no cuentan).
  for (const p of publicaciones.error ? [] : (publicaciones.data ?? [])) {
    if (p.duplicada_de) continue;
    refs.push({
      tipo: "publicacion",
      id: p.id,
      nombre: p.nombre,
      huella: p.foto_huella ?? null,
      detalle: [p.numero ? `PUB-${String(p.numero).padStart(4, "0")}` : null, p.dropi_id ? `ID ${p.dropi_id}` : null, codigoPais.get(p.pais_id), p.estado === "archivado" ? "archivada" : null].filter(Boolean).join(" · "),
    });
  }
  return indexar(refs);
}

/**
 * Prioridad: los productos que aparecen en más de un proveedor de Scraping o en otra fuente de Selección (Drop Killer, Tu
 * Winner, a mano). Devuelve, por id de producto de Scraping y por id de fila de Selección, los nombres de los otros
 * proveedores o fuentes donde está.
 */
export async function cargarRepetidos(supabase: SupabaseClient): Promise<Map<string, Set<string>>> {
  const [prods, provs, sel] = await Promise.all([
    traerTodasConError<{ id: string; proveedor_id: string; nombre: string; foto_huella?: string | null; privado: boolean }>((a, b) =>
      supabase.from("scraping_productos").select("id, proveedor_id, nombre, foto_huella, privado").eq("estado", "activo").order("id").range(a, b),
    ),
    supabase.from("scraping_proveedores").select("id, nombre"),
    supabase.from("wms_seleccion_productos").select("id, nombre, fuente, scraping_producto_id"),
  ]);
  const nombreProv = new Map((provs.data ?? []).map((p) => [p.id, p.nombre]));
  const etiquetaFuente: Record<string, string> = { drop_killer: "Drop Killer", tu_winner: "Tu Winner", manual: "Selección (a mano)" };
  const items: ItemRepetible[] = [
    ...(prods.data ?? []).filter((p) => !p.privado).map((p) => ({ id: p.id, grupo: nombreProv.get(p.proveedor_id) ?? "Otro proveedor", nombre: p.nombre, huella: p.foto_huella ?? null })),
    // De Selección solo cuentan las otras fuentes: lo que vino de Scraping ya está arriba con su proveedor.
    ...(sel.error ? [] : (sel.data ?? []))
      .filter((s) => s.fuente !== "scraping_proveedores")
      .map((s) => ({ id: s.id, grupo: etiquetaFuente[s.fuente] ?? s.fuente, nombre: s.nombre, huella: null })),
  ];
  const r = repetidos(items);
  // Una fila de Selección que vino de Scraping hereda la prioridad de su producto.
  for (const s of sel.error ? [] : (sel.data ?? [])) {
    if (s.scraping_producto_id && r.has(s.scraping_producto_id)) r.set(s.id, r.get(s.scraping_producto_id)!);
  }
  return r;
}
