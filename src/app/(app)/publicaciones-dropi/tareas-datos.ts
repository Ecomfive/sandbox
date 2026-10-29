import type { SupabaseClient } from "@supabase/supabase-js";
import { etiquetaRecomendacion } from "@/lib/publicaciones/recomendaciones";
import { tareasDe, type TareaVista } from "@/lib/publicaciones/tareas";

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
}

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
    responsableId: texto(f.responsable_id),
    responsableNombre: texto(f.responsable_nombre),
    plazo: texto(f.plazo),
    creadoPor: texto(f.creado_por),
    creadoEn: f.creado_en as string,
    hechaEn: texto(f.hecha_en),
    hechaPor: texto(f.hecha_por_nombre),
    hechaNota: texto(f.hecha_nota),
  };
}

/**
 * Las tareas de Gestión de IDs Dropi de un país (pestaña «Tareas»): las escritas a mano (0175) y las que nacieron de aceptar una recomendación (0128),
 * pendientes y las hechas en los últimos 30 días. Cada persona recibe solo las suyas; un administrador, con `todas`, las de todos. Sin las
 * migraciones, lo que haya.
 */
export async function cargarTareas(supabase: SupabaseClient, paisId: string, yo: string, todas: boolean): Promise<DatosTareas> {
  const desde = new Date(Date.now() - DIAS_HECHAS * 86_400_000).toISOString();
  const [manualesR, recsR] = await Promise.all([
    supabase
      .from("dropi_publicaciones_tareas")
      .select("id, publicacion_id, titulo, nota, responsable_id, responsable_nombre, plazo, creado_por, creado_en, hecha_en, hecha_por_nombre, hecha_nota, dropi_publicaciones!inner(pais_id)")
      .eq("dropi_publicaciones.pais_id", paisId)
      .or(`hecha_en.is.null,hecha_en.gte.${desde}`)
      .order("creado_en", { ascending: false })
      .limit(1000),
    supabase
      .from("dropi_publicaciones_decisiones")
      .select("id, publicacion_id, tipo, recomendacion, nota, usuario_id, creado_en, responsable_id, responsable_nombre, plazo, hecha_en, hecha_por_nombre, hecha_nota, dropi_publicaciones!inner(pais_id)")
      .eq("dropi_publicaciones.pais_id", paisId)
      .eq("decision", "aceptada")
      .or(`hecha_en.is.null,hecha_en.gte.${desde}`)
      .order("creado_en", { ascending: false })
      .limit(1000),
  ]);
  const manuales = manualesR.error ? [] : ((manualesR.data ?? []) as Fila[]).map(deFilaManual);
  const deRecomendaciones: TareaVista[] = recsR.error
    ? []
    : ((recsR.data ?? []) as Fila[]).map((f) => ({
        id: f.id as string,
        origen: "recomendacion" as const,
        publicacionId: f.publicacion_id as string,
        titulo: (f.recomendacion as { titulo?: string } | null)?.titulo || etiquetaRecomendacion(String(f.tipo ?? "")),
        nota: texto(f.nota),
        responsableId: texto(f.responsable_id),
        responsableNombre: texto(f.responsable_nombre),
        plazo: texto(f.plazo),
        creadoPor: texto(f.usuario_id),
        creadoEn: f.creado_en as string,
        hechaEn: texto(f.hecha_en),
        hechaPor: texto(f.hecha_por_nombre),
        hechaNota: texto(f.hecha_nota),
      }));
  const tareas = tareasDe([...manuales, ...deRecomendaciones], yo, todas);
  const ids = [...new Set(tareas.map((t) => t.publicacionId))];
  const publicaciones: Record<string, PublicacionDeTarea> = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("dropi_publicaciones").select("id, numero, nombre, foto_url, dropi_id").in("id", ids.slice(i, i + 200));
    for (const p of (data ?? []) as Fila[])
      publicaciones[p.id as string] = { id: p.id as string, numero: p.numero == null ? null : Number(p.numero), nombre: String(p.nombre ?? ""), fotoUrl: texto(p.foto_url), dropiId: texto(p.dropi_id) };
  }
  return { tareas, publicaciones, conTareasManuales: !manualesR.error };
}
