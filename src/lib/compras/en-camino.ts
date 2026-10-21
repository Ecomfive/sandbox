// Lo que viene en camino de un producto: las unidades de sus compras que ya salieron y todavía no llegan, sumadas por país.
// Es la misma regla de «En tránsito» de Compras (`enTransito`, `calculos-compras.ts`): la orden sigue abierta, tiene fecha de envío
// y no tiene fecha de llegada. Una orden anulada no cuenta. Sin base ni React, para poder probarlo.

/** Las etapas con que una orden ya está cerrada (las mismas de `ETAPAS_CERRADAS` en Compras). */
const ETAPAS_CERRADAS = ["completado", "descartado"];

export interface LineaEnCamino {
  pais: string | null;
  unidades: number;
  etapa: string;
  fechaEnvio: string | null;
  fechaLlegada: string | null;
  anulada: boolean;
}

export interface EnCaminoPais {
  pais: string;
  unidades: number;
  compras: number;
}

/** Una línea está en camino: orden abierta, ya salió y no ha llegado. */
export const lineaEnCamino = (l: LineaEnCamino): boolean => !l.anulada && !ETAPAS_CERRADAS.includes(l.etapa) && !!l.fechaEnvio && !l.fechaLlegada;

/** Las unidades en camino por país, el país con más unidades primero. Sin nada en camino, lista vacía. */
export function enCaminoPorPais(lineas: LineaEnCamino[]): EnCaminoPais[] {
  const porPais = new Map<string, EnCaminoPais>();
  for (const l of lineas) {
    if (!lineaEnCamino(l) || !(l.unidades > 0)) continue;
    const pais = l.pais ?? "—";
    const actual = porPais.get(pais) ?? { pais, unidades: 0, compras: 0 };
    actual.unidades += l.unidades;
    actual.compras += 1;
    porPais.set(pais, actual);
  }
  return [...porPais.values()].sort((a, b) => b.unidades - a.unidades || a.pais.localeCompare(b.pais, "es"));
}
