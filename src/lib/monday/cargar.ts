// Lectura de Monday.com para el portal (migración 0951): la configuración del tablero, el catálogo de causas y los
// despachos de un rango de meses ya listos para analizar (con el total y el costo de envío de su orden y la causa
// codificada). La usan Deliverys › Monday, el Comité y el Estado del sistema. Solo lectura.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { causaDeTexto, type Causa, type DespachoAnalisis } from "./causas";
import { esGrupoEstado, leerMapeo, leerReglasEstado, type GrupoEstado, type MapeoColumnas } from "./columnas";
import { SIN_MIGRACION_MONDAY } from "./sincronizar";

export interface ConfigMonday {
  tableroId: string | null;
  tableroNombre: string | null;
  mapeo: MapeoColumnas;
  reglas: Record<string, GrupoEstado>;
  items: number;
  ultimaLectura: string | null;
  ultimoError: string | null;
  actualizadoEn: string | null;
}

export async function cargarConfigMonday(supabase: SupabaseClient): Promise<ConfigMonday | { error: string }> {
  const { data, error } = await supabase.from("mon_config").select("tablero_id, tablero_nombre, columnas, estados, items, ultima_lectura, ultimo_error, actualizado_en").eq("id", 1).maybeSingle();
  if (error) return { error: SIN_MIGRACION_MONDAY };
  return {
    tableroId: (data?.tablero_id as string | null) ?? null,
    tableroNombre: (data?.tablero_nombre as string | null) ?? null,
    mapeo: leerMapeo(data?.columnas),
    reglas: leerReglasEstado(data?.estados),
    items: Number(data?.items ?? 0),
    ultimaLectura: (data?.ultima_lectura as string | null) ?? null,
    ultimoError: (data?.ultimo_error as string | null) ?? null,
    actualizadoEn: (data?.actualizado_en as string | null) ?? null,
  };
}

export async function cargarCausas(supabase: SupabaseClient): Promise<{ catalogo: Causa[]; aMano: Map<string, string> } | { error: string }> {
  const [c, t] = await Promise.all([supabase.from("mon_causas").select("codigo, nombre, palabras, orden, activo").order("orden"), supabase.from("mon_causa_textos").select("texto, codigo")]);
  if (c.error || t.error) return { error: SIN_MIGRACION_MONDAY };
  return {
    catalogo: (c.data ?? []).map((x) => ({ codigo: x.codigo as string, nombre: x.nombre as string, palabras: (x.palabras as string[] | null) ?? [], orden: Number(x.orden), activo: x.activo !== false })),
    aMano: new Map((t.data ?? []).map((x) => [x.texto as string, x.codigo as string])),
  };
}

export interface DespachoCargado extends DespachoAnalisis {
  causaTexto: string | null;
  estado: string | null;
}

/** Los despachos con periodo entre `desde` y `hasta` (meses «AAAA-MM-01»), con la causa codificada. */
export async function cargarDespachos(supabase: SupabaseClient, desde: string, hasta: string, causas: { catalogo: Causa[]; aMano: Map<string, string> } | null): Promise<DespachoCargado[] | { error: string }> {
  type Fila = {
    periodo: string | null;
    unidad_id: string | null;
    tienda_texto: string | null;
    courier: string | null;
    estado: string | null;
    estado_grupo: string;
    causa_rechazo: string | null;
    fecha_despacho: string | null;
    fin_unidades: { nombre: string } | null;
    ven_ordenes: { total: number | string; costo_envio: number | string } | null;
  };
  const r = await traerTodasConError<Fila>((a, b) =>
    supabase
      .from("mon_despachos")
      .select("periodo, unidad_id, tienda_texto, courier, estado, estado_grupo, causa_rechazo, fecha_despacho, fin_unidades(nombre), ven_ordenes(total, costo_envio)")
      .gte("periodo", desde)
      .lte("periodo", hasta)
      .order("item_id")
      .range(a, b) as unknown as PromiseLike<{ data: Fila[] | null; error: { message: string } | null }>,
  );
  if (r.error) return { error: SIN_MIGRACION_MONDAY };
  return (r.data ?? []).map((f) => ({
    periodo: f.periodo ? String(f.periodo).slice(0, 10) : null,
    unidadId: f.unidad_id,
    tienda: f.fin_unidades?.nombre ?? f.tienda_texto,
    courier: f.courier,
    estado: f.estado,
    estadoGrupo: esGrupoEstado(f.estado_grupo) ? f.estado_grupo : "sin_estado",
    causaTexto: f.causa_rechazo,
    causa: f.estado_grupo === "rechazado" && causas ? causaDeTexto(f.causa_rechazo, causas.catalogo, causas.aMano) : null,
    fechaDespacho: f.fecha_despacho,
    monto: Number(f.ven_ordenes?.total ?? 0) || 0,
    costoEnvio: Number(f.ven_ordenes?.costo_envio ?? 0) || 0,
  }));
}
