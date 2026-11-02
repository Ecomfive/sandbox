import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import type { EstadoTarea, PrioridadTarea } from "@/lib/tareas/tareas";

/** Una tarea del equipo como la ve la pantalla. */
export interface TareaVista {
  id: string;
  numero: number;
  titulo: string;
  descripcion: string | null;
  estado: EstadoTarea;
  prioridad: PrioridadTarea | null;
  responsableId: string | null;
  responsableNombre: string | null;
  fechaInicio: string | null;
  fechaLimite: string | null;
  modulo: string | null;
  creadoPor: string | null;
  creadoPorNombre: string | null;
  creadoEn: string;
}

export interface PersonaTarea {
  id: string;
  nombre: string;
}

export const COLUMNAS_TAREA = "id, numero, titulo, descripcion, estado, prioridad, responsable_id, fecha_inicio, fecha_limite, modulo, creado_por, creado_por_nombre, creado_en";

type Fila = Record<string, unknown>;

export function aVista(f: Fila, nombres: Map<string, string>): TareaVista {
  const responsableId = (f.responsable_id as string | null) ?? null;
  return {
    id: String(f.id),
    numero: Number(f.numero),
    titulo: String(f.titulo),
    descripcion: (f.descripcion as string | null) ?? null,
    estado: f.estado as EstadoTarea,
    prioridad: (f.prioridad as PrioridadTarea | null) ?? null,
    responsableId,
    responsableNombre: responsableId ? (nombres.get(responsableId) ?? null) : null,
    fechaInicio: (f.fecha_inicio as string | null) ?? null,
    fechaLimite: (f.fecha_limite as string | null) ?? null,
    modulo: (f.modulo as string | null) ?? null,
    creadoPor: (f.creado_por as string | null) ?? null,
    creadoPorNombre: (f.creado_por_nombre as string | null) ?? null,
    creadoEn: String(f.creado_en),
  };
}

/** Las personas activas, para asignar (nombre, o el correo si no tiene). */
export async function cargarPersonas(supabase: SupabaseClient): Promise<PersonaTarea[]> {
  const { data } = await supabase.from("perfiles").select("id, nombre, email").eq("activo", true).order("nombre");
  return (data ?? []).map((p) => ({ id: String(p.id), nombre: String(p.nombre || p.email || "Sin nombre") }));
}

/**
 * Las tareas que ve la persona: un administrador, todas; los demás, las asignadas a ella o que ella creó. `falta` si no está la migración 0215.
 */
export async function cargarTareas(supabase: SupabaseClient, usuario: UsuarioActual): Promise<{ tareas: TareaVista[]; personas: PersonaTarea[]; falta: boolean }> {
  const admin = esAdministrador(usuario);
  const personasP = cargarPersonas(supabase);
  let falta = false;
  const filas = await traerTodasLasFilas<Fila>((d, h) => {
    const q = supabase.from("tareas_equipo").select(COLUMNAS_TAREA).order("numero", { ascending: false }).range(d, h);
    return admin ? q : q.or(`responsable_id.eq.${usuario.id},creado_por.eq.${usuario.id}`);
  }).catch(() => {
    falta = true;
    return [] as Fila[];
  });
  const personas = await personasP;
  const nombres = new Map(personas.map((p) => [p.id, p.nombre]));
  return { tareas: filas.map((f) => aVista(f, nombres)), personas, falta };
}
