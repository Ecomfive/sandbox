// Cuánto pasa una orden de compra en cada etapa (pedido de Alcides, 19 oct 2026), a partir del historial de etapa
// (`wms_compra_eventos`, campo «etapa»). Para cada etapa: lo que tardaron las compras que **ya salieron** de ella (mediana,
// promedio, 9 de cada 10 y máximo) y las que están **ahora** en ella, con cuántos días llevan. Lógica pura, con prueba.

export interface EventoEtapa {
  compraId: string;
  campo: string;
  valor: string | null;
  ocurridoEn: string;
}
export interface CompraEtapa {
  id: string;
  etapa: string;
}

const DIA = 86_400_000;
const dias = (desde: string, hasta: string) => Math.max(0, Math.round((Date.parse(hasta.slice(0, 10)) - Date.parse(desde.slice(0, 10))) / DIA));

export interface Resumen {
  n: number;
  mediana: number | null;
  promedio: number | null;
  p90: number | null;
  max: number | null;
}
export function resumir(v: number[]): Resumen {
  const o = [...v].sort((a, b) => a - b);
  if (!o.length) return { n: 0, mediana: null, promedio: null, p90: null, max: null };
  const m = Math.floor(o.length / 2);
  return {
    n: o.length,
    mediana: o.length % 2 ? o[m] : Math.round((o[m - 1] + o[m]) / 2),
    promedio: Math.round(o.reduce((s, x) => s + x, 0) / o.length),
    p90: o[Math.min(o.length - 1, Math.ceil(o.length * 0.9) - 1)],
    max: o[o.length - 1],
  };
}

export interface TiempoEtapa<C> {
  etapa: string;
  /** Las veces que una compra pasó por la etapa y salió de ella. */
  pasadas: Resumen;
  /** Las compras que están ahora en la etapa y desde cuándo (días), de la que más lleva a la que menos. */
  ahora: { compra: C; dias: number }[];
}

/**
 * El tiempo en cada etapa de `etapas` (en ese orden). Una estancia termina cuando la compra pasa a otra etapa; la estancia
 * abierta (la etapa en que está hoy) no cuenta en `pasadas`, se cuenta en `ahora` hasta `hoy`. Volver a una etapa ya visitada
 * es otra estancia. Una compra sin evento de su etapa actual no aparece en `ahora` (no se sabe desde cuándo está).
 */
export function tiempoPorEtapa<C extends CompraEtapa>(eventos: EventoEtapa[], compras: C[], etapas: readonly string[], hoy: string): TiempoEtapa<C>[] {
  const porCompra = new Map<string, EventoEtapa[]>();
  for (const e of eventos) if (e.campo === "etapa" && e.valor) porCompra.set(e.compraId, [...(porCompra.get(e.compraId) ?? []), e]);
  const pasadas = new Map<string, number[]>();
  const ahora = new Map<string, { compra: C; dias: number }[]>();
  for (const c of compras) {
    const orden = [...(porCompra.get(c.id) ?? [])].sort((a, b) => a.ocurridoEn.localeCompare(b.ocurridoEn));
    // Eventos seguidos con la misma etapa son una sola estancia.
    const tramos = orden.filter((e, i) => i === 0 || orden[i - 1].valor !== e.valor);
    tramos.forEach((e, i) => {
      const siguiente = tramos[i + 1];
      if (siguiente) pasadas.set(e.valor!, [...(pasadas.get(e.valor!) ?? []), dias(e.ocurridoEn, siguiente.ocurridoEn)]);
      else if (e.valor === c.etapa) ahora.set(c.etapa, [...(ahora.get(c.etapa) ?? []), { compra: c, dias: dias(e.ocurridoEn, hoy) }]);
    });
  }
  return etapas.map((etapa) => ({ etapa, pasadas: resumir(pasadas.get(etapa) ?? []), ahora: (ahora.get(etapa) ?? []).sort((a, b) => b.dias - a.dias) }));
}
