// El teléfono normalizado de cada cliente (`ven_ordenes_clientes.telefono_clave`), con la misma regla del portal de Finanzas (`normalizarTelefono`): con él
// se juntan los pedidos de un mismo cliente («Pedidos» y «Riesgo» en la lista de Pedidos y «Pedidos anteriores» en la ficha). Las órdenes del Excel ya lo
// traen; las que llegan de Shopify lo reciben aquí al guardarse (12 nov 2026). Es un dato derivado del teléfono que ya está guardado: no cambia nada más.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizarTelefono, type PaisOp } from "@/lib/ventas/operacion";

const PAISES: PaisOp[] = ["PA", "CR", "MX"];

interface Fila {
  orden_id: string;
  telefono: string | null;
  telefono_clave: string | null;
  ven_ordenes: { fin_unidades: { pais: string | null } | { pais: string | null }[] | null } | { fin_unidades: { pais: string | null } | { pais: string | null }[] | null }[] | null;
}

async function completar(supabase: SupabaseClient, filas: Fila[]): Promise<number> {
  const cambios: { orden_id: string; telefono_clave: string }[] = [];
  for (const f of filas) {
    if (f.telefono_clave || !f.telefono) continue;
    const o = Array.isArray(f.ven_ordenes) ? f.ven_ordenes[0] : f.ven_ordenes;
    const u = o ? (Array.isArray(o.fin_unidades) ? o.fin_unidades[0] : o.fin_unidades) : null;
    const pais = PAISES.includes(u?.pais as PaisOp) ? (u!.pais as PaisOp) : "PA";
    const n = normalizarTelefono(pais, f.telefono);
    if (n.valido && n.clave) cambios.push({ orden_id: f.orden_id, telefono_clave: n.clave });
  }
  // En bloques de 500: un «upsert» por la llave (`orden_id`, que ya existe) solo cambia `telefono_clave` y deja lo demás igual.
  for (let i = 0; i < cambios.length; i += 500) {
    const { error } = await supabase.from("ven_ordenes_clientes").upsert(cambios.slice(i, i + 500), { onConflict: "orden_id" });
    if (error) throw new Error(`ven_ordenes_clientes: ${error.message}`);
  }
  return cambios.length;
}

const COLUMNAS = "orden_id, telefono, telefono_clave, ven_ordenes!inner(fin_unidades(pais))";

/** Para las órdenes recién guardadas (por su `origen_clave`). Nunca lanza: si falla, la próxima revisión lo completa. */
export async function completarTelefonosDeOrdenes(supabase: SupabaseClient, origenClaves: string[]): Promise<void> {
  try {
    for (let i = 0; i < origenClaves.length; i += 100) {
      const { data } = await supabase.from("ven_ordenes_clientes").select(COLUMNAS).in("ven_ordenes.origen_clave", origenClaves.slice(i, i + 100)).is("telefono_clave", null);
      await completar(supabase, (data ?? []) as unknown as Fila[]);
    }
  } catch {
    // Se completa en la próxima revisión de la tienda.
  }
}

/** Para todas las órdenes de una tienda (su unidad de Finanzas) que llegaron de Shopify sin la clave: lo que había antes de esto. Devuelve cuántas se completaron. */
export async function completarTelefonosDeTienda(supabase: SupabaseClient, unidadId: string): Promise<number> {
  let total = 0;
  // Como mucho 5 000 por revisión (que la revisión no se alargue): lo que falte sigue en la próxima.
  for (let vuelta = 0; vuelta < 10; vuelta++) {
    const { data, error } = await supabase
      .from("ven_ordenes_clientes")
      .select(COLUMNAS.replace("ven_ordenes!inner(", "ven_ordenes!inner(unidad_id, origen, "))
      .eq("ven_ordenes.unidad_id", unidadId)
      .is("telefono_clave", null)
      .not("telefono", "is", null)
      .limit(500);
    if (error || !data?.length) break;
    const hechas = await completar(supabase, data as unknown as Fila[]).catch(() => 0);
    total += hechas;
    if (hechas === 0 || data.length < 500) break;
  }
  return total;
}
