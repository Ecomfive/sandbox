"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { VISTA_PREVIA_COOKIE, getUsuarioIdSesion, requireModuloEscritura } from "@/lib/auth";
import { OPCIONES_COOKIE_SESION } from "@/lib/supabase/cookies";

/** Prende "Ver así": desde ahora y hasta que se apague, esta persona ve la app con los permisos
 * del rol elegido en vez de los suyos. Exige el acceso de escritura REAL a Usuarios y roles (se
 * comprueba antes de prender la cookie, así que no importa qué rol se esté por probar). */
export async function iniciarVistaPrevia(rolId: string) {
  const usuario = await requireModuloEscritura("usuarios");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(rolId))) return;
  // Ligada a quien la prende (`<usuario>:<rol>`) y fuera del alcance de JavaScript, como la sesión.
  (await cookies()).set(VISTA_PREVIA_COOKIE, `${usuario.id}:${rolId}`, { ...OPCIONES_COOKIE_SESION, maxAge: 60 * 60 * 8 });
  refresh();
}

/** "Ver así" como una persona: la app como la ve ella, con el rol que tiene y lo propio que se le dio o quitó (migración 0116). */
export async function iniciarVistaPreviaPersona(personaId: string) {
  const usuario = await requireModuloEscritura("usuarios");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(personaId))) return;
  (await cookies()).set(VISTA_PREVIA_COOKIE, `${usuario.id}:p-${personaId}`, { ...OPCIONES_COOKIE_SESION, maxAge: 60 * 60 * 8 });
  refresh();
}

/** Apaga "Ver así". Sin exigir el módulo Usuarios: mientras se prueba un rol que no lo tiene, esto
 * seguiría siendo la única forma de volver a lo de siempre, así que solo hace falta tener sesión. */
export async function salirVistaPrevia() {
  const id = await getUsuarioIdSesion();
  if (!id) return;
  (await cookies()).delete(VISTA_PREVIA_COOKIE);
  refresh();
}
