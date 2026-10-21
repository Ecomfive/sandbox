"use server";

import { getUsuarioActual } from "@/lib/auth";
import { unidadesBajadas, type CambioStock } from "@/lib/competencia/analisis";
import { indexar, todasLasCoincidencias } from "@/lib/scraping/cruces";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DOMINIO: Record<string, string> = { PA: "pa", CR: "cr", MX: "mx", CO: "co" };

export interface CompetidorDeProducto {
  id: string;
  proveedor: string;
  urlProveedor: string;
  nombre: string;
  foto: string | null;
  precio: number | null;
  stock: number | null;
  vendido7: number;
  vendido30: number;
  porFoto: boolean;
  parecido: number;
}

export interface CompetenciaDeProducto {
  pais: string;
  /** Nuestro producto en ese Dropi (ECOMFIVE), si está. */
  nuestro: { nombre: string; precio: number | null; stock: number | null; foto: string | null } | null;
  competidores: CompetidorDeProducto[];
}

interface Fila {
  id: string;
  pais_id: string;
  proveedor_dropi_id: number;
  proveedor_nombre: string;
  nombre: string;
  foto_url: string | null;
  foto_huella: string | null;
  precio: string | null;
  stock: number | null;
  es_nuestro: boolean;
  igual_a: string | null;
}

/**
 * La competencia de un producto de Producto (también se pide desde una línea de una compra): en cada país con Análisis de
 * competencia, los productos de Dropi que son el mismo por nombre o por foto (y los iguales a nuestro producto de ECOMFIVE,
 * si está), con su precio, stock y lo que vendieron en 7 y 30 días. Basta poder abrir Producto, Compras, Gestión de
 * publicaciones Dropi o Análisis de competencia. Devuelve el error como valor.
 */
export async function obtenerCompetenciaProducto(skuId: string): Promise<{ datos?: CompetenciaDeProducto[]; error?: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario) return { error: "No hay sesión activa." };
  if (!["producto", "compras", "analisis-competencia", "publicaciones-dropi"].some((m) => usuario.modulos.includes(m))) return { error: "No tienes acceso." };
  if (!UUID.test(skuId)) return { error: "Producto no válido." };
  const supabase = createServiceClient();
  const { data: sku } = await supabase.from("skus_maestros").select("nombre, foto_huella").eq("id", skuId).maybeSingle();
  if (!sku) return { error: "El producto ya no existe." };

  const { data: filas, error } = await traerTodasConError<Fila>((a, b) =>
    supabase
      .from("competencia_productos")
      .select("id, pais_id, proveedor_dropi_id, proveedor_nombre, nombre, foto_url, foto_huella, precio, stock, es_nuestro, igual_a")
      .eq("estado", "activo")
      .order("id")
      .range(a, b),
  );
  if (error) return { datos: [] }; // Sin la migración 0108 no hay competencia que mostrar.
  const todas = filas ?? [];
  const { data: paises } = await supabase.from("paises").select("id, codigo, nombre");
  const paisDe = new Map((paises ?? []).map((p) => [p.id, p]));
  const n = (v: string | null) => (v === null ? null : Number(v));

  const salida: CompetenciaDeProducto[] = [];
  for (const paisId of new Set(todas.map((f) => f.pais_id))) {
    const delPais = todas.filter((f) => f.pais_id === paisId);
    const indice = indexar(delPais.map((f) => ({ tipo: "producto" as const, id: f.id, nombre: f.nombre, huella: f.foto_huella, detalle: "" })));
    const porId = new Map(delPais.map((f) => [f.id, f]));
    const coincidencias = todasLasCoincidencias(sku.nombre, sku.foto_huella ?? null, indice);
    const nuestra = coincidencias.map((c) => porId.get(c.id)!).find((f) => f.es_nuestro) ?? null;
    const elegidos = new Map<string, { porFoto: boolean; parecido: number }>();
    for (const c of coincidencias) if (!porId.get(c.id)!.es_nuestro) elegidos.set(c.id, { porFoto: c.porFoto, parecido: Math.round(c.parecido * 100) });
    // Los que ya están emparejados con nuestro producto de ECOMFIVE cuentan aunque el nombre de Producto sea distinto.
    if (nuestra) for (const f of delPais) if (f.igual_a === nuestra.id && !elegidos.has(f.id)) elegidos.set(f.id, { porFoto: false, parecido: 0 });
    if (!nuestra && !elegidos.size) continue;

    const ids = [...elegidos.keys()];
    const cambios = new Map<string, CambioStock[]>();
    if (ids.length) {
      const desde = new Date(Date.now() - 31 * 86_400_000).toISOString();
      const { data: hist } = await supabase.from("competencia_historial").select("producto_id, fecha, stock, stock_antes").in("producto_id", ids).eq("evento", "stock").gte("fecha", desde);
      for (const h of hist ?? []) {
        if (h.stock === null || h.stock_antes === null) continue;
        cambios.set(h.producto_id, [...(cambios.get(h.producto_id) ?? []), { fecha: h.fecha, stock: h.stock, stockAntes: h.stock_antes }]);
      }
    }
    const pais = paisDe.get(paisId);
    const dominio = DOMINIO[pais?.codigo ?? ""] ?? (pais?.codigo ?? "pa").toLowerCase();
    salida.push({
      pais: pais?.nombre ?? "—",
      nuestro: nuestra ? { nombre: nuestra.nombre, precio: n(nuestra.precio), stock: nuestra.stock, foto: nuestra.foto_url } : null,
      competidores: ids
        .map((id) => {
          const f = porId.get(id)!;
          const c = cambios.get(id) ?? [];
          return {
            id,
            proveedor: f.proveedor_nombre,
            urlProveedor: `https://app.dropi.${dominio}/dashboard/provider/${f.proveedor_dropi_id}/${encodeURIComponent(f.proveedor_nombre)}`,
            nombre: f.nombre,
            foto: f.foto_url,
            precio: n(f.precio),
            stock: f.stock,
            vendido7: unidadesBajadas(c, 7),
            vendido30: unidadesBajadas(c, 30),
            ...elegidos.get(id)!,
          };
        })
        .sort((a, b) => (a.precio ?? 1e9) - (b.precio ?? 1e9)),
    });
  }
  return { datos: salida };
}

export interface EventoCompetencia {
  fecha: string;
  evento: string;
  precio: number | null;
  stock: number | null;
  precioAntes: number | null;
  stockAntes: number | null;
}

/** El historial de un producto (para la comparación lado a lado), del más nuevo al más viejo. */
export async function obtenerHistorialCompetencia(productoId: string): Promise<{ eventos?: EventoCompetencia[]; error?: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario || !["producto", "compras", "analisis-competencia"].some((m) => usuario.modulos.includes(m))) return { error: "No tienes acceso." };
  if (!UUID.test(productoId)) return { error: "Producto no válido." };
  const { data, error } = await createServiceClient()
    .from("competencia_historial")
    .select("fecha, evento, precio, stock, precio_antes, stock_antes")
    .eq("producto_id", productoId)
    .order("fecha", { ascending: false })
    .limit(200);
  if (error) return { error: error.message };
  const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return { eventos: (data ?? []).map((e) => ({ fecha: e.fecha, evento: e.evento, precio: n(e.precio), stock: e.stock, precioAntes: n(e.precio_antes), stockAntes: e.stock_antes })) };
}
