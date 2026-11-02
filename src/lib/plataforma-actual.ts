import { cookies } from "next/headers";
import { PLATAFORMA_COOKIE, plataformaDisponible, plataformaValida, type PlataformaId } from "@/lib/plataformas";

/**
 * La plataforma elegida arriba a la derecha (Dropi o Drop) para un país. Dropi mientras no se haya elegido otra; y **si la elegida no existe en ese país, Dropi**: Drop es solo de Costa
 * Rica (3 nov 2026), así que con otro país no hay nada que elegir y el sistema vuelve a Dropi sin avisar.
 */
export async function getPlataformaActual(codigoPais: string): Promise<PlataformaId> {
  const elegida = plataformaValida((await cookies()).get(PLATAFORMA_COOKIE)?.value);
  return plataformaDisponible(elegida, codigoPais) ? elegida : plataformaValida(undefined);
}
