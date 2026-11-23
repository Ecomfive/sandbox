// Anuncios Meta › qué hacer con cada anuncio (23 nov 2026): la escalera de decisiones que el equipo de Oferfy escribió en su documento «Métrica» (ventana de gasto del anuncio → escenario de métricas → decisión). Lógica pura, con
// prueba. Todos los umbrales están aquí, a la vista, con el valor del documento. El gasto es el **acumulado del anuncio** (los últimos 30 días leídos: un anuncio de prueba rara vez vive más).
//
//   $8–12 sin compras: CTR del enlace menor a 1.20 % → Cortar · CTR ≥ 2 % y Hook ≥ 30 % → Mantener (hasta los $12–16).
//   $12 o más sin compras → Cortar, aunque los clics y el Hook estén en verde (tráfico curioso que no compra).
//   1 compra con CPA de $12.01 a $16 y CTR ≥ 2 % → Observar (hasta $24–25: una segunda compra que baje el CPA a $12 o menos). Pasados $25 con el CPA arriba de $12 → Cortar.
//   2 o más compras con CPA ≤ $9.50 y ROAS ≥ 3.5 → Consolidar (no se edita ni se duplica dentro de la misma CBO).
//   Opcionales (el equipo no los hace hoy, quedan por si ayudan): Rebalancear (un anuncio de una CBO se come más del 60 % del presupuesto con CPA de $11–12 mientras otro rinde mejor) y Rotar gancho (ganador que
//   se desgasta: más de $35, la frecuencia pasa de 2.80, el CTR cae más de 25 % y el CPA de 48 h pasa de $12).

import { cpa, ctr, dolares, hookRate, type Resultados } from "./metricas";

export type Decision = "cortar" | "mantener" | "observar" | "consolidar" | "rebalancear" | "rotar";

export const NOMBRE_DECISION: Record<Decision, string> = { cortar: "Cortar", mantener: "Mantener", observar: "Observar", consolidar: "Consolidar", rebalancear: "Rebalancear", rotar: "Rotar gancho" };

/** Los umbrales del documento «Métrica» de Oferfy. */
export const UMBRALES_ANUNCIO = {
  /** CPA objetivo y CPA en rojo del anuncio. */
  cpaObjetivo: 9.5,
  cpaRojo: 12,
  /** Primera ventana de gasto: con menos que esto todavía no se decide; hasta `ventanaCorte` se mira el CTR. */
  ventanaInicio: 8,
  ventanaCorte: 12,
  /** CTR del enlace: por debajo se corta en la primera ventana; desde aquí hay intención real. */
  ctrCorte: 1.2,
  ctrBueno: 2,
  hookBueno: 30,
  /** Una compra con CPA hasta aquí se observa; el máximo de gasto que se le da para una segunda compra. */
  observarCpaMaximo: 16,
  observarGastoMaximo: 25,
  /** Consolidar. */
  consolidarCompras: 2,
  consolidarRoas: 3.5,
  consolidarGastoMinimo: 20,
  /** Rebalancear: gasto de un día y parte del presupuesto de la CBO que absorbe; CPA que absorbe y CPA del otro anuncio que rinde mejor. */
  rebalancearGastoDia: 30,
  rebalancearPartePresupuesto: 0.6,
  rebalancearCpaDesde: 11,
  rebalancearCpaHasta: 12,
  rebalancearOtroCpa: 8.5,
  /** Rotar gancho: gasto acumulado, caída del CTR y CPA de las últimas 48 horas. */
  rotarGastoMinimo: 35,
  rotarCaidaCtr: 0.25,
  rotarFrecuencia: 2.8,
} as const;

export interface EntradaDecision {
  /** Lo que lleva el anuncio (acumulado de los días leídos). */
  acumulado: Resultados;
  /** Las últimas 48 horas (hoy y ayer). */
  ultimos2: Resultados;
  /** El día más reciente con datos. */
  ultimoDia: Resultados;
  /** Presupuesto diario de la campaña y si es CBO (el presupuesto está en la campaña). */
  presupuestoCampana: number | null;
  esCbo: boolean;
  /** Otro anuncio activo de la misma campaña rinde mucho mejor (CPA menor a $8.50). */
  hayOtroConCpaBajo: boolean;
  /** Veces que, en promedio, una persona vio el anuncio en los últimos 7 días; null si todavía no se lee de Meta. */
  frecuencia?: number | null;
}

export interface ResultadoDecision {
  decision: Decision;
  /** Por qué, en una frase. */
  motivo: string;
}

const roas = (r: Resultados): number | null => (r.gasto > 0 && r.valor > 0 ? r.valor / r.gasto : null);

/** La decisión que toca para un anuncio activo, o null si todavía no hay nada que decidir (poco gasto). */
export function decisionDeAnuncio(e: EntradaDecision): ResultadoDecision | null {
  const U = UMBRALES_ANUNCIO;
  const a = e.acumulado;
  const costo = cpa(a);
  const porClic = ctr(a);
  const hook = hookRate(a);

  if (a.compras === 0) {
    if (a.gasto >= U.ventanaCorte) return { decision: "cortar", motivo: `Gastó ${dolares(a.gasto)} sin una compra: pasó de ${dolares(U.ventanaCorte)}. Aunque los clics y el Hook estén bien, atrae tráfico curioso que no compra.` };
    if (a.gasto >= U.ventanaInicio) {
      if (porClic !== null && porClic < U.ctrCorte) return { decision: "cortar", motivo: `Gastó ${dolares(a.gasto)} sin compras y su CTR del enlace es ${porClic.toFixed(2)} % (menos de ${U.ctrCorte} %): hizo clics pero no genera intención de compra.` };
      if (porClic !== null && porClic >= U.ctrBueno && hook !== null && hook >= U.hookBueno) return { decision: "mantener", motivo: `Sin compras todavía, pero con CTR ${porClic.toFixed(2)} % y Hook ${hook.toFixed(0)} %: hay intención real. Déjalo correr hasta ${dolares(U.ventanaCorte)}–${dolares(16)}.` };
    }
    return null;
  }

  // Con compras.
  if (a.gasto >= U.observarGastoMaximo && costo !== null && costo > U.cpaRojo) return { decision: "cortar", motivo: `Gastó ${dolares(a.gasto)} y su CPA sigue en ${dolares(costo)} (más de ${dolares(U.cpaRojo)}): no logró bajarlo con una segunda compra.` };
  if (a.compras === 1 && costo !== null && costo > U.cpaRojo && costo <= U.observarCpaMaximo && porClic !== null && porClic >= U.ctrBueno) {
    return { decision: "observar", motivo: `Una compra con CPA ${dolares(costo)} y CTR ${porClic.toFixed(2)} %. Dale margen hasta ${dolares(U.observarGastoMaximo)} para ver si una segunda compra baja el CPA a ${dolares(U.cpaRojo)} o menos.` };
  }
  // Un ganador que se desgasta: rota el gancho.
  const antes: Resultados = restar(a, e.ultimos2);
  const ctrAntes = ctr(antes);
  const ctrAhora = ctr(e.ultimos2);
  const costoAhora = cpa(e.ultimos2);
  const ganabaAntes = antes.compras >= 2 && (cpa(antes) ?? Infinity) <= U.cpaObjetivo;
  if (a.gasto >= U.rotarGastoMinimo && ganabaAntes && ctrAntes !== null && ctrAhora !== null && ctrAhora < ctrAntes * (1 - U.rotarCaidaCtr) && e.ultimos2.gasto > 0 && (costoAhora === null || costoAhora > U.cpaRojo) && (e.frecuencia == null || e.frecuencia > U.rotarFrecuencia)) {
    return { decision: "rotar", motivo: `Era ganador (CPA ${dolares(cpa(antes) ?? 0)})${e.frecuencia != null ? `, su frecuencia ya es ${e.frecuencia.toFixed(2)} (más de ${U.rotarFrecuencia})` : ""} y en 48 horas su CTR cayó de ${ctrAntes.toFixed(2)} % a ${ctrAhora.toFixed(2)} % y el CPA pasó de ${dolares(U.cpaRojo)}. Sube 2 o 3 variantes cambiando solo los primeros 3 segundos y conserva el cuerpo del video.` };
  }
  // Un anuncio que se come la CBO con un CPA regular mientras otro rinde mejor (opcional).
  const costoDia = cpa(e.ultimoDia);
  if (e.esCbo && e.presupuestoCampana && e.ultimoDia.gasto >= U.rebalancearGastoDia && e.ultimoDia.gasto > e.presupuestoCampana * U.rebalancearPartePresupuesto && costoDia !== null && costoDia >= U.rebalancearCpaDesde && costoDia <= U.rebalancearCpaHasta && e.hayOtroConCpaBajo) {
    return { decision: "rebalancear", motivo: `Se llevó ${dolares(e.ultimoDia.gasto)} en el día (más del 60 % del presupuesto de la CBO) con CPA ${dolares(costoDia)}, y otro anuncio de la campaña rinde por debajo de ${dolares(U.rebalancearOtroCpa)}. Opcional: apágalo un rato para que la CBO reparta el presupuesto.` };
  }
  const retorno = roas(a);
  if (a.compras >= U.consolidarCompras && costo !== null && costo <= U.cpaObjetivo && retorno !== null && retorno >= U.consolidarRoas && a.gasto >= U.consolidarGastoMinimo) {
    return { decision: "consolidar", motivo: `${a.compras} compras con CPA ${dolares(costo)} y ROAS ${retorno.toFixed(1)}x. No lo edites ni lo dupliques dentro de la misma CBO: deja que el algoritmo concentre el presupuesto en él.` };
  }
  return null;
}

function restar(a: Resultados, b: Resultados): Resultados {
  const out = { ...a } as Record<string, number>;
  for (const k of Object.keys(a) as (keyof Resultados)[]) out[k] = Math.max(0, (a[k] as number) - ((b[k] as number | undefined) ?? 0));
  return out as unknown as Resultados;
}

/** Lo que hace falta de un anuncio para decidir (la vista y las sugerencias comparten esta forma). */
export interface AnuncioParaDecidir {
  id: string;
  campanaId: string;
  activo: boolean;
  /** Acumulado de los días leídos, últimas 48 horas y último día con datos. */
  r: Resultados;
  ultimos2: Resultados;
  ultimoDia: Resultados;
  /** Frecuencia de los últimos 7 días, si se conoce. */
  frecuencia?: number | null;
}

/** La decisión de cada anuncio activo de las campañas activas (id del anuncio → decisión). */
export function decisionesDeAnuncios(anuncios: AnuncioParaDecidir[], campanas: { id: string; activa: boolean; presupuestoDiario: number | null; estructura: string | null }[]): Map<string, ResultadoDecision> {
  const salida = new Map<string, ResultadoDecision>();
  const activas = new Map(campanas.filter((c) => c.activa).map((c) => [c.id, c]));
  for (const a of anuncios) {
    const c = activas.get(a.campanaId);
    if (!c || !a.activo) continue;
    const hayOtroConCpaBajo = anuncios.some((x) => x.id !== a.id && x.campanaId === a.campanaId && x.activo && x.r.compras > 0 && (cpa(x.r) ?? Infinity) < UMBRALES_ANUNCIO.rebalancearOtroCpa);
    const d = decisionDeAnuncio({ acumulado: a.r, ultimos2: a.ultimos2, ultimoDia: a.ultimoDia, presupuestoCampana: c.presupuestoDiario, esCbo: c.estructura === "CBO", hayOtroConCpaBajo, frecuencia: a.frecuencia });
    if (d) salida.set(a.id, d);
  }
  return salida;
}
