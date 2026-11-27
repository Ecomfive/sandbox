// «Bajar precio» en Gestión de IDs Drop (24 nov 2026, pedido de Hernán): la misma regla de Dropi («alguien vende lo mismo más barato y tiene stock») con la
// competencia del Catálogo de Drop (`drop_competencia_productos`, que lee «Drop: competencia» en Datos). Lo mismo = emparejado con el nuestro por nombre y foto
// con certeza exacta, o confirmado por una persona o la IA («mismo»); lo descartado («distinto») o solo «parecido» no cuenta. Los precios se comparan como
// salen en el mismo catálogo (lo que paga el dropshipper), llevados al tamaño del nuestro (`precioEquivalente`). Aquí la regla, sin base, con prueba;
// la carga está en `cargarCompetenciaDrop`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { precioEquivalente } from "@/lib/competencia/analisis";
import { certezaIgual } from "@/lib/competencia/certeza";
import { clavesDistintas, descartadoPara } from "@/lib/competencia/descartar";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";

export interface CompetidorDrop {
  proveedor: string;
  nombre: string;
  /** Su precio en el catálogo (colones). */
  precio: number | null;
  stock: number;
}

export interface CompetenciaDeProducto {
  /** Nuestro precio tal como sale en el mismo catálogo. */
  nuestroPrecio: number | null;
  nuestroNombre: string;
  competidores: CompetidorDrop[];
}

/** El competidor más barato que nosotros (a precio equivalente), o null. */
export function masBaratoDrop(c: CompetenciaDeProducto | undefined): { proveedor: string; precio: number } | null {
  if (!c || c.nuestroPrecio === null) return null;
  let mejor: { proveedor: string; precio: number } | null = null;
  for (const o of c.competidores) {
    if (o.stock <= 0) continue;
    const eq = precioEquivalente(c.nuestroNombre, o).precio;
    if (eq !== null && eq < c.nuestroPrecio && (!mejor || eq < mejor.precio)) mejor = { proveedor: o.proveedor, precio: Math.round(eq * 100) / 100 };
  }
  return mejor;
}

/**
 * La competencia de cada producto nuestro en el Catálogo de Drop, por su id de Drop (`drop_publicaciones.drop_id`), y si hay alguna lectura guardada.
 * Sin las tablas (migración 0234) o sin lecturas: vacío y `hayLectura` false.
 */
export async function cargarCompetenciaDrop(
  supabase: SupabaseClient,
  paisId: string,
): Promise<{ hayLectura: boolean; ultimaLectura: string | null; porDropId: Map<string, CompetenciaDeProducto> }> {
  const porDropId = new Map<string, CompetenciaDeProducto>();
  let ultimaLectura: string | null = null;
  try {
    // Cuándo se leyó por última vez (para decir en la tarjeta de qué día es la competencia).
    const { data: b } = await supabase.from("drop_competencia_busquedas").select("fin, inicio").eq("pais_id", paisId).eq("estado", "lista").order("inicio", { ascending: false }).limit(1).maybeSingle();
    ultimaLectura = (b?.fin as string | null) ?? (b?.inicio as string | null) ?? null;
    type Fila = { id: string; drop_producto_id: string; nombre: string; foto_huella: string | null; proveedor_nombre: string; precio: number | null; stock: number | null; igual_a: string | null; igual_metodo: string | null };
    const columnas = "id, drop_producto_id, nombre, foto_huella, proveedor_nombre, precio, stock, igual_a, igual_metodo";
    const [nuestros, otros] = await Promise.all([
      traerTodasLasFilas<Fila>((d, h) => supabase.from("drop_competencia_productos").select(columnas).eq("pais_id", paisId).eq("es_nuestro", true).eq("estado", "activo").order("id").range(d, h)),
      traerTodasLasFilas<Fila>((d, h) =>
        supabase.from("drop_competencia_productos").select(columnas).eq("pais_id", paisId).eq("es_nuestro", false).eq("estado", "activo").gt("stock", 0).not("igual_a", "is", null).order("id").range(d, h),
      ),
    ]);
    if (!nuestros.length) return { hayLectura: false, ultimaLectura, porDropId };
    let distintas = new Set<string>();
    let veredictos = new Map<string, string>();
    try {
      const filas = await traerTodasLasFilas<{ id: string; producto_id: string; nuestro_id: string; veredicto: string }>((d, h) =>
        supabase.from("competencia_verificaciones").select("id, producto_id, nuestro_id, veredicto").eq("plataforma", "drop").order("id").range(d, h),
      );
      distintas = clavesDistintas(filas.filter((f) => f.veredicto === "distinto"));
      veredictos = new Map(filas.map((f) => [`${f.producto_id}|${f.nuestro_id}`, f.veredicto]));
    } catch {
      // Sin la tabla: nada descartado ni confirmado.
    }
    const nuestroDe = new Map(nuestros.map((n) => [n.id, n]));
    for (const n of nuestros) porDropId.set(n.drop_producto_id, { nuestroPrecio: n.precio === null ? null : Number(n.precio), nuestroNombre: n.nombre, competidores: [] });
    for (const o of otros) {
      const n = o.igual_a ? nuestroDe.get(o.igual_a) : undefined;
      if (!n || descartadoPara(o.id, [n.id], distintas)) continue;
      const v = veredictos.get(`${o.id}|${n.id}`);
      const mismo = v === "mismo" || (v !== "parecido" && certezaIgual({ nombre: n.nombre, huella: n.foto_huella }, { nombre: o.nombre, huella: o.foto_huella }, o.igual_metodo) === "exacto");
      if (!mismo) continue;
      porDropId.get(n.drop_producto_id)!.competidores.push({ proveedor: o.proveedor_nombre, nombre: o.nombre, precio: o.precio === null ? null : Number(o.precio), stock: Number(o.stock ?? 0) });
    }
    return { hayLectura: true, ultimaLectura, porDropId };
  } catch {
    return { hayLectura: false, ultimaLectura, porDropId };
  }
}
