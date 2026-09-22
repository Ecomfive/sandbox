"use server";

import { getUsuarioIdSesion } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

/** El "estoy aquí" que manda `LatidoPresencia` cada tanto mientras la pestaña está visible. Sin sesión no
 * hace nada (no es un error: puede llegar justo cuando la sesión ya venció). */
export async function registrarActividad() {
  const id = await getUsuarioIdSesion();
  if (!id) return;
  await createServiceClient().from("perfiles").update({ ultima_actividad_en: new Date().toISOString() }).eq("id", id);
}
