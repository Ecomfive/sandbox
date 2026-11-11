// Portal AF4 360° › el país de operación de la persona en el servidor (ver `pais-finanzas.ts`): el de la barra de arriba si
// tiene operación cargada y ella lo puede ver. Lo usan Inventario, Compras y costos, Reorden y Plan de compras.
import { createServiceClient } from "@/lib/supabase/server";
import { getPaisActual } from "@/lib/pais";
import { paisDeOperacion } from "./pais-finanzas";

/** El código del país que se ve (PA, CR, MX) o null si la persona no puede ver ninguno con operación. */
export async function paisDeOperacionActual(paisesPermitidos: string[] | null): Promise<string | null> {
  const barra = await getPaisActual(createServiceClient());
  return paisDeOperacion(barra.codigo, paisesPermitidos);
}
