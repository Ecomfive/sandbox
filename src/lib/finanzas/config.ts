// Ajustes de Finanzas (`fin_config`, migración 0917): interruptores que cambian qué entra al libro y al EERR. Los
// cambia Estado de resultados › Ajustes; los leen la vista `fin_eerr_mensual` (depreciación) y la conciliación de
// nómina (nómina al libro). Prueba en `config.test.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { dinero } from "@/lib/af4/formato";

export const AJUSTES = ["depreciacion_en_eerr", "nomina_al_libro"] as const;
export type ClaveAjuste = (typeof AJUSTES)[number];

export const esClaveAjuste = (v: unknown): v is ClaveAjuste => typeof v === "string" && (AJUSTES as readonly string[]).includes(v);

export const NOMBRE_AJUSTE: Record<ClaveAjuste, string> = {
  depreciacion_en_eerr: "Depreciación en el estado de resultados",
  nomina_al_libro: "Nómina al libro de movimientos",
};

/** Un valor de `fin_config` como interruptor: solo `true` (jsonb) lo enciende. */
export const encendido = (valor: unknown): boolean => valor === true || valor === "true";

export interface EstadoAjuste {
  activo: boolean;
  actualizadoEn: string | null;
  actualizadoPor: string | null;
}

export const SIN_MIGRACION_AJUSTES = "Falta correr la migración 0917 (ajustes de Finanzas) en Supabase.";

/** Los dos interruptores, apagados si no hay fila. Error si la tabla no existe (migración 0917 sin correr). */
export async function cargarAjustes(supabase: SupabaseClient): Promise<{ error: string } | Record<ClaveAjuste, EstadoAjuste>> {
  const { data, error } = await supabase.from("fin_config").select("clave, valor, actualizado_en, actualizado_por").in("clave", [...AJUSTES]);
  if (error) return { error: SIN_MIGRACION_AJUSTES };
  const out = Object.fromEntries(AJUSTES.map((c) => [c, { activo: false, actualizadoEn: null, actualizadoPor: null }])) as Record<ClaveAjuste, EstadoAjuste>;
  for (const f of data ?? []) {
    if (!esClaveAjuste(f.clave)) continue;
    out[f.clave] = { activo: encendido(f.valor), actualizadoEn: f.actualizado_en ?? null, actualizadoPor: f.actualizado_por ?? null };
  }
  return out;
}

const usd = (v: number) => dinero(v);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export interface ImpactoDepreciacion {
  anio: number;
  /** Meses del año que cubre el libro. */
  meses: number;
  /** Depreciación de esos meses. */
  depreciacion: number;
  /** Altas de bienes de uso del año que hoy están en el EERR. */
  altas: number;
  /** La parte de esas altas cargada en secciones del EBITDA (costo de ventas, administración, marketing). */
  altasEbitda: number;
  altasMovimientos: number;
}

/** Lo que pasa al encender y al apagar la depreciación en el EERR (el texto de la confirmación). */
export function efectosDepreciacion(i: ImpactoDepreciacion): { alEncender: string; alApagar: string } {
  const periodo = `${i.anio} (${plural(i.meses, "mes", "meses")})`;
  const cambio = (v: number) => (Math.abs(v) < 0.5 ? "no cambia" : `${v > 0 ? "sube" : "baja"} ${usd(Math.abs(v))}`);
  const neto = i.altas - i.depreciacion;
  if (!i.altasMovimientos) {
    return {
      alEncender: `Entra la depreciación de los bienes de uso: el resultado neto de ${periodo} baja ${usd(i.depreciacion)}; el EBITDA no cambia. Utilidades y Presupuesto usan el mismo resultado.`,
      alApagar: `Sale la depreciación: el resultado neto de ${periodo} sube ${usd(i.depreciacion)}; el EBITDA no cambia.`,
    };
  }
  return {
    alEncender:
      `Entra la depreciación (${usd(i.depreciacion)}) y salen del EERR ${plural(i.altasMovimientos, "alta", "altas")} de bienes de uso ` +
      `(${usd(i.altas)}), para no contar dos veces el mismo bien. En ${periodo} el EBITDA ${cambio(i.altasEbitda)} y el resultado neto ` +
      `${cambio(neto)}. Utilidades y Presupuesto usan el mismo resultado.`,
    alApagar: `Sale la depreciación y vuelven las altas de bienes de uso: en ${periodo} el EBITDA ${cambio(-i.altasEbitda)} y el resultado neto ${cambio(-neto)}.`,
  };
}

/** Lo que pasa al encender y al apagar la nómina al libro. `mesesPasados`: meses que ya tienen sueldos de la nómina. */
export function efectosNomina(mesesPasados: number): { alEncender: string; alApagar: string } {
  return {
    alEncender: "Nómina › Conciliación con el libro ofrece pasar la nómina de cada mes al libro. Nada cambia hasta pasar un mes.",
    alApagar: mesesPasados
      ? `Deja de ofrecerse pasar la nómina al libro. ${plural(mesesPasados, "mes ya pasado sigue", "meses ya pasados siguen")} en el libro; se devuelven a los sueldos del Excel desde la conciliación de cada mes.`
      : "Deja de ofrecerse pasar la nómina al libro.",
  };
}

/** Un solo interruptor; apagado si la tabla no existe. */
export async function ajusteActivo(supabase: SupabaseClient, clave: ClaveAjuste): Promise<boolean> {
  const { data, error } = await supabase.from("fin_config").select("valor").eq("clave", clave).maybeSingle();
  return !error && encendido(data?.valor);
}
