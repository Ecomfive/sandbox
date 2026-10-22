import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth";
import { lineaEnCamino } from "@/lib/compras/en-camino";
import { dentroDelAlcance, restriccionesDe } from "@/app/(app)/compras/permisos-compras";

type Compra = { id: string; etapa: string; fecha_envio: string | null; fecha_llegada: string | null; anulada_en: string | null; asignado_a: string | null; creado_por: string | null; responsable_nombre: string | null; creador_nombre: string | null };

const trozos = <T,>(lista: T[], n: number): T[][] => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

/**
 * Las unidades que vienen en camino de cada producto de un país: las de las órdenes que ya salieron y todavía no llegan (la misma regla
 * de «En tránsito» de Compras, `lineaEnCamino`), por id de producto. Un producto con variantes suma las de sus variantes. Respeta el
 * alcance de Compras de la persona (Usuarios y roles › Afinar). Solo unidades: no trae costos. Si algo falla, un mapa vacío.
 */
export async function cargarEnCamino(supabase: SupabaseClient, paisId: string, usuario: UsuarioActual): Promise<Map<string, number>> {
  const unidades = new Map<string, number>();
  const { data: compras, error } = await supabase
    .from("wms_compras")
    .select("id, etapa, fecha_envio, fecha_llegada, anulada_en, asignado_a, creado_por, responsable_nombre, creador_nombre")
    .eq("pais_id", paisId)
    .is("anulada_en", null)
    .is("fecha_llegada", null)
    .not("fecha_envio", "is", null);
  if (error || !compras?.length) return unidades;
  const limites = restriccionesDe(usuario.afinado.compras);
  const enCamino = (compras as Compra[]).filter(
    (c) =>
      lineaEnCamino({ pais: null, unidades: 1, etapa: c.etapa, fechaEnvio: c.fecha_envio, fechaLlegada: c.fecha_llegada, anulada: !!c.anulada_en }) &&
      dentroDelAlcance(limites.alcance, { asignadoId: c.asignado_a, creadoPorId: c.creado_por, responsableNombre: c.responsable_nombre, creadorNombre: c.creador_nombre }, usuario),
  );
  if (!enCamino.length) return unidades;

  const lineas: { sku_maestro_id: string; cantidad_pedida: number }[] = [];
  for (const ids of trozos(enCamino.map((c) => c.id), 100)) {
    const { data } = await supabase.from("wms_compra_items").select("sku_maestro_id, cantidad_pedida").in("compra_id", ids);
    lineas.push(...((data ?? []) as typeof lineas));
  }
  // Una variante suma al producto del que es variante.
  const padres = new Map<string, string>();
  for (const ids of trozos([...new Set(lineas.map((l) => l.sku_maestro_id).filter(Boolean))], 100)) {
    const { data } = await supabase.from("skus_maestros").select("id, padre_id").in("id", ids).not("padre_id", "is", null);
    for (const s of data ?? []) padres.set(s.id as string, s.padre_id as string);
  }
  for (const l of lineas) {
    const n = Number(l.cantidad_pedida);
    if (!l.sku_maestro_id || !(n > 0)) continue;
    for (const id of new Set([l.sku_maestro_id, padres.get(l.sku_maestro_id)].filter((x): x is string => !!x))) unidades.set(id, (unidades.get(id) ?? 0) + n);
  }
  return unidades;
}
