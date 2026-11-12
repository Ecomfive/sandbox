// Gestión de tienda › Productos de Shopify (12 nov 2026, punto 2 de la comparación con Mi Reto Digital): los productos y variantes de una tienda conectada
// se traen de Shopify (solo lectura, GraphQL) a `tienda_variantes`, donde una persona los une con nuestros productos. Con la unión hecha, las líneas de los
// pedidos de esa tienda (`ven_orden_lineas.sku_maestro_id`) saben qué producto nuestro salió: por el SKU de Shopify y, en las del Excel de Finanzas (que no
// traen SKU), por el nombre exacto del producto. Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import { huellaFoto } from "@/lib/wms/huella-foto";
import { descargarPublico } from "@/lib/seguridad/url-externa";
import { nombreComparable } from "./ordenes-finanzas";
import { accesoDeApp, appDeTienda } from "./shopify-app";

const VERSION_API = "2026-07";
/** Cuántas fotos nuevas se miran por vez para la huella (la sugerencia por foto); las demás, en la próxima. */
const HUELLAS_POR_VEZ = 40;

const idDe = (gid: string) => Number(String(gid).split("/").pop());
const skuLimpio = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

interface VarianteGql {
  id: string;
  title: string;
  sku: string | null;
  price: string | null;
  image: { url: string } | null;
}
interface ProductoGql {
  id: string;
  title: string;
  status: string;
  featuredImage: { url: string } | null;
  variants: { nodes: VarianteGql[] };
}

const CONSULTA = `query($despues: String) {
  products(first: 50, after: $despues) {
    pageInfo { hasNextPage endCursor }
    nodes { id title status featuredImage { url } variants(first: 100) { nodes { id title sku price image { url } } } }
  }
}`;

/** Una foto de Shopify más chica (para la huella): su CDN acepta `width`. */
const fotoChica = (url: string) => `${url}${url.includes("?") ? "&" : "?"}width=300`;

export interface ResultadoProductos {
  productos: number;
  variantes: number;
  nuevas: number;
  yaNoEstan: number;
  huellas: number;
}

/** Trae todos los productos y variantes de la tienda desde Shopify a `tienda_variantes`. La unión con nuestros productos no se toca. */
export async function traerProductosTienda(supabase: SupabaseClient, tienda: { id: string; nombre: string }): Promise<ResultadoProductos> {
  const app = appDeTienda(tienda.nombre);
  if (!app) throw new Error(`Faltan las claves de ${tienda.nombre} en Vercel.`);
  const { token } = await accesoDeApp(app);
  const productos: ProductoGql[] = [];
  let despues: string | null = null;
  for (let pagina = 0; pagina < 40; pagina++) {
    const r = await fetch(`https://${app.dominio}/admin/api/${VERSION_API}/graphql.json`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token, Accept: "application/json" },
      body: JSON.stringify({ query: CONSULTA, variables: { despues } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`Shopify respondió ${r.status} al leer los productos de ${tienda.nombre}.`);
    const cuerpo = (await r.json()) as { data?: { products: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ProductoGql[] } }; errors?: { message: string }[] };
    if (cuerpo.errors?.length) throw new Error(`Shopify no dio los productos de ${tienda.nombre}: ${cuerpo.errors.map((e) => e.message).join("; ")}`);
    const p = cuerpo.data?.products;
    if (!p) break;
    productos.push(...p.nodes);
    if (!p.pageInfo.hasNextPage) break;
    despues = p.pageInfo.endCursor;
  }

  const { data: antes } = await supabase.from("tienda_variantes").select("shopify_variante_id, foto_url").eq("tienda_id", tienda.id);
  const previas = new Map((antes ?? []).map((v) => [Number(v.shopify_variante_id), (v.foto_url as string | null) ?? null]));
  const ahora = new Date().toISOString();
  const filas = productos.flatMap((p) =>
    p.variants.nodes.map((v) => ({
      tienda_id: tienda.id,
      shopify_variante_id: idDe(v.id),
      shopify_producto_id: idDe(p.id),
      producto_titulo: p.title.slice(0, 500),
      variante_titulo: v.title?.slice(0, 300) ?? null,
      sku: v.sku?.trim() || null,
      precio: v.price !== null && v.price !== undefined && Number.isFinite(Number(v.price)) ? Number(v.price) : null,
      foto_url: v.image?.url ?? p.featuredImage?.url ?? null,
      estado_shopify: p.status?.toLowerCase() ?? null,
      en_shopify: true,
      actualizado_en: ahora,
    })),
  );
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await supabase.from("tienda_variantes").upsert(filas.slice(i, i + 500), { onConflict: "tienda_id,shopify_variante_id" });
    if (error) throw new Error(`tienda_variantes: ${error.message}`);
  }
  // Lo que ya no está en Shopify queda marcado (no se borra: su unión y sus pedidos siguen).
  const vigentes = new Set(filas.map((f) => f.shopify_variante_id));
  const yaNo = [...previas.keys()].filter((id) => !vigentes.has(id));
  for (let i = 0; i < yaNo.length; i += 200) await supabase.from("tienda_variantes").update({ en_shopify: false }).eq("tienda_id", tienda.id).in("shopify_variante_id", yaNo.slice(i, i + 200));
  // Si cambió la foto, la huella vieja ya no sirve.
  const fotoCambio = filas.filter((f) => previas.has(f.shopify_variante_id) && previas.get(f.shopify_variante_id) !== f.foto_url).map((f) => f.shopify_variante_id);
  for (let i = 0; i < fotoCambio.length; i += 200)
    await supabase.from("tienda_variantes").update({ foto_huella: null }).eq("tienda_id", tienda.id).in("shopify_variante_id", fotoCambio.slice(i, i + 200));
  const huellas = await completarHuellas(supabase, tienda.id);
  return { productos: productos.length, variantes: filas.length, nuevas: filas.filter((f) => !previas.has(f.shopify_variante_id)).length, yaNoEstan: yaNo.length, huellas };
}

/** La huella de las fotos que todavía no la tienen (para sugerir por foto), unas pocas por vez. Nunca lanza. */
async function completarHuellas(supabase: SupabaseClient, tiendaId: string): Promise<number> {
  const { data } = await supabase.from("tienda_variantes").select("id, foto_url").eq("tienda_id", tiendaId).is("foto_huella", null).not("foto_url", "is", null).limit(HUELLAS_POR_VEZ);
  let hechas = 0;
  for (const v of data ?? []) {
    try {
      const d = await descargarPublico(fotoChica(v.foto_url as string), 3 * 1024 * 1024);
      if ("error" in d) continue;
      const h = await huellaFoto(d.bytes);
      if (!h) continue;
      await supabase.from("tienda_variantes").update({ foto_huella: h }).eq("id", v.id);
      hechas++;
    } catch {
      // Esa foto queda para la próxima.
    }
  }
  return hechas;
}

/** La unidad de Finanzas de una tienda (Kenku → KENKU, del mismo país), o null. */
async function unidadDeTienda(supabase: SupabaseClient, tiendaId: string): Promise<string | null> {
  const { data: t } = await supabase.from("tiendas").select("nombre, paises(codigo)").eq("id", tiendaId).maybeSingle();
  if (!t) return null;
  const pais = (Array.isArray(t.paises) ? t.paises[0] : t.paises) as { codigo: string } | null;
  const { data: us } = await supabase.from("fin_unidades").select("id, nombre").eq("clase", "tienda").eq("pais", pais?.codigo ?? "");
  return (us ?? []).find((u) => nombreComparable(u.nombre as string) === nombreComparable(t.nombre as string))?.id ?? null;
}

/**
 * Pasa las uniones de la tienda a las líneas de sus pedidos (`ven_orden_lineas.sku_maestro_id`): por SKU de Shopify y, en las líneas sin SKU (el Excel),
 * por el nombre exacto del producto cuando ese producto de Shopify tiene una sola unión. Solo cambia las líneas cuyo producto no coincide. Devuelve cuántas.
 */
export async function aplicarVinculosDeTienda(supabase: SupabaseClient, tiendaId: string, soloOrdenes?: string[]): Promise<number> {
  const unidad = await unidadDeTienda(supabase, tiendaId);
  if (!unidad) return 0;
  const { data: vs } = await supabase.from("tienda_variantes").select("sku, producto_titulo, sku_maestro_id").eq("tienda_id", tiendaId).not("sku_maestro_id", "is", null);
  const porSku = new Map<string, string>();
  const porTitulo = new Map<string, Set<string>>();
  for (const v of vs ?? []) {
    if (v.sku) porSku.set(skuLimpio(v.sku as string), v.sku_maestro_id as string);
    const t = nombreComparable(v.producto_titulo as string);
    porTitulo.set(t, (porTitulo.get(t) ?? new Set()).add(v.sku_maestro_id as string));
  }
  if (!porSku.size && !porTitulo.size) return 0;
  // Las líneas de la tienda (o solo las de esos pedidos), de a 1 000. Se agrupan por lo que las une (su SKU o el nombre del producto) y su destino.
  const grupos = new Map<string, { destino: string; campo: "sku" | "producto"; valor: string; ordenes: Set<string> }>();
  for (let desde = 0; ; desde += 1000) {
    let q = supabase.from("ven_orden_lineas").select("orden_id, linea, producto, sku, sku_maestro_id, ven_ordenes!inner(unidad_id)").eq("ven_ordenes.unidad_id", unidad);
    if (soloOrdenes) q = q.in("orden_id", soloOrdenes);
    const { data, error } = await q.order("orden_id").order("linea").range(desde, desde + 999);
    if (error || !data?.length) break;
    for (const l of data as { orden_id: string; linea: number; producto: string | null; sku: string | null; sku_maestro_id: string | null }[]) {
      let destino: string | undefined;
      let campo: "sku" | "producto" = "sku";
      let valor = "";
      if (l.sku) {
        destino = porSku.get(skuLimpio(l.sku));
        valor = l.sku;
      }
      // Sin SKU (el Excel) o con un SKU que ya no está en Shopify (el pedido guarda el SKU que tenía el producto ese día): por el nombre exacto.
      if (!destino && l.producto) {
        const s = porTitulo.get(nombreComparable(l.producto));
        if (s?.size === 1) destino = [...s][0];
        campo = "producto";
        valor = l.producto;
      }
      if (!destino || destino === l.sku_maestro_id) continue;
      const clave = `${destino}|${campo}|${valor}`;
      const g = grupos.get(clave) ?? { destino, campo, valor, ordenes: new Set<string>() };
      g.ordenes.add(l.orden_id);
      grupos.set(clave, g);
    }
    if (data.length < 1000) break;
  }
  // Cada grupo se actualiza de a 150 pedidos (por su SKU o su nombre exacto dentro de esos pedidos), 8 consultas a la vez.
  const tareas: { destino: string; campo: "sku" | "producto"; valor: string; ordenes: string[] }[] = [];
  for (const g of grupos.values()) {
    const ordenes = [...g.ordenes];
    for (let i = 0; i < ordenes.length; i += 150) tareas.push({ destino: g.destino, campo: g.campo, valor: g.valor, ordenes: ordenes.slice(i, i + 150) });
  }
  let total = 0;
  for (let i = 0; i < tareas.length; i += 8) {
    const hechas = await Promise.all(
      tareas.slice(i, i + 8).map((t) => supabase.from("ven_orden_lineas").update({ sku_maestro_id: t.destino }, { count: "exact" }).eq(t.campo, t.valor).in("orden_id", t.ordenes)),
    );
    for (const { error, count } of hechas) if (!error) total += count ?? 0;
  }
  return total;
}

/** Cuando se deshace una unión: las líneas de la tienda con ese SKU que tenían ese producto lo pierden. */
export async function quitarVinculoDeLineas(supabase: SupabaseClient, tiendaId: string, sku: string, anterior: string): Promise<void> {
  const unidad = await unidadDeTienda(supabase, tiendaId);
  if (!unidad) return;
  const { data } = await supabase.from("ven_orden_lineas").select("orden_id, ven_ordenes!inner(unidad_id)").eq("ven_ordenes.unidad_id", unidad).eq("sku", sku).eq("sku_maestro_id", anterior).limit(5000);
  const ordenes = [...new Set((data ?? []).map((l) => l.orden_id as string))];
  for (let i = 0; i < ordenes.length; i += 150)
    await supabase.from("ven_orden_lineas").update({ sku_maestro_id: null }).eq("sku", sku).eq("sku_maestro_id", anterior).in("orden_id", ordenes.slice(i, i + 150));
}

/** Para los pedidos recién guardados de Shopify (por su `origen_clave`): sus líneas toman el producto de las uniones de su tienda. Nunca lanza. */
export async function aplicarVinculosDeOrdenes(supabase: SupabaseClient, origenClaves: string[]): Promise<void> {
  try {
    if (!origenClaves.length) return;
    const { data: ords } = await supabase.from("ven_ordenes").select("id, unidad_id").in("origen_clave", origenClaves.slice(0, 500));
    const porUnidad = new Map<string, string[]>();
    for (const o of ords ?? []) porUnidad.set(o.unidad_id as string, [...(porUnidad.get(o.unidad_id as string) ?? []), o.id as string]);
    if (!porUnidad.size) return;
    const { data: tiendas } = await supabase.from("tiendas").select("id");
    for (const t of tiendas ?? []) {
      const unidad = await unidadDeTienda(supabase, t.id as string);
      const ids = unidad ? porUnidad.get(unidad) : undefined;
      if (ids?.length) await aplicarVinculosDeTienda(supabase, t.id as string, ids);
    }
  } catch {
    // La próxima revisión de la tienda lo completa.
  }
}
