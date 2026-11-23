"use server";

import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPanelLlegadas } from "./datos";

/**
 * Cuántas compras en bodega esperan el pago (el globo de la pestaña «Llegadas» de Compras, 23 nov 2026). null si la persona no tiene Compras o la consulta falla. Cuenta lo mismo que
 * la pestaña: solo lo que esa persona puede ver.
 */
export async function contarLlegadasEnBodega(): Promise<number | null> {
  const usuario = await getUsuarioActual();
  if (!usuario?.modulos.includes("compras")) return null;
  try {
    const panel = await cargarPanelLlegadas(createServiceClient(), usuario);
    return panel.bodega.reduce((t, g) => t + g.filas.length, 0);
  } catch {
    return null;
  }
}
