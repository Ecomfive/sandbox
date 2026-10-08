import { redirect } from "next/navigation";
import { getUsuarioActual, type UsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { glosarioPara, guiasPara } from "@/lib/ayuda/contenido";
import { cursosPara } from "@/lib/ayuda/cursos";
import type { EntradaIndice } from "@/lib/ayuda/indice";

/** Toda la Ayuda es para cualquiera con sesión; lo que muestra depende de sus módulos. */
export async function requireSesion(): Promise<UsuarioActual> {
  const usuario = await getUsuarioActual();
  if (!usuario) redirect("/login");
  return usuario;
}

/** Si la persona edita los manuales (puede modificar Usuarios y roles). */
export const puedeEditarManuales = (u: UsuarioActual) => u.modulos.includes("usuarios") && !u.modulosSoloLectura.includes("usuarios");

export interface ProgresoCurso {
  cursoId: string;
  puntaje: number;
  intentos: number;
  completadoEn: string | null;
}

/** El progreso de una persona en sus cursos. Sin la migración 0088, `null`. */
export async function cargarProgreso(usuarioId: string): Promise<Map<string, ProgresoCurso> | null> {
  const { data, error } = await createServiceClient().from("cursos_progreso").select("curso_id, puntaje, intentos, completado_en").eq("usuario_id", usuarioId);
  if (error) return null;
  return new Map((data ?? []).map((p) => [p.curso_id as string, { cursoId: p.curso_id, puntaje: p.puntaje, intentos: p.intentos, completadoEn: p.completado_en }]));
}

export interface Manual {
  id: string;
  titulo: string;
  contenido: string;
  modulos: string[];
  borrador: boolean;
  actualizadoPor: string | null;
  actualizadoEn: string;
}

/** Los manuales que puede ver una persona (los de sus módulos y los de todos). Sin la migración 0088, `null`. */
export async function cargarManuales(usuario: UsuarioActual): Promise<Manual[] | null> {
  const { data, error } = await createServiceClient().from("manuales_proceso").select("id, titulo, contenido, modulos, borrador, actualizado_por, actualizado_en").order("titulo");
  if (error) return null;
  return (data ?? [])
    .map((m) => ({
      id: m.id as string,
      titulo: m.titulo as string,
      contenido: m.contenido as string,
      modulos: (m.modulos ?? []) as string[],
      borrador: m.borrador as boolean,
      actualizadoPor: m.actualizado_por as string | null,
      actualizadoEn: m.actualizado_en as string,
    }))
    .filter((m) => puedeEditarManuales(usuario) || m.modulos.length === 0 || m.modulos.some((x) => usuario.modulos.includes(x)));
}

/**
 * Todo lo que se puede buscar en la ayuda para esa persona: términos, guías (y cada paso), cursos (y sus lecciones, sin el
 * examen) y manuales. Lo usa el buscador del Centro de ayuda y el del panel de la barra negra.
 */
export function construirIndice(usuario: UsuarioActual, manuales: Manual[] | null): EntradaIndice[] {
  const indice: EntradaIndice[] = [];
  for (const t of glosarioPara(usuario.modulos)) indice.push({ tipo: "termino", titulo: t.termino, texto: t.definicion, href: `/ayuda/glosario?q=${encodeURIComponent(t.termino)}` });
  for (const g of guiasPara(usuario.modulos)) {
    indice.push({ tipo: "guia", titulo: g.titulo, texto: g.resumen, href: `/ayuda/guias/${g.modulo}`, modulo: g.modulo });
    for (const [i, s] of g.secciones.entries()) indice.push({ tipo: "paso", titulo: `${g.titulo} › ${s.titulo}`, texto: s.pasos.join(" "), href: `/ayuda/guias/${g.modulo}#seccion-${i}`, modulo: g.modulo });
  }
  for (const c of cursosPara(usuario.modulos)) {
    indice.push({ tipo: "curso", titulo: c.titulo, texto: c.descripcion, href: `/ayuda/universidad/${c.id}`, modulo: c.modulo ?? undefined });
    for (const l of c.lecciones) indice.push({ tipo: "leccion", titulo: `${c.titulo} › ${l.titulo}`, texto: l.parrafos.join(" "), href: `/ayuda/universidad/${c.id}`, modulo: c.modulo ?? undefined });
  }
  for (const m of manuales ?? []) indice.push({ tipo: "manual", titulo: m.titulo, texto: m.contenido.replace(/[#*-]/g, " ").slice(0, 600), href: `/ayuda/manuales/${m.id}` });
  return indice;
}
