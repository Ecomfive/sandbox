"use server";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { rutaLegible } from "@/lib/categorias/taxonomia";
import { sugerirPorParecidos, type SugerenciaCategoria } from "@/lib/categorias/sugerir";
import { palabrasClave } from "@/lib/wms/duplicados";
import { huellaFoto } from "@/lib/wms/huella-foto";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";

const MODULO = "producto";
const ES_ID = (v: string) => /^[0-9a-f-]{36}$/i.test(v);
const ES_CATEGORIA = (v: string) => /^[a-z]{2}(-\d+)*$/.test(v);

const sinTildes = (t: string) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export interface OpcionCategoria {
  id: string;
  ruta: string;
}

/**
 * Busca en la taxonomía de Shopify (migración 0113) por palabras: cada palabra debe aparecer en la ruta («crema facial» →
 * «… Cuidado de la piel > Cremas hidratantes faciales»). Las más generales primero. Basta poder abrir Producto.
 */
export async function buscarCategorias(texto: string): Promise<OpcionCategoria[]> {
  await requireModulo(MODULO);
  // Solo letras, números y espacios: lo escrito no se arma crudo dentro del filtro.
  const palabras = String(texto ?? "")
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((p) => p.length >= 2)
    .slice(0, 5);
  if (!palabras.length) return [];
  let q = createServiceClient().from("categorias_productos").select("id, ruta");
  // Sin importar tildes: cada vocal es un comodín de una letra («audifonos» encuentra «Audífonos»).
  for (const p of palabras) q = q.ilike("ruta", `%${sinTildes(p).replace(/[aeiou]/g, "_")}%`);
  const { data } = await q.order("nivel").order("ruta").limit(30);
  return (data ?? []) as OpcionCategoria[];
}

/**
 * Pone (o quita, con null) la categoría de un producto. La elegida por una persona queda como «manual» y ya no está por
 * revisar. Con `confirmar` solo marca como revisada la que ya tenía. Queda en la actividad del producto.
 */
export async function cambiarCategoriaProducto(id: string, categoriaId: string | null, confirmar = false): Promise<{ error?: string; ruta?: string | null }> {
  await requireModuloEscritura(MODULO);
  if (!ES_ID(id)) return { error: "Producto no válido." };
  if (categoriaId !== null && !ES_CATEGORIA(categoriaId)) return { error: "Categoría no válida." };
  const supabase = createServiceClient();
  const { data: antes, error: errorAntes } = await supabase.from("skus_maestros").select("categoria_id, categoria_revisar, categorias_productos(ruta)").eq("id", id).maybeSingle();
  if (errorAntes) return { error: "Falta correr la migración 0113 en Supabase." };
  if (!antes) return { error: "No se encontró el producto." };
  const rutaAntes = (Array.isArray(antes.categorias_productos) ? antes.categorias_productos[0] : antes.categorias_productos)?.ruta ?? null;

  if (confirmar) {
    if (!antes.categoria_id || !antes.categoria_revisar) return { ruta: rutaAntes };
    const { error } = await supabase.from("skus_maestros").update({ categoria_revisar: false, categoria_origen: "manual" }).eq("id", id);
    if (error) return { error: "No se pudo confirmar la categoría." };
    await registrarAuditoria({ accion: "confirmar_categoria_producto", entidad: "skus_maestros", entidadId: id, detalle: rutaLegible(rutaAntes ?? "") });
    revalidatePath("/producto");
    return { ruta: rutaAntes };
  }

  let ruta: string | null = null;
  if (categoriaId) {
    const { data: cat } = await supabase.from("categorias_productos").select("ruta").eq("id", categoriaId).maybeSingle();
    if (!cat) return { error: "Esa categoría no existe." };
    ruta = cat.ruta as string;
  }
  if (antes.categoria_id === categoriaId && !antes.categoria_revisar) return { ruta };
  const { error } = await supabase
    .from("skus_maestros")
    .update({ categoria_id: categoriaId, categoria_origen: categoriaId ? "manual" : null, categoria_revisar: false })
    .eq("id", id);
  if (error) return { error: "No se pudo guardar la categoría." };
  await registrarAuditoria({
    accion: "cambiar_categoria_producto",
    entidad: "skus_maestros",
    entidadId: id,
    antes: { Categoría: rutaAntes ? rutaLegible(rutaAntes) : "Sin categoría" },
    despues: { Categoría: ruta ? rutaLegible(ruta) : "Sin categoría" },
  });
  revalidatePath("/producto");
  return { ruta };
}

/** Palabras que describen pero no dicen qué es el producto: no sirven para buscar su categoría. */
const GENERICAS = new Set(["inalambrico", "inalambrica", "recargable", "portatil", "electrico", "electrica", "multifuncional", "mini", "nuevo", "nueva", "original", "premium", "profesional", "automatico", "automatica", "magnetico", "magnetica", "plegable", "ajustable", "universal", "inteligente", "digital", "unisex"]);

const BUCKET_FOTOS = "wms-productos";
const PREFIJO_FOTOS = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_FOTOS}/`;

/**
 * Las categorías que se sugieren para un producto nuevo por su nombre y su foto (recién subida a `productos/nuevos/`): primero
 * por los productos ya clasificados que se le parecen (`sugerirPorParecidos`); si no hay ninguno, por las palabras del nombre
 * que aparecen en el nombre de una categoría de la taxonomía. Basta poder abrir Producto. Sin la migración 0113, nada.
 */
export async function sugerirCategoria(nombre: string, foto: string | null): Promise<SugerenciaCategoria[]> {
  await requireModulo(MODULO);
  const texto = String(nombre ?? "").trim().slice(0, 200);
  const supabase = createServiceClient();

  let huella: string | null = null;
  const prefijoNuevos = `${PREFIJO_FOTOS}productos/nuevos/`;
  if (typeof foto === "string" && foto.startsWith(prefijoNuevos) && !foto.includes("..") && !foto.includes("?")) {
    const { data: archivo } = await supabase.storage.from(BUCKET_FOTOS).download(foto.slice(PREFIJO_FOTOS.length));
    if (archivo) huella = await huellaFoto(new Uint8Array(await archivo.arrayBuffer())).catch(() => null);
  }
  if (texto.length < 3 && !huella) return [];

  try {
    const ejemplos = await traerTodasLasFilas<{ nombre: string; foto_huella: string | null; categoria_id: string; categorias_productos: unknown }>((desde, hasta) =>
      supabase.from("skus_maestros").select("nombre, foto_huella, categoria_id, categorias_productos(ruta)").not("categoria_id", "is", null).order("id").range(desde, hasta),
    );
    const porParecidos = sugerirPorParecidos(
      texto,
      huella,
      ejemplos.map((e) => {
        const cat = (Array.isArray(e.categorias_productos) ? e.categorias_productos[0] : e.categorias_productos) as { ruta: string } | null;
        return { nombre: e.nombre, huella: e.foto_huella, categoriaId: e.categoria_id, ruta: cat?.ruta ?? "" };
      }),
    );
    if (porParecidos.length) return porParecidos;
  } catch {
    return [];
  }

  // Sin parecidos: las categorías cuyo nombre contiene palabras del nombre del producto. Las primeras palabras pesan más (dicen
  // qué es: «Taladro percutor inalámbrico»), los adjetivos genéricos no cuentan y, a igual peso, gana la más general.
  const palabras = palabrasClave(texto)
    .filter((p) => p.length >= 4 && !GENERICAS.has(sinTildes(p)))
    .slice(0, 4);
  if (!palabras.length) return [];
  const base = (p: string) => sinTildes(p).replace(/(es|s)$/, "");
  const respuestas = await Promise.all(
    palabras.map((p) => supabase.from("categorias_productos").select("id, ruta, nombre, nivel").ilike("nombre", `%${base(p).replace(/[aeiou]/g, "_")}%`).order("nivel").limit(25)),
  );
  const puntos = new Map<string, { id: string; ruta: string; nivel: number; peso: number }>();
  respuestas.forEach((r, i) => {
    for (const c of (r.data ?? []) as { id: string; ruta: string; nombre: string; nivel: number }[]) {
      if (!sinTildes(c.nombre).includes(base(palabras[i]))) continue;
      const f = puntos.get(c.id) ?? { id: c.id, ruta: c.ruta, nivel: c.nivel, peso: 0 };
      // Si el nombre de la categoría empieza por la palabra («Taladros»), pesa más que si solo la contiene («Accesorios para
      // taladros»).
      f.peso += palabras.length - i + (sinTildes(c.nombre).startsWith(base(palabras[i])) ? 0.5 : 0);
      puntos.set(c.id, f);
    }
  });
  return [...puntos.values()]
    .sort((a, b) => b.peso - a.peso || a.nivel - b.nivel)
    .slice(0, 3)
    .map((c) => ({ id: c.id, ruta: c.ruta, puntaje: 0, ejemplos: [] }));
}
