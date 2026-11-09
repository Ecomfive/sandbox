// «Recalcular clientes»: lee las órdenes con el teléfono de quien compró, arma las llaves (identidad.ts) y las aplica con
// `cli_aplicar_identidades` por lotes; al final `cli_cerrar_recalculo` borra lo que ya no está y rehace los totales.
// Lo comparten la acción de /clientes-marketing y `scripts/finanzas/recalcular-clientes.ts`. Es idempotente: con las
// mismas órdenes deja lo mismo (los clientes conservan su id porque la llave no cambia).
// Los teléfonos y nombres solo pasan por la memoria del servidor: nunca se devuelven ni se escriben.

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { armarIdentidades, type OrdenIdentidad, type ResumenIdentidad } from "./identidad";

/** Filas por llamada a `cli_aplicar_identidades` (~150 bytes cada una). */
export const TAMANO_LOTE_CLIENTES = 4000;

type Embebido = { nombre: string | null; telefono: string | null } | { nombre: string | null; telefono: string | null }[] | null;

export async function leerOrdenesIdentidad(supabase: SupabaseClient): Promise<OrdenIdentidad[]> {
  const filas = await traerTodasLasFilas<{ id: string; ven_ordenes_clientes: Embebido }>((d, h) =>
    supabase.from("ven_ordenes").select("id, ven_ordenes_clientes(nombre, telefono)").order("id").range(d, h),
  );
  return filas.map((f) => {
    const c = Array.isArray(f.ven_ordenes_clientes) ? f.ven_ordenes_clientes[0] : f.ven_ordenes_clientes;
    return { orden_id: f.id, nombre: c?.nombre ?? null, telefono: c?.telefono ?? null };
  });
}

export interface ResultadoRecalculo {
  resumen: ResumenIdentidad;
  clientes: number;
  ordenesVinculadas: number;
}

export async function recalcularClientes(
  supabase: SupabaseClient,
  secreto: string,
  alAvanzar?: (hechas: number, total: number) => void,
): Promise<ResultadoRecalculo> {
  const ordenes = await leerOrdenesIdentidad(supabase);
  const { asignaciones, resumen } = armarIdentidades(ordenes, secreto);
  const recalculo = randomUUID();
  for (let i = 0; i < asignaciones.length; i += TAMANO_LOTE_CLIENTES) {
    const lote = asignaciones.slice(i, i + TAMANO_LOTE_CLIENTES);
    const { error } = await supabase.rpc("cli_aplicar_identidades", { p_recalculo: recalculo, p_filas: lote });
    if (error) throw new Error(`cli_aplicar_identidades: ${error.message}`);
    alAvanzar?.(Math.min(i + lote.length, asignaciones.length), asignaciones.length);
  }
  const { data, error } = await supabase.rpc("cli_cerrar_recalculo", { p_recalculo: recalculo });
  if (error) throw new Error(`cli_cerrar_recalculo: ${error.message}`);
  const fila = (Array.isArray(data) ? data[0] : data) as { clientes: number; ordenes: number } | null;
  return { resumen, clientes: Number(fila?.clientes ?? 0), ordenesVinculadas: Number(fila?.ordenes ?? 0) };
}
