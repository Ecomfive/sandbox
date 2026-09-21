"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { PAIS_COOKIE, PAISES_NAV } from "@/lib/nav-data";
import { getUsuarioIdSesion } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

export async function setPaisActual(codigo: string) {
  // Solo países que existen y ya están abiertos (los «Pronto» no).
  if (!PAISES_NAV.some((p) => p.codigo === codigo && !p.pronto)) return;

  const cookieStore = await cookies();
  cookieStore.set(PAIS_COOKIE, codigo, { path: "/", maxAge: 60 * 60 * 24 * 365 });

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
