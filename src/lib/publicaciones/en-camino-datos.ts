import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth";
import { lineaEnCamino, llegadaDeCompra, resumenLlegada, type ResumenLlegada } from "@/lib/compras/en-camino";
import { cargarTiempos } from "@/lib/compras/tiempos-datos";
import { dentroDelAlcance, restriccionesDe } from "@/app/(app)/compras/permisos-compras";

type Compra = { id: string; etapa: string; fecha_limite: string | null; via_envio: string[] | null; fecha_envio: string | null; fecha_llegada: string | null; anulada_en: string | null; asignado_a: string | null; creado_por: string | null; responsable_nombre: string | null; creador_nombre: string | null };

const trozos = <T,>(lista: T[], n: number): T[][] => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));

/**
 * Lo que viene en camino de cada producto de un país: las unidades de las órdenes ya pedidas que todavía no llegan (ya salieron o están
 * en producción, tracking o arribo: `lineaEnCamino`), cuándo llegan (la más próxima, `llegadaDeCompra`: la fecha límite de la compra o la
 * estimada con su fecha y vía de envío) y cuántas unidades no tienen fecha todavía, por id de producto. Un producto con variantes
 * suma las de sus variantes. Respeta el alcance de Compras de la persona (Usuarios y roles › Afinar). Solo unidades y fechas: no
 * trae costos. Si algo falla, un mapa vacío.
 */
export async function cargarEnCamino(supabase: SupabaseClient, paisId: string, usuario: UsuarioActual): Promise<Map<string, ResumenLlegada>> {
  const resumen = new Map<string, ResumenLlegada>();
  const { data: compras, error } = await supabase
    .from("wms_compras")
    .select("id, etapa, fecha_limite, via_envio, fecha_envio, fecha_llegada, anulada_en, asignado_a, creado_por, responsable_nombre, creador_nombre")
    .eq("pais_id", paisId)
    .is("anulada_en", null)
    .is("fecha_llegada", null)
    .not("etapa", "in", "(completado,descartado)")
    // Ya salió, o ya está en producción, tracking o arribo (pedida aunque todavía no tenga fecha de envío).
    .or("fecha_envio.not.is.null,etapa.in.(produccion,tracking,arribo_mercancia)");
  if (error || !compras?.length) return resumen;
  const limites = restriccionesDe(usuario.afinado.compras);
  const enCamino = (compras as Compra[]).filter(
    (c) =>
      lineaEnCamino({ pais: null, unidades: 1, etapa: c.etapa, fechaEnvio: c.fecha_envio, fechaLlegada: c.fecha_llegada, anulada: !!c.anulada_en }) &&
      dentroDelAlcance(limites.alcance, { asignadoId: c.asignado_a, creadoPorId: c.creado_por, responsableNombre: c.responsable_nombre, creadorNombre: c.creador_nombre }, usuario),
  );
  if (!enCamino.length) return resumen;

  const lineas: { compra_id: string; sku_maestro_id: string; cantidad_pedida: number }[] = [];
  for (const ids of trozos(enCamino.map((c) => c.id), 100)) {
    const { data } = await supabase.from("wms_compra_items").select("compra_id, sku_maestro_id, cantidad_pedida").in("compra_id", ids);
    lineas.push(...((data ?? []) as typeof lineas));
  }
  // Una variante suma al producto del que es variante.
  const padres = new Map<string, string>();
  for (const ids of trozos([...new Set(lineas.map((l) => l.sku_maestro_id).filter(Boolean))], 100)) {
    const { data } = await supabase.from("skus_maestros").select("id, padre_id").in("id", ids).not("padre_id", "is", null);
    for (const s of data ?? []) padres.set(s.id as string, s.padre_id as string);
  }
  const tiempos = await cargarTiempos();
  const llegadaDe = new Map(enCamino.map((c) => [c.id, llegadaDeCompra(tiempos, { fechaLimite: c.fecha_limite, fechaEnvio: c.fecha_envio, vias: c.via_envio ?? [], clave: paisId })?.fecha ?? null]));
  const ordenes = new Map<string, { unidades: number; llegada: string | null }[]>();
  for (const l of lineas) {
    const n = Number(l.cantidad_pedida);
    if (!l.sku_maestro_id || !(n > 0)) continue;
    for (const id of new Set([l.sku_maestro_id, padres.get(l.sku_maestro_id)].filter((x): x is string => !!x))) ordenes.set(id, [...(ordenes.get(id) ?? []), { unidades: n, llegada: llegadaDe.get(l.compra_id) ?? null }]);
  }
  for (const [id, o] of ordenes) resumen.set(id, resumenLlegada(o));
  return resumen;
}
