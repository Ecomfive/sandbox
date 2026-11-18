"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { getPaisActual } from "@/lib/pais";
import { PLATAFORMA_COOKIE, PLATAFORMAS, plataformaDisponible } from "@/lib/plataformas";
import { createServiceClient } from "@/lib/supabase/server";
import { UN_ANO_SEGUNDOS, opcionesCookiePreferencia } from "@/lib/seguridad/opciones-cookie";

/**
 * Elige la plataforma (Dropi o Drop) para todo el sistema, como el país. Solo las que existen en el país elegido: Drop es solo de Costa Rica (3 nov 2026), así que con otro país no se puede
 * elegir (ni se ofrece).
 */
export async function setPlataformaActual(id: string) {
  if (!PLATAFORMAS.some((p) => p.id === id)) return;
  const pais = await getPaisActual(createServiceClient());
  if (!plataformaDisponible(id as (typeof PLATAFORMAS)[number]["id"], pais.codigo)) return;
  // httpOnly, secure en producción y SameSite=Lax (auditoría de seguridad, 18 nov 2026): solo la lee el servidor.
  (await cookies()).set(PLATAFORMA_COOKIE, id, opcionesCookiePreferencia(UN_ANO_SEGUNDOS));
  refresh();
}
