import { redirect } from "next/navigation";
import { getUsuarioActual, type UsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

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
