// Las tiendas que puede ver la persona con sesión (`perfiles.tiendas_permitidas`, migración 0937): las lee `getUsuarioActual`
// en la misma consulta del perfil (una vez por petición). Sin sesión no limita. Las reglas: `tiendas-permitidas.ts`.

import { cache } from "react";
import { getUsuarioActual } from "@/lib/auth";

export const cargarTiendasPermitidas = cache(async (): Promise<string[] | null> => {
  const usuario = await getUsuarioActual();
  if (!usuario) return null;
  return usuario.tiendasPermitidas;
});
