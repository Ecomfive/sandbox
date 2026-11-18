// Sacar del sistema a una cuenta suspendida o con clave nueva (auditoría de seguridad, 18 nov 2026). Antes, suspender solo marcaba
// `perfiles.activo`: el sistema ya no le abría páginas, pero su sesión y su token de renovación seguían valiendo (podía seguir renovando la
// sesión, mandar el latido de presencia o pedir la llave de la extensión). Solo servidor. NO es un archivo "use server": estas funciones no
// deben poder llamarse desde el navegador; las usan las acciones de Usuarios y roles y las de las cuentas del portal del proveedor.

import { createServiceClient } from "@/lib/supabase/server";
import { BLOQUEO_SUSPENDIDA, FUNCION_CERRAR_SESIONES, motivoFallaSesiones, type ResultadoSalida } from "./sesiones";

/** Borra todas las sesiones abiertas de la cuenta (y sus tokens de renovación): su próxima página o renovación ya no vale. */
export async function cerrarSesionesDe(usuarioId: string): Promise<{ error?: string }> {
  const { error } = await createServiceClient().rpc(FUNCION_CERRAR_SESIONES, { p_usuario: usuarioId });
  if (!error) return {};
  console.error("[sesiones] no se pudieron cerrar las sesiones", usuarioId, error);
  return { error: motivoFallaSesiones(error) };
}

/** Pone o quita el bloqueo de ingreso de Supabase Auth: bloqueada no entra con su clave ni renueva la sesión. */
export async function bloquearIngreso(usuarioId: string, bloquear: boolean): Promise<{ error?: string }> {
  const { error } = await createServiceClient().auth.admin.updateUserById(usuarioId, { ban_duration: bloquear ? BLOQUEO_SUSPENDIDA : "none" });
  if (!error) return {};
  console.error("[sesiones] no se pudo cambiar el bloqueo de ingreso", usuarioId, error);
  return { error: bloquear ? "no se pudo bloquear su ingreso" : "no se pudo quitar el bloqueo de ingreso" };
}

/**
 * Al suspender (la suspensión ya guardada): bloquea el ingreso y cierra lo que tenga abierto. Nunca lanza: lo que falle vuelve en `fallas`
 * para avisarle a quien suspendió, y la suspensión no se deshace.
 */
export async function sacarDelSistema(usuarioId: string): Promise<ResultadoSalida> {
  const fallas: string[] = [];
  // Primero el bloqueo y después las sesiones: así una renovación que llegue en medio no le abre una sesión nueva.
  const bloqueo = await bloquearIngreso(usuarioId, true).catch(() => ({ error: "no se pudo bloquear su ingreso" }));
  const sesiones = await cerrarSesionesDe(usuarioId).catch(() => ({ error: "la base no respondió" }));
  if (bloqueo.error) fallas.push(bloqueo.error);
  if (sesiones.error) fallas.push(`no se cerraron sus sesiones (${sesiones.error})`);
  return { bloqueada: !bloqueo.error, sesionesCerradas: !sesiones.error, fallas };
}
