// Lo que las acciones de Inventario leen de la base para aplicar los permisos y el límite de existencia (`src/lib/permisos/inventario.ts`). Solo se usa en el servidor.
import { hoyPanama } from "@/lib/af4/fecha";
import { faltanteDeCompras, PAISES_CON_LIMITE, repartirFaltante, type ComprasDelProducto, type LineaConFaltante } from "@/lib/permisos/inventario";
import type { createServiceClient } from "@/lib/supabase/server";

type Supabase = ReturnType<typeof createServiceClient>;

export interface BodegaDeInventario {
  nombre: string;
  codigo: string;
  tipo: string;
  paisId: string;
  /** El código del país («PA»). */
  pais: string | null;
  nombrePais: string | null;
}

const uno = <T,>(r: T | T[] | null | undefined): T | null => (Array.isArray(r) ? (r[0] ?? null) : (r ?? null));

/** Una bodega con su país, o `null` si no existe. */
export async function leerBodega(supabase: Supabase, bodegaId: string): Promise<BodegaDeInventario | null> {
  const { data } = await supabase.from("wms_bodegas").select("nombre, codigo, tipo, pais_id, paises(nombre, codigo)").eq("id", bodegaId).maybeSingle();
  if (!data) return null;
  const p = uno(data.paises as { nombre: string; codigo: string } | { nombre: string; codigo: string }[] | null);
  return { nombre: data.nombre as string, codigo: data.codigo as string, tipo: data.tipo as string, paisId: data.pais_id as string, pais: p?.codigo ?? null, nombrePais: p?.nombre ?? null };
}

/**
 * La existencia de cada producto en un país: la suma del físico en sus bodegas propias. `null` si no se pudo leer (la acción no debe guardar sin comprobarlo).
 * Se pide por tandas para no pasar el tope de filas de la base.
 */
export async function existenciasEnPais(supabase: Supabase, skuIds: string[], paisId: string): Promise<Map<string, number> | null> {
  const total = new Map<string, number>(skuIds.map((id) => [id, 0]));
  for (let i = 0; i < skuIds.length; i += 100) {
    const { data, error } = await supabase
      .from("wms_stock")
      .select("sku_maestro_id, fisico, wms_bodegas!inner(pais_id, tipo)")
      .in("sku_maestro_id", skuIds.slice(i, i + 100))
      .eq("wms_bodegas.pais_id", paisId)
      .eq("wms_bodegas.tipo", "propia");
    if (error) return null;
    for (const f of data ?? []) total.set(f.sku_maestro_id as string, (total.get(f.sku_maestro_id as string) ?? 0) + Number(f.fisico));
  }
  return total;
}

/**
 * Lo que faltó al recibir las compras de cada producto en un país (27 nov 2026, pedido de Hernán): las líneas ya recibidas en Recepción con menos de lo pedido, de compras no anuladas ni
 * descartadas, la más vieja primero. Solo en los países con límite. `null` si no se pudo leer.
 */
export async function faltantesDeCompras(supabase: Supabase, skuIds: string[], paisId: string, pais: string | null): Promise<Map<string, LineaConFaltante[]> | null> {
  const r = new Map<string, LineaConFaltante[]>();
  if (!PAISES_CON_LIMITE.includes(pais ?? "") || !skuIds.length) return r;
  for (let i = 0; i < skuIds.length; i += 100) {
    const { data, error } = await supabase
      .from("wms_compra_items")
      .select("id, sku_maestro_id, cantidad_pedida, cantidad_recibida, notas, fecha_recepcion, wms_compras!inner(codigo, pais_id, etapa, anulada_en)")
      .in("sku_maestro_id", skuIds.slice(i, i + 100))
      .not("cantidad_recibida", "is", null)
      .eq("wms_compras.pais_id", paisId)
      .is("wms_compras.anulada_en", null)
      .neq("wms_compras.etapa", "descartado")
      .order("fecha_recepcion", { ascending: true });
    if (error) return null;
    for (const f of data ?? []) {
      const pedida = Number(f.cantidad_pedida);
      const recibida = Number(f.cantidad_recibida);
      if (!(recibida < pedida)) continue;
      const c = uno(f.wms_compras as { codigo: string | null } | { codigo: string | null }[] | null);
      const sku = f.sku_maestro_id as string;
      r.set(sku, [...(r.get(sku) ?? []), { item: f.id as string, compra: c?.codigo ?? "Compra", pedida, recibida, notas: (f.notas as string | null) ?? null }]);
    }
  }
  return r;
}

/** Las etapas en que una compra ya llegó. */
const LLEGADAS = ["arribo_mercancia", "en_bodega", "completado"];

/**
 * La última compra que llegó de cada producto en un país (por su fecha de llegada) y cuánto se pidió en ella (27 nov 2026, pedido de Hernán: fijarse en el total de la compra). Cuenta
 * si está en una etapa de llegada o si ya se recibió en Recepción. Solo en los países con límite. `null` si no se pudo leer.
 */
export async function ultimasCompras(supabase: Supabase, skuIds: string[], paisId: string, pais: string | null): Promise<Map<string, { codigo: string; pedida: number }> | null> {
  const r = new Map<string, { codigo: string; pedida: number; clave: string; id: string }>();
  if (!PAISES_CON_LIMITE.includes(pais ?? "") || !skuIds.length) return new Map();
  for (let i = 0; i < skuIds.length; i += 100) {
    const { data, error } = await supabase
      .from("wms_compra_items")
      .select("sku_maestro_id, cantidad_pedida, cantidad_recibida, compra_id, wms_compras!inner(codigo, pais_id, etapa, anulada_en, fecha_llegada, creado_en)")
      .in("sku_maestro_id", skuIds.slice(i, i + 100))
      .eq("wms_compras.pais_id", paisId)
      .is("wms_compras.anulada_en", null)
      .neq("wms_compras.etapa", "descartado");
    if (error) return null;
    for (const f of data ?? []) {
      const c = uno(f.wms_compras as { codigo: string | null; etapa: string; fecha_llegada: string | null; creado_en: string } | { codigo: string | null; etapa: string; fecha_llegada: string | null; creado_en: string }[] | null);
      if (!c || (!LLEGADAS.includes(c.etapa) && f.cantidad_recibida === null)) continue;
      const sku = f.sku_maestro_id as string;
      const clave = `${c.fecha_llegada ?? ""}|${c.creado_en}`;
      const antes = r.get(sku);
      // Un producto puede venir en varias líneas de la misma compra: se suman.
      if (antes && antes.id === f.compra_id) antes.pedida += Number(f.cantidad_pedida);
      else if (!antes || clave > antes.clave) r.set(sku, { codigo: c.codigo ?? "Compra", pedida: Number(f.cantidad_pedida), clave, id: f.compra_id as string });
    }
  }
  return new Map([...r].map(([sku, x]) => [sku, { codigo: x.codigo, pedida: x.pedida }]));
}

/** Lo que dicen las compras de un producto, para el límite (`revisarLimite`). */
export const comprasDe = (faltantes: Map<string, LineaConFaltante[]>, ultimas: Map<string, { codigo: string; pedida: number }>, sku: string): ComprasDelProducto => ({
  faltante: faltanteDeCompras(faltantes.get(sku) ?? []),
  ultima: ultimas.get(sku) ?? null,
});

/**
 * Completa las compras con lo que acaba de subir la existencia: cada línea pasa a recibida + lo que le toca, con una nota de dónde llegó. Solo cambia la línea si nadie la tocó mientras tanto.
 * Devuelve las unidades anotadas. Nunca lanza: lo subido ya quedó guardado en el inventario.
 */
export async function completarCompras(supabase: Supabase, lineas: LineaConFaltante[] | undefined, unidades: number, donde: string): Promise<number> {
  let hechas = 0;
  try {
    for (const x of repartirFaltante(lineas ?? [], unidades)) {
      const nota = `Llegaron ${x.suma.toLocaleString("es-PA")} más por ${donde} (${hoyPanama()})`;
      const { data } = await supabase
        .from("wms_compra_items")
        .update({ cantidad_recibida: x.despues, notas: [x.notas, nota].filter(Boolean).join(" · "), actualizado_en: new Date().toISOString() })
        .eq("id", x.item)
        .eq("cantidad_recibida", x.antes)
        .select("id");
      if (data?.length) hechas += x.suma;
    }
  } catch {
    // Lo subido ya está en el inventario; la compra queda como estaba.
  }
  return hechas;
}

export const NO_SE_PUDO_COMPROBAR = "No se pudo comprobar la existencia del producto. Intenta de nuevo.";
