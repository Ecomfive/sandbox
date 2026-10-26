import type { SupabaseClient } from "@supabase/supabase-js";
import { conTtl } from "@/lib/cache-ttl";
import { numeroPublicacion } from "@/lib/publicaciones/publicacion";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import type { Ambito, Candidato } from "./buscar";

const trozos = <T,>(lista: T[], n: number): T[][] => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));
const huellaValida = (h: unknown): string | null => (typeof h === "string" && /^[0-9a-f]{16}$/.test(h) ? h : null);

type Fila = Record<string, unknown>;

async function cargarSinCache(supabase: SupabaseClient, ambito: Ambito, paisId: string): Promise<Candidato[]> {
  if (ambito === "producto") {
    const filas = await traerTodasLasFilas<Fila>((d, h) =>
      supabase.from("skus_maestros").select("id, codigo, nombre, foto_url, foto_huella").not("foto_url", "is", null).order("id").range(d, h),
    );
    return filas.map((f) => ({
      ambito,
      id: f.id as string,
      nombre: String(f.nombre ?? ""),
      foto: (f.foto_url as string | null) ?? null,
      huella: huellaValida(f.foto_huella),
      detalle: `SKU ${f.codigo}`,
      href: `/producto?abrir=${f.id}`,
    }));
  }
  if (ambito === "publicacion") {
    const filas = await traerTodasLasFilas<Fila>((d, h) =>
      supabase.from("dropi_publicaciones").select("id, numero, nombre, dropi_id, foto_url, foto_huella, sku_maestro_id").eq("pais_id", paisId).order("id").range(d, h),
    );
    // Sin foto propia, la del producto vinculado (como la lista).
    const skuIds = [...new Set(filas.map((f) => f.sku_maestro_id as string | null).filter((x): x is string => !!x))];
    const skus = new Map<string, { foto: string | null; huella: string | null }>();
    for (const ids of trozos(skuIds, 100)) {
      const { data } = await supabase.from("skus_maestros").select("id, foto_url, foto_huella").in("id", ids);
      for (const s of data ?? []) skus.set(s.id as string, { foto: (s.foto_url as string | null) ?? null, huella: huellaValida(s.foto_huella) });
    }
    return filas
      .map((f) => {
        const sku = f.sku_maestro_id ? skus.get(f.sku_maestro_id as string) : undefined;
        return {
          ambito,
          id: f.id as string,
          nombre: String(f.nombre ?? ""),
          foto: (f.foto_url as string | null) ?? sku?.foto ?? null,
          huella: huellaValida(f.foto_huella) ?? sku?.huella ?? null,
          detalle: `${numeroPublicacion((f.numero as number | null) ?? null)}${f.dropi_id ? ` · ID ${f.dropi_id}` : ""}`,
          href: `/publicaciones-dropi?abrir=${f.id}`,
        };
      })
      .filter((c) => c.foto);
  }
  if (ambito === "scraping") {
    const { data: proveedores } = await supabase.from("scraping_proveedores").select("id, nombre, pais");
    const prov = new Map((proveedores ?? []).map((p) => [p.id as string, `${p.nombre} · ${String(p.pais ?? "").toUpperCase()}`]));
    const filas = await traerTodasLasFilas<Fila>((d, h) =>
      supabase.from("scraping_productos").select("id, nombre, foto_url, foto_huella, proveedor_id, dropi_producto_id").not("foto_url", "is", null).order("id").range(d, h),
    );
    return filas.map((f) => ({
      ambito,
      id: f.id as string,
      nombre: String(f.nombre ?? ""),
      foto: (f.foto_url as string | null) ?? null,
      huella: huellaValida(f.foto_huella),
      detalle: `${prov.get(f.proveedor_id as string) ?? "Proveedor"} · ID ${f.dropi_producto_id}`,
      href: "/scraping-proveedores",
    }));
  }
  const filas = await traerTodasLasFilas<Fila>((d, h) =>
    supabase
      .from("competencia_productos")
      .select("id, nombre, foto_url, foto_huella, proveedor_nombre, dropi_producto_id")
      .eq("pais_id", paisId)
      .not("foto_url", "is", null)
      .order("id")
      .range(d, h),
  );
  return filas.map((f) => ({
    ambito,
    id: f.id as string,
    nombre: String(f.nombre ?? ""),
    foto: (f.foto_url as string | null) ?? null,
    huella: huellaValida(f.foto_huella),
    detalle: `${f.proveedor_nombre} · ID ${f.dropi_producto_id}`,
    href: "/analisis-competencia",
  }));
}

/**
 * Los productos con foto de una parte del sistema, para compararlos con la foto buscada. Se guardan unos minutos en memoria (las fotos casi no cambian y una
 * búsqueda por imagen trae miles de filas): lo comparten las personas de la misma instancia, no tiene nada que ver con permisos (cada acción comprueba los suyos).
 * Si la consulta falla, esa parte no aporta nada.
 */
export const cargarCandidatos = conTtl(
  180_000,
  (clave: string) => clave,
  async (_clave: string, supabase: SupabaseClient, ambito: Ambito, paisId: string): Promise<Candidato[]> => {
    try {
      return await cargarSinCache(supabase, ambito, paisId);
    } catch {
      return [];
    }
  },
  { esValido: (r) => r.length > 0 },
);
