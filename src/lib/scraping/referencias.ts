import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { indexar, repetidos, type IndiceReferencias, type ItemRepetible, type Referencia } from "./cruces";

const fecha = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" }) : null);

/**
 * Lo ya visto para los cruces de Testing Lab: todos los tests de Test productos (de todos los países: un producto testeado en
 * otro país también cuenta) y todos los productos de Producto (sin variantes), con la huella de su foto si la tienen.
 */
export async function cargarReferencias(supabase: SupabaseClient): Promise<IndiceReferencias> {
  const [tests, productos, paises] = await Promise.all([
    traerTodasConError<{ id: string; nombre: string; fecha_test: string | null; estado: string | null; test_numero: number | null; pais_id: string }>((a, b) =>
      supabase.from("wms_productos_test").select("id, nombre, fecha_test, estado, test_numero, pais_id").order("id").range(a, b),
    ),
    traerTodasConError<{ id: string; codigo: string; nombre: string; foto_huella: string | null }>((a, b) =>
      supabase.from("skus_maestros").select("id, codigo, nombre, foto_huella").is("padre_id", null).order("id").range(a, b),
    ),
    supabase.from("paises").select("id, nombre"),
  ]);
  const pais = new Map((paises.data ?? []).map((p) => [p.id, p.nombre]));
  const refs: Referencia[] = [
    ...(tests.data ?? []).map((t) => ({
      tipo: "test" as const,
      id: t.id,
      nombre: t.nombre,
      huella: null,
      detalle: [t.test_numero ? `Test #${t.test_numero}` : null, fecha(t.fecha_test), t.estado, pais.get(t.pais_id)].filter(Boolean).join(" · "),
    })),
    ...(productos.data ?? []).map((p) => ({ tipo: "producto" as const, id: p.id, nombre: p.nombre, huella: p.foto_huella, detalle: `SKU ${p.codigo}` })),
  ];
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
