"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { VISTA_PREVIA_COOKIE, getUsuarioIdSesion, requireModuloEscritura } from "@/lib/auth";

/** Prende "Ver así": desde ahora y hasta que se apague, esta persona ve la app con los permisos
 * del rol elegido en vez de los suyos. Exige el acceso de escritura REAL a Usuarios y roles (se
 * comprueba antes de prender la cookie, así que no importa qué rol se esté por probar). */
export async function iniciarVistaPrevia(rolId: string) {
  await requireModuloEscritura("usuarios");
  (await cookies()).set(VISTA_PREVIA_COOKIE, rolId, { path: "/", maxAge: 60 * 60 * 8 });
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
