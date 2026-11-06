"use server";

import { requireModulo } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { cargarDia } from "@/lib/rendimiento/datos";
import type { Jornada } from "@/lib/rendimiento/jornada";

const ES_DIA = /^\d{4}-\d{2}-\d{2}$/;
const ES_ID = /^[0-9a-fA-F-]{8,64}$/;

/** La ficha de una persona en un día: se pide al desplegarla, para que la lista del equipo no cargue con el detalle de todos. Solo administradores, como la página. */
export async function cargarFicha(dia: unknown, persona: unknown): Promise<{ jornada: Jornada } | { error: string }> {
  const usuario = await requireModulo("rendimiento");
  if (!esAdministrador(usuario)) return { error: "No tienes acceso a esta ficha." };
  if (typeof dia !== "string" || !ES_DIA.test(dia) || typeof persona !== "string" || !ES_ID.test(persona)) return { error: "Ficha no válida." };
  const equipo = await cargarDia(dia, persona);
  const jornada = equipo?.[0]?.jornada;
  return jornada ? { jornada } : { error: "No se pudo cargar la ficha." };
}
