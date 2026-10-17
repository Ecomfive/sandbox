import { CURSOS } from "@/lib/ayuda/cursos";
import { createServiceClient } from "@/lib/supabase/server";
import { avanceOnboarding, estadoDe, type Enlace, type EstadoEnlace, type Hechos } from "./onboarding";
import type { Ocupante } from "./organigrama";
import { leerEtapa, type Etapa } from "./puesto";

// Equipo › Puestos: lo que leen la lista, el organigrama, «Mi puesto» y la ficha de una persona en Usuarios y roles.
// Todo con la clave de servicio; quién puede ver qué lo decide cada página antes de llamar.

export interface Persona {
  id: string;
  nombre: string;
  email: string;
  avatarUrl: string | null;
}

export interface EnlacePuesto {
  tipo: "curso" | "manual";
  id: string;
  titulo: string;
  etapa: Etapa | null;
  orden: number;
}

export interface OcupantePuesto extends Persona {
  principal: boolean;
  desde: string;
  avance: { hechos: number; total: number };
}

export interface FilaPuesto {
  id: string;
  nombre: string;
  area: string;
  reportaA: string | null;
  reportaANombre: string;
  plazas: number;
  mision: string;
  responsabilidades: string;
  autoridad: string;
  kra: string[];
  activo: boolean;
  ocupantes: OcupantePuesto[];
  enlaces: EnlacePuesto[];
}

export interface DatosPuestos {
  puestos: FilaPuesto[];
  ocupantes: Ocupante[];
  personas: Persona[];
  manuales: { id: string; titulo: string; actualizadoEn: string }[];
  cursos: { id: string; titulo: string }[];
}

const CURSOS_EXISTENTES = new Set(CURSOS.map((c) => c.id));
const TITULO_CURSO = new Map(CURSOS.map((c) => [c.id, c.titulo]));

/** Lee todo lo de Puestos. Sin la migración 0112 devuelve `null` (la página lo avisa). */
export async function cargarPuestos(): Promise<DatosPuestos | null> {
  const supabase = createServiceClient();
  const [puestos, ocupantes, manualesPuesto, cursosPuesto, perfiles, manuales] = await Promise.all([
    supabase.from("puestos").select("id, nombre, area, reporta_a, plazas, mision, responsabilidades, autoridad, kra, activo").order("nombre"),
    supabase.from("puesto_personas").select("puesto_id, usuario_id, principal, desde"),
    supabase.from("puesto_manuales").select("puesto_id, manual_id, etapa, orden"),
    supabase.from("puesto_cursos").select("puesto_id, curso_id, etapa, orden"),
    supabase.from("perfiles").select("id, nombre, email, avatar_url, activo").order("nombre"),
    supabase.from("manuales_proceso").select("id, titulo, actualizado_en").order("titulo"),
  ]);
  if (puestos.error || ocupantes.error || manualesPuesto.error || cursosPuesto.error) return null;

  const personas: Persona[] = (perfiles.data ?? []).map((p) => ({ id: p.id as string, nombre: (p.nombre as string | null) || (p.email as string), email: p.email as string, avatarUrl: p.avatar_url as string | null }));
  const activos = new Set((perfiles.data ?? []).filter((p) => p.activo !== false).map((p) => p.id as string));
  const porPersona = new Map(personas.map((p) => [p.id, p]));
  const listaManuales = (manuales.data ?? []).map((m) => ({ id: m.id as string, titulo: m.titulo as string, actualizadoEn: m.actualizado_en as string }));
  const tituloManual = new Map(listaManuales.map((m) => [m.id, m.titulo]));

  const filasOcupantes = (ocupantes.data ?? []).filter((o) => porPersona.has(o.usuario_id as string));
  const usuarios = [...new Set(filasOcupantes.map((o) => o.usuario_id as string))];
  const hechosDe = await cargarHechos(usuarios, listaManuales);

  const enlacesDe = new Map<string, EnlacePuesto[]>();
  const sumar = (puestoId: string, e: EnlacePuesto) => enlacesDe.set(puestoId, [...(enlacesDe.get(puestoId) ?? []), e]);
  for (const m of manualesPuesto.data ?? []) {
    const titulo = tituloManual.get(m.manual_id as string);
    if (titulo) sumar(m.puesto_id as string, { tipo: "manual", id: m.manual_id as string, titulo, etapa: leerEtapa(m.etapa), orden: Number(m.orden) });
  }
  for (const c of cursosPuesto.data ?? []) {
    const titulo = TITULO_CURSO.get(c.curso_id as string);
    if (titulo) sumar(c.puesto_id as string, { tipo: "curso", id: c.curso_id as string, titulo, etapa: leerEtapa(c.etapa), orden: Number(c.orden) });
  }

  const nombreDe = new Map((puestos.data ?? []).map((p) => [p.id as string, p.nombre as string]));
  const filas: FilaPuesto[] = (puestos.data ?? []).map((p) => {
    const enlaces = (enlacesDe.get(p.id as string) ?? []).sort(ordenEnlaces);
    return {
      id: p.id as string,
      nombre: p.nombre as string,
      area: p.area as string,
      reportaA: (p.reporta_a as string | null) ?? null,
      reportaANombre: (p.reporta_a && nombreDe.get(p.reporta_a as string)) || "",
      plazas: Number(p.plazas),
      mision: (p.mision as string) ?? "",
      responsabilidades: (p.responsabilidades as string) ?? "",
      autoridad: (p.autoridad as string) ?? "",
      kra: (p.kra as string[] | null) ?? [],
      activo: p.activo !== false,
      enlaces,
      ocupantes: filasOcupantes
        .filter((o) => o.puesto_id === p.id)
        .map((o) => {
          const persona = porPersona.get(o.usuario_id as string)!;
          const { hechos, total } = avanceOnboarding(enlaces, hechosDe(persona.id));
          return { ...persona, principal: o.principal === true, desde: String(o.desde), avance: { hechos, total } };
        })
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    };
  });

  return {
    puestos: filas,
    ocupantes: filasOcupantes.map((o) => ({ puestoId: o.puesto_id as string, usuarioId: o.usuario_id as string, principal: o.principal === true })),
    personas: personas.filter((p) => activos.has(p.id)),
    manuales: listaManuales,
    cursos: CURSOS.map((c) => ({ id: c.id, titulo: c.titulo })),
  };
}

/** Onboarding primero (Día 30, 60, 90) y lo de consulta al final; dentro, por orden y título. */
export function ordenEnlaces(a: EnlacePuesto, b: EnlacePuesto): number {
  return (a.etapa ?? 999) - (b.etapa ?? 999) || a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es");
}

/** Cursos aprobados y manuales leídos de estas personas; devuelve los «hechos» de cada una para calcular su avance. */
export async function cargarHechos(usuarios: string[], manuales: { id: string; actualizadoEn: string }[]): Promise<(usuarioId: string) => Hechos> {
  const supabase = createServiceClient();
  const [progreso, lecturas] = usuarios.length
    ? await Promise.all([
        supabase.from("cursos_progreso").select("usuario_id, curso_id, completado_en").in("usuario_id", usuarios).not("completado_en", "is", null),
        supabase.from("manuales_lecturas").select("usuario_id, manual_id, leido_en").in("usuario_id", usuarios),
      ])
    : [{ data: [] }, { data: [] }];
  const manualActualizado = new Map(manuales.map((m) => [m.id, m.actualizadoEn]));
  return (usuarioId) => ({
    cursosAprobados: new Map((progreso.data ?? []).filter((r) => r.usuario_id === usuarioId).map((r) => [r.curso_id as string, r.completado_en as string])),
    lecturas: new Map((lecturas.data ?? []).filter((r) => r.usuario_id === usuarioId).map((r) => [r.manual_id as string, r.leido_en as string])),
    manualActualizado,
    cursosExistentes: CURSOS_EXISTENTES,
  });
}

/** El estado de cada enlace para una persona (para «Mi puesto»). */
export function estadosDe(enlaces: EnlacePuesto[], hechos: Hechos): Map<string, EstadoEnlace> {
  return new Map(enlaces.map((e) => [`${e.tipo}:${e.id}`, estadoDe(e as Enlace, hechos)]));
}

/** Los manuales enlazados a algún puesto de esta persona: los puede abrir aunque no sean de sus módulos. */
export async function manualesDeMisPuestos(usuarioId: string): Promise<Set<string>> {
  const supabase = createServiceClient();
  const { data: mios, error } = await supabase.from("puesto_personas").select("puesto_id").eq("usuario_id", usuarioId);
  if (error || !mios?.length) return new Set();
  const { data } = await supabase.from("puesto_manuales").select("manual_id").in("puesto_id", mios.map((m) => m.puesto_id as string));
  return new Set((data ?? []).map((m) => m.manual_id as string));
}
