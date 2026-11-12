// «Tu desempeño con Ecomfive»: el panel de arriba del portal del proveedor y de su Tablero en Compras (reunión con Alcides del 11 nov 2026;
// prototipo aprobado por Hernán). Unidades y órdenes enviadas por semana o por mes (con su histórico y por país), los días reales que
// tarda en cotizar (de «Enviado a cotización» a «Cotizado») y cuántas producciones y tránsitos cumplieron su plazo. Lógica pura, con
// prueba (`desempeno.test.ts`); la lectura está en `desempeno-datos.ts`.

import { PLAZO_ETAPA } from "@/lib/compras/plazos";

const DIA = 86_400_000;

/** Lo que miden los indicadores: los últimos 90 días. */
export const VENTANA_DIAS = 90;
/** Semanas que muestra el gráfico por semana y meses que muestra por mes. */
export const SEMANAS_GRAFICO = 12;
export const MESES_GRAFICO = 6;

export interface EnvioSemana {
  /** El lunes de la semana del envío (YYYY-MM-DD). */
  semana: string;
  pais: string | null;
  unidades: number;
  ordenes: number;
}
export interface MuestraDias {
  pais: string | null;
  dias: number;
}
export interface MuestraTransito extends MuestraDias {
  plazo: number;
}

export interface DesempenoProveedor {
  envios: EnvioSemana[];
  /** Días (con decimales) de «Enviado a cotización» a «Cotizado», de las cotizaciones de los últimos 90 días. */
  cotizaciones: MuestraDias[];
  /** Días en producción de las compras que salieron de producción en los últimos 90 días. */
  producciones: MuestraDias[];
  /** Días en tránsito y plazo prometido de lo que llegó en los últimos 90 días (sin plazo conocido no cuenta). */
  transitos: MuestraTransito[];
}

/** El lunes de la semana de una fecha (YYYY-MM-DD). */
export function lunesDe(fecha: string): string {
  const d = new Date(`${fecha.slice(0, 10)}T12:00:00Z`);
  const desdeLunes = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - desdeLunes * DIA).toISOString().slice(0, 10);
}

/** Unidades y órdenes enviadas por semana y país: cada pedido con fecha de envío cuenta en la semana de esa fecha (los descartados no). */
export function enviosPorSemana(pedidos: { fechaEnvio: string | null; paisCodigo: string | null; unidades: number | null; etapa: string }[]): EnvioSemana[] {
  const porClave = new Map<string, EnvioSemana>();
  for (const p of pedidos) {
    if (!p.fechaEnvio || p.etapa === "descartado") continue;
    const semana = lunesDe(p.fechaEnvio);
    const clave = `${semana}|${p.paisCodigo ?? ""}`;
    const e = porClave.get(clave) ?? { semana, pais: p.paisCodigo, unidades: 0, ordenes: 0 };
    e.unidades += Math.max(0, p.unidades ?? 0);
    e.ordenes += 1;
    porClave.set(clave, e);
  }
  return [...porClave.values()].sort((a, b) => a.semana.localeCompare(b.semana) || (a.pais ?? "").localeCompare(b.pais ?? ""));
}

export interface EventoEtapaCompra {
  compraId: string;
  valor: string | null;
  ocurridoEn: string;
}

/**
 * Las estancias en `etapa` que terminaron dentro de la ventana (desde `desde`): cuánto duró cada una (días con decimales). Con `hacia`,
 * solo las que terminaron al pasar a esa etapa (de «Enviado a cotización» a «Cotizado», por ejemplo); eventos seguidos con la misma etapa
 * son una sola estancia.
 */
export function estanciasTerminadas(eventos: EventoEtapaCompra[], etapa: string, desde: number, hacia?: string): { compraId: string; dias: number }[] {
  const porCompra = new Map<string, EventoEtapaCompra[]>();
  for (const e of eventos) if (e.valor) porCompra.set(e.compraId, [...(porCompra.get(e.compraId) ?? []), e]);
  const fuera: { compraId: string; dias: number }[] = [];
  for (const [compraId, lista] of porCompra) {
    const orden = [...lista].sort((a, b) => a.ocurridoEn.localeCompare(b.ocurridoEn));
    const tramos = orden.filter((e, i) => i === 0 || orden[i - 1].valor !== e.valor);
    tramos.forEach((e, i) => {
      const sig = tramos[i + 1];
      if (e.valor !== etapa || !sig || (hacia && sig.valor !== hacia)) return;
      const fin = Date.parse(sig.ocurridoEn);
      if (fin < desde) return;
      fuera.push({ compraId, dias: Math.max(0, (fin - Date.parse(e.ocurridoEn)) / DIA) });
    });
  }
  return fuera;
}

/** Lo que llegó dentro de la ventana, con sus días en tránsito y el plazo prometido de su país y vía. */
export function transitosConPlazo(
  pedidos: { fechaEnvio: string | null; fechaLlegada: string | null; paisCodigo: string | null; via: string }[],
  plazoDe: (pais: string | null, via: string) => number | null,
  desdeFecha: string,
): MuestraTransito[] {
  const fuera: MuestraTransito[] = [];
  for (const p of pedidos) {
    if (!p.fechaEnvio || !p.fechaLlegada || p.fechaLlegada < desdeFecha) continue;
    const plazo = plazoDe(p.paisCodigo, p.via);
    if (plazo == null) continue;
    const dias = Math.round((Date.parse(p.fechaLlegada) - Date.parse(p.fechaEnvio)) / DIA);
    if (dias >= 0) fuera.push({ pais: p.paisCodigo, dias, plazo });
  }
  return fuera;
}

export type Periodo = "semana" | "mes";

export interface PuntoSerie {
  /** El lunes de la semana o el mes (YYYY-MM). */
  clave: string;
  unidades: number;
  ordenes: number;
}

/** La serie del gráfico: las últimas 12 semanas o los últimos 6 meses hasta `hoy` (los que no tuvieron envíos, en cero), de un país o de todos. */
export function serieEnvios(envios: EnvioSemana[], periodo: Periodo, pais: string | null, hoy: string): PuntoSerie[] {
  const claves: string[] = [];
  if (periodo === "semana") {
    const ultimo = Date.parse(`${lunesDe(hoy)}T12:00:00Z`);
    for (let i = SEMANAS_GRAFICO - 1; i >= 0; i--) claves.push(new Date(ultimo - i * 7 * DIA).toISOString().slice(0, 10));
  } else {
    const [a, m] = hoy.slice(0, 7).split("-").map(Number);
    for (let i = MESES_GRAFICO - 1; i >= 0; i--) {
      const total = a * 12 + (m - 1) - i;
      claves.push(`${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`);
    }
  }
  const puntos = new Map(claves.map((clave) => [clave, { clave, unidades: 0, ordenes: 0 }]));
  for (const e of envios) {
    if (pais && e.pais !== pais) continue;
    const punto = puntos.get(periodo === "semana" ? e.semana : e.semana.slice(0, 7));
    if (!punto) continue;
    punto.unidades += e.unidades;
    punto.ordenes += e.ordenes;
  }
  return [...puntos.values()];
}

export interface ResumenDesempeno {
  /** Días promedio para cotizar (un decimal); null sin cotizaciones medidas todavía. */
  promedioCotizar: number | null;
  cotizacionesMedidas: number;
  /** Porcentaje de producciones que duraron 15 días o menos; null sin datos. */
  produccionATiempo: number | null;
  produccionesMedidas: number;
  /** Porcentaje de llegadas dentro del plazo de su país y vía; null sin datos. */
  transitoATiempo: number | null;
  transitosMedidos: number;
}

const pct = (n: number, de: number) => (de ? Math.round((n / de) * 100) : null);

/** Los indicadores, de un país o de todos. Producción a tiempo: 15 días o menos (redondeado al día). */
export function resumenDesempeno(d: DesempenoProveedor, pais: string | null): ResumenDesempeno {
  const de = <T extends { pais: string | null }>(xs: T[]) => (pais ? xs.filter((x) => x.pais === pais) : xs);
  const cot = de(d.cotizaciones);
  const prod = de(d.producciones);
  const tran = de(d.transitos);
  const limiteProduccion = PLAZO_ETAPA.produccion;
  return {
    promedioCotizar: cot.length ? Math.round((cot.reduce((s, x) => s + x.dias, 0) / cot.length) * 10) / 10 : null,
    cotizacionesMedidas: cot.length,
    produccionATiempo: pct(prod.filter((x) => Math.round(x.dias) <= limiteProduccion).length, prod.length),
    produccionesMedidas: prod.length,
    transitoATiempo: pct(tran.filter((x) => x.dias <= x.plazo).length, tran.length),
    transitosMedidos: tran.length,
  };
}
