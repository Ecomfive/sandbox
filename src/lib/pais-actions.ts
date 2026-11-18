"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { PAIS_COOKIE, PAISES_NAV } from "@/lib/nav-data";
import { getUsuarioActual, getUsuarioIdSesion } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { UN_ANO_SEGUNDOS, opcionesCookiePreferencia } from "@/lib/seguridad/opciones-cookie";

export async function setPaisActual(codigo: string) {
  // Solo países que existen y ya están abiertos (los «Pronto» no).
  if (!PAISES_NAV.some((p) => p.codigo === codigo && !p.pronto)) return;
  // Ni uno fuera de los países permitidos de la persona (migración 0087).
  const permitidos = (await getUsuarioActual())?.paisesPermitidos ?? null;
  if (permitidos !== null && !permitidos.includes(codigo)) return;

  const cookieStore = await cookies();
  // httpOnly, secure en producción y SameSite=Lax (auditoría de seguridad, 18 nov 2026): solo la lee el servidor.
  cookieStore.set(PAIS_COOKIE, codigo, opcionesCookiePreferencia(UN_ANO_SEGUNDOS));

  // Además se recuerda en la cuenta de la persona, para que otro navegador u otro equipo arranque en el mismo
  // país. Es un extra: si falla (o la migración 0038 aún no se corrió), la cookie ya bastó.
  try {
    const id = await getUsuarioIdSesion();
    if (id) await createServiceClient().from("perfiles").update({ pais_preferido: codigo }).eq("id", id);
  } catch {
    // sin más: la cookie manda
  }
  refresh();
}
