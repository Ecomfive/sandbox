// Anuncios Meta: lee, una tras otra, las cuentas publicitarias activas (o las elegidas) con el tiempo repartido entre ellas. La usan el cron y el botón «Leer ahora».

import type { SupabaseClient } from "@supabase/supabase-js";
import { sincronizarCuenta, type ResumenLectura } from "./sincronizar";

const PRESUPUESTO_MS = 240_000;

export async function leerCuentasMeta(supabase: SupabaseClient, opciones: { cuentaIds?: string[]; presupuestoMs?: number } = {}): Promise<{ lecturas: ResumenLectura[]; sinCuentas: boolean }> {
  let consulta = supabase.from("meta_cuentas").select("id, nombre, act_id, ultima_lectura_en").eq("activa", true).order("ultima_lectura_en", { ascending: true, nullsFirst: true });
  if (opciones.cuentaIds?.length) consulta = consulta.in("id", opciones.cuentaIds);
  const { data, error } = await consulta;
  if (error) throw new Error(/meta_cuentas|schema cache|does not exist/i.test(error.message) ? "Falta correr la migración 0320 (Anuncios Meta) en Supabase." : error.message);
  const cuentas = (data ?? []) as { id: string; nombre: string; act_id: string; ultima_lectura_en: string | null }[];
  const total = opciones.presupuestoMs ?? PRESUPUESTO_MS;
  const inicio = Date.now();
  const lecturas: ResumenLectura[] = [];
  for (let i = 0; i < cuentas.length; i++) {
    const quedan = cuentas.length - i;
    const resto = total - (Date.now() - inicio);
    if (resto < 15_000) break;
    lecturas.push(await sincronizarCuenta(supabase, cuentas[i], { limiteMs: Math.floor(resto / quedan) }));
  }
  return { lecturas, sinCuentas: cuentas.length === 0 };
}
