// Lee `perfiles.tiendas_permitidas` (migración 0937) de la persona con sesión, una vez por petición (`cache`). Sin la
// migración, o sin sesión, no limita (como el resto de los permisos nuevos del portal). Las reglas: `tiendas-permitidas.ts`.

import { cache } from "react";
import { esFaltaDeMigracion, getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { leerTiendasPermitidas } from "./tiendas-permitidas";

export const cargarTiendasPermitidas = cache(async (): Promise<string[] | null> => {
  const usuario = await getUsuarioActual();
  if (!usuario) return null;
  const { data, error } = await createServiceClient().from("perfiles").select("tiendas_permitidas").eq("id", usuario.id).maybeSingle();
  // Sin la migración no limita; con cualquier otro error no se abre a todas las tiendas (auditoría de seguridad, 18 nov 2026).
  if (error) {
    if (esFaltaDeMigracion(error)) return null;
    throw new Error("No se pudieron leer las tiendas de la persona.");
  }
  if (!data) return [];
  return leerTiendasPermitidas((data as { tiendas_permitidas?: unknown }).tiendas_permitidas);
});
