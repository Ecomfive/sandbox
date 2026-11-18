// Genera los movimientos de las plantillas recurrentes (mejora 9, migración 0981). Lo llaman la tarea diaria del cierre
// y el botón «Generar ahora» de Libro › Recurrentes. Recibe el cliente de Supabase con la clave de servicio; los permisos
// los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { claveRecurrente, fechaDelMes, mesesPorGenerar, ORIGEN_RECURRENTE, type PlantillaRecurrente } from "./recurrentes";

export interface ResultadoRecurrentes {
  creados: number;
  /** Meses que no se generaron porque estaban cerrados. */
  cerrados: number;
  plantillas: number;
}

interface FilaPlantilla extends PlantillaRecurrente {
  unidad_id: string;
  tipo_id: string;
  descripcion: string;
  monto: number | string;
  cuenta_id: string | null;
  en_eerr: boolean;
  en_flujo: boolean;
}

/**
 * Crea en el libro los movimientos que les tocan a las plantillas activas hasta `hoy`. Un mes cerrado se salta (no se
 * vuelve a intentar); un movimiento que ya existía con su clave cuenta como hecho. Solo avanza `ultimo_periodo` de lo
 * que quedó resuelto, así un error de red se reintenta mañana.
 */
export async function generarRecurrentes(
  supabase: SupabaseClient,
  hoy: string,
  opciones: { soloIds?: string[]; usuarioId?: string | null } = {},
): Promise<{ error: string } | ResultadoRecurrentes> {
  let consulta = supabase
    .from("fin_recurrentes")
    .select("id, unidad_id, tipo_id, descripcion, monto, dia, cuenta_id, en_eerr, en_flujo, desde, hasta, ultimo_periodo, activo")
    .eq("activo", true);
  if (opciones.soloIds?.length) consulta = consulta.in("id", opciones.soloIds);
  const { data, error } = await consulta;
  if (error) return { error: /fin_recurrentes/.test(error.message) ? "falta correr la migración 0981." : error.message };
  const res: ResultadoRecurrentes = { creados: 0, cerrados: 0, plantillas: 0 };
  for (const raw of (data ?? []) as FilaPlantilla[]) {
    const p: FilaPlantilla = { ...raw, desde: String(raw.desde).slice(0, 10), hasta: raw.hasta ? String(raw.hasta).slice(0, 10) : null, ultimo_periodo: raw.ultimo_periodo ? String(raw.ultimo_periodo).slice(0, 10) : null };
    const meses = mesesPorGenerar(p, hoy);
    if (!meses.length) continue;
    res.plantillas++;
    let hecho: string | null = null;
    for (const mes of meses) {
      const { error: e } = await supabase.from("fin_movimientos").insert({
        periodo: mes,
        fecha_registro: hoy,
        fecha_pago: fechaDelMes(mes, p.dia),
        unidad_id: p.unidad_id,
        tipo_id: p.tipo_id,
        descripcion: p.descripcion,
        monto: Number(p.monto),
        cuenta_id: p.cuenta_id,
        en_eerr: p.en_eerr,
        en_flujo: p.en_flujo,
        origen: ORIGEN_RECURRENTE,
        origen_clave: claveRecurrente(p.id, mes),
        creado_por: opciones.usuarioId ?? null,
      });
      if (!e) res.creados++;
      else if (e.code === "FC001") res.cerrados++;
      else if (e.code !== "23505") break; // otro error: se reintenta mañana desde este mes
      hecho = mes;
    }
    if (hecho) await supabase.from("fin_recurrentes").update({ ultimo_periodo: hecho, actualizado_en: new Date().toISOString() }).eq("id", p.id);
  }
  return res;
}

export const textoRecurrentes = (r: ResultadoRecurrentes) =>
  r.creados || r.cerrados ? `Recurrentes: ${r.creados} movimientos creados${r.cerrados ? `, ${r.cerrados} meses cerrados saltados` : ""}.` : "Recurrentes: nada por generar.";
