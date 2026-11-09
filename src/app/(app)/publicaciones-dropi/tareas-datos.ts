import type { SupabaseClient } from "@supabase/supabase-js";
import { etiquetaRecomendacion } from "@/lib/publicaciones/recomendaciones";
import { esEstado, esPrioridad, tareasDe, type TareaVista, corteParaCerrar, conEstancadas } from "@/lib/publicaciones/tareas";

/** La publicación de una tarea, para mostrarla en la lista de tareas. */
export interface PublicacionDeTarea {
  id: string;
  numero: number | null;
  nombre: string;
  fotoUrl: string | null;
  dropiId: string | null;
}

export interface DatosTareas {
  tareas: TareaVista[];
  publicaciones: Record<string, PublicacionDeTarea>;
  /** false si falta la migración 0175 (solo se ven las tareas de las recomendaciones). */
  conTareasManuales: boolean;
  /** false si falta la migración 0178: sin estados intermedios, prioridad ni archivar. */
  conEstados: boolean;
}

/** Las columnas de una tarea escrita a mano; sin la 0178, sin estado, prioridad ni archivada. */
export const COLUMNAS_TAREA = "id, publicacion_id, titulo, nota, responsable_id, responsable_nombre, plazo, creado_por, creado_por_nombre, creado_en, hecha_en, hecha_por_nombre, hecha_nota";
export const COLUMNAS_0178 = "estado, prioridad, archivada_en";

const DIAS_HECHAS = 30;

type Fila = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** Una tarea escrita a mano (migración 0175). */
export function deFilaManual(f: Fila): TareaVista {
  return {
    id: f.id as string,
    origen: "manual",
    publicacionId: f.publicacion_id as string,
    titulo: String(f.titulo ?? ""),
    nota: texto(f.nota),
    // Sin la 0178 no hay estado: hecha si tiene `hecha_en`, si no por hacer.
    estado: esEstado(f.estado) ? f.estado : f.hecha_en ? "hecha" : "por_hacer",
    prioridad: esPrioridad(f.prioridad) ? f.prioridad : null,
    responsableId: texto(f.responsable_id),
    responsableNombre: texto(f.responsable_nombre),
    plazo: texto(f.plazo),
    creadoPor: texto(f.creado_por),
    creadoPorNombre: texto(f.creado_por_nombre),
    creadoEn: f.creado_en as string,
    hechaEn: texto(f.hecha_en),
    hechaPor: texto(f.hecha_por_nombre),
    hechaNota: texto(f.hecha_nota),
    archivadaEn: texto(f.archivada_en),
    otros: [],
  };
}

/**
 * Las tareas listas para mostrar (8 nov 2026): con las demás personas que las hacen (migración 0255; sin ella, solo la principal) y con «Estancada» en las
 * que llevan más de 3 días vencidas.
 */
export async function presentarTareas(supabase: SupabaseClient, tareas: TareaVista[]): Promise<TareaVista[]> {
  const manuales = tareas.filter((t) => t.origen === "manual").map((t) => t.id);
  const otros = new Map<string, { id: string; nombre: string }[]>();
  for (let i = 0; i < manuales.length; i += 200) {
    const { data, error } = await supabase.from("dropi_tareas_responsables").select("tarea_id, persona_id, persona_nombre, creado_en").in("tarea_id", manuales.slice(i, i + 200)).order("creado_en");
    if (error) break;
    for (const f of data ?? []) otros.set(f.tarea_id as string, [...(otros.get(f.tarea_id as string) ?? []), { id: f.persona_id as string, nombre: (f.persona_nombre as string | null) ?? "Sin nombre" }]);
  }
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  return conEstancadas(
    tareas.map((t) => ({ ...t, otros: (otros.get(t.id) ?? []).filter((o) => o.id !== t.responsableId) })),
    hoy,
  );
}

/**
 * Las tareas de Gestión de IDs Dropi de un país (pestaña «Tareas»): las escritas a mano (0175) y las que nacieron de aceptar una recomendación (0128),
 * pendientes y las hechas en los últimos 30 días. Cada persona recibe solo las suyas; un administrador, con `todas`, las de todos. Sin las
 * migraciones, lo que haya.
 */
export async function cargarTareas(supabase: SupabaseClient, paisId: string, yo: string, todas: boolean): Promise<DatosTareas> {
  const desde = new Date(Date.now() - DIAS_HECHAS * 86_400_000).toISOString();
  // Las hechas hace más de 30 días se archivan solas (8 nov 2026, pedido de Alcides). Sin la migración 0178 no hay dónde: no pasa nada.
  await supabase.from("dropi_publicaciones_tareas").update({ archivada_en: new Date().toISOString() }).eq("estado", "hecha").is("archivada_en", null).lt("hecha_en", corteParaCerrar(new Date()));
  // Con estados (0178), también las archivadas, para el botón «Archivadas»; sin ella, como antes.
  const leerManuales = (columnas: string) =>
    supabase
      .from("dropi_publicaciones_tareas")
      .select(`${columnas}, dropi_publicaciones!inner(pais_id)` as "*")
      .eq("dropi_publicaciones.pais_id", paisId)
      .or(columnas.includes("archivada_en") ? `hecha_en.is.null,hecha_en.gte.${desde},archivada_en.not.is.null` : `hecha_en.is.null,hecha_en.gte.${desde}`)
      .order("creado_en", { ascending: false })
      .limit(1000);
  const [manualesNuevasR, recsR] = await Promise.all([
    leerManuales(`${COLUMNAS_TAREA}, ${COLUMNAS_0178}`),
    supabase
      .from("dropi_publicaciones_decisiones")
      .select("id, publicacion_id, tipo, recomendacion, nota, usuario_id, usuario_nombre, creado_en, responsable_id, responsable_nombre, plazo, hecha_en, hecha_por_nombre, hecha_nota, dropi_publicaciones!inner(pais_id)")
      .eq("dropi_publicaciones.pais_id", paisId)
      .eq("decision", "aceptada")
      .or(`hecha_en.is.null,hecha_en.gte.${desde}`)
      .order("creado_en", { ascending: false })
      .limit(1000),
  ]);
  const conEstados = !manualesNuevasR.error;
  const manualesR = conEstados ? manualesNuevasR : await leerManuales(COLUMNAS_TAREA);
  const manuales = manualesR.error ? [] : ((manualesR.data ?? []) as Fila[]).map(deFilaManual);
  const deRecomendaciones: TareaVista[] = recsR.error
    ? []
    : ((recsR.data ?? []) as Fila[]).map((f) => ({
        id: f.id as string,
        origen: "recomendacion" as const,
        publicacionId: f.publicacion_id as string,
        titulo: (f.recomendacion as { titulo?: string } | null)?.titulo || etiquetaRecomendacion(String(f.tipo ?? "")),
        nota: texto(f.nota),
        estado: f.hecha_en ? ("hecha" as const) : ("por_hacer" as const),
        prioridad: null,
        responsableId: texto(f.responsable_id),
        responsableNombre: texto(f.responsable_nombre),
        plazo: texto(f.plazo),
        creadoPor: texto(f.usuario_id),
        creadoPorNombre: texto(f.usuario_nombre),
        creadoEn: f.creado_en as string,
        hechaEn: texto(f.hecha_en),
        hechaPor: texto(f.hecha_por_nombre),
        hechaNota: texto(f.hecha_nota),
        archivadaEn: null,
        otros: [],
      }));
  const tareas = tareasDe(await presentarTareas(supabase, [...manuales, ...deRecomendaciones]), yo, todas);
  const ids = [...new Set(tareas.map((t) => t.publicacionId))];
  const publicaciones: Record<string, PublicacionDeTarea> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("dropi_publicaciones").select("id, numero, nombre, foto_url, dropi_id").in("id", ids.slice(i, i + 200));
    for (const p of (data ?? []) as Fila[])
      publicaciones[p.id as string] = { id: p.id as string, numero: p.numero == null ? null : Number(p.numero), nombre: String(p.nombre ?? ""), fotoUrl: texto(p.foto_url), dropiId: texto(p.dropi_id) };
  }
  return { tareas, publicaciones, conTareasManuales: !manualesR.error, conEstados };
}
