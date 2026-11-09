// Portal AF4 360° › Tesorería: los covenants evaluados con la deuda de hoy o con la de una oferta (Covenants,
// Refinanciamiento y la alerta diaria). Une `covenants.ts` y `optimizar-deuda.ts`; lógica pura, con prueba en
// `escenarios-deuda.test.ts`.

import {
  defIndicador,
  ETIQUETA_ESTADO,
  evaluarCovenant,
  MESES_PROYECCION,
  pasosProyeccion,
  peorEstado,
  primerIncumplimiento,
  proyectarCovenants,
  tendencias,
  valorIndicador,
  type Covenant,
  type EstadoCovenant,
  type MesCovenant,
  type ValoresCovenant,
} from "./covenants";
import { efectoAcumuladoAl, interesesEntre, intereses12, simularOferta, type Instrumento, type OfertaRefinanciamiento, type SimulacionOferta } from "./optimizar-deuda";

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Lo que una oferta agrega a una fecha: la caja (servicio que se deja de pagar + el excedente del desembolso) y el
 * patrimonio (intereses que se dejan de pagar − los costos únicos, una vez desembolsada).
 */
export function extraDeOferta(instrumentos: Instrumento[], sim: SimulacionOferta, o: OfertaRefinanciamiento, hoy: string) {
  return (fecha: string) => {
    const desembolsada = o.fechaDesembolso <= fecha;
    const ahorroIntereses = instrumentos.reduce((a, i) => a + interesesEntre(i, hoy, fecha), 0) - sim.escenario.reduce((a, i) => a + interesesEntre(i, hoy, fecha), 0);
    return {
      caja: efectoAcumuladoAl(instrumentos, sim.escenario, hoy, fecha, { fecha: o.fechaDesembolso, monto: sim.excedente }),
      patrimonio: r2(ahorroIntereses - (desembolsada ? sim.costoUnico : 0)),
    };
  };
}

export interface SerieCovenants {
  fecha: string;
  valores: ValoresCovenant;
}

/** La proyección de 6 meses de los indicadores con un escenario de deuda. */
export function serieEscenario(meses: MesCovenant[], instrumentosHoy: Instrumento[], escenario: Instrumento[], hoy: string, extra?: (fecha: string) => { caja: number; patrimonio: number }, n = MESES_PROYECCION): SerieCovenants[] {
  const base = meses[meses.length - 1];
  const interesesHoy = r2(instrumentosHoy.reduce((a, i) => a + intereses12(i, hoy), 0));
  return proyectarCovenants(base, tendencias(meses), pasosProyeccion(base.corte, escenario, extra, n), interesesHoy).map((m) => ({ fecha: m.fecha, valores: m.valores }));
}

export interface EvaluacionCovenant {
  covenant: Covenant;
  /** El último corte cerrado (o, para una oferta, el primer mes proyectado con ella). */
  valor: number | null;
  estado: EstadoCovenant;
  serie: { fecha: string; valor: number | null; estado: EstadoCovenant }[];
  /** El peor estado de hoy y de los 6 meses. */
  peor: EstadoCovenant;
  primerIncumplimiento: string | null;
}

/** Cada covenant con su estado hoy y en los próximos 6 meses (los de una oferta, con la deuda de esa oferta). */
export function evaluarCovenants(covenants: Covenant[], meses: MesCovenant[], instrumentos: Instrumento[], ofertas: OfertaRefinanciamiento[], hoy: string): EvaluacionCovenant[] {
  if (!meses.length) return [];
  const actual = serieEscenario(meses, instrumentos, instrumentos, hoy);
  const porOferta = new Map<string, SerieCovenants[]>();
  const serieDe = (c: Covenant): SerieCovenants[] | null => {
    if (c.ambito !== "oferta") return actual;
    const o = ofertas.find((x) => x.id === c.refId);
    if (!o) return null;
    if (!porOferta.has(o.id)) {
      const sim = simularOferta(o, instrumentos, hoy);
      porOferta.set(o.id, serieEscenario(meses, instrumentos, sim.escenario, hoy, extraDeOferta(instrumentos, sim, o, hoy)));
    }
    return porOferta.get(o.id)!;
  };
  const ultimo = meses[meses.length - 1].valores;
  return covenants
    .map((c) => {
      const serie = serieDe(c);
      if (!serie) return null;
      const hoyValores = c.ambito === "oferta" ? (serie[0]?.valores ?? ultimo) : ultimo;
      const estado = evaluarCovenant(c.indicador, c.umbral, hoyValores);
      const s = serie.map((m) => ({ fecha: m.fecha, valor: valorIndicador(c.indicador, m.valores), estado: evaluarCovenant(c.indicador, c.umbral, m.valores) }));
      return { covenant: c, valor: valorIndicador(c.indicador, hoyValores), estado, serie: s, peor: peorEstado([estado, ...s.map((x) => x.estado)]), primerIncumplimiento: primerIncumplimiento(c, serie) };
    })
    .filter((x): x is EvaluacionCovenant => x !== null);
}

/** La alerta de un covenant (null si cumple y seguirá cumpliendo). Los de ofertas no alertan: todavía no se firmaron. */
export function alertaCovenant(
  e: EvaluacionCovenant,
  contrato: string,
  fmt: (v: number | null, formato: "veces" | "dinero") => string,
  mes: (fecha: string) => string,
): { clave: string; severidad: "critica" | "aviso" | "info"; mensaje: string } | null {
  if (e.covenant.ambito === "oferta") return null;
  const d = defIndicador(e.covenant.indicador);
  const umbral = `${d.sentido === "max" ? "máximo" : "mínimo"} ${fmt(e.covenant.umbral, d.formato)}`;
  const clave = `cov:${e.covenant.id}`;
  if (e.estado === "incumple") return { clave, severidad: "critica", mensaje: `Covenant incumplido: ${d.corto} ${fmt(e.valor, d.formato)} (${umbral}) · ${contrato}.` };
  if (e.primerIncumplimiento) return { clave, severidad: "aviso", mensaje: `Covenant en riesgo: ${d.corto} incumpliría en ${mes(e.primerIncumplimiento)} (${umbral}) · ${contrato}.` };
  if (e.estado === "riesgo") return { clave, severidad: "info", mensaje: `Covenant ${ETIQUETA_ESTADO.riesgo.toLowerCase()}: ${d.corto} ${fmt(e.valor, d.formato)} (${umbral}) · ${contrato}.` };
  return null;
}

/** Los contratos a los que se les puede poner un covenant («general» o «<ámbito>:<id>»), agrupados para un selector. */
export function contratosCovenant(
  d: { prestamos: { id: string; nombre: string }[]; lineas: { id: string; nombre: string }[]; ciclos?: { id: string; nombre: string }[] },
  ofertas: { id: string; nombre: string; banco: string }[],
): { valor: string; etiqueta: string; grupo: string }[] {
  return [
    { valor: "general", etiqueta: "Toda la empresa", grupo: "General" },
    ...d.prestamos.map((p) => ({ valor: `prestamo:${p.id}`, etiqueta: p.nombre, grupo: "Préstamos" })),
    ...d.lineas.map((l) => ({ valor: `linea:${l.id}`, etiqueta: l.nombre, grupo: "Líneas de crédito" })),
    ...(d.ciclos ?? []).map((c) => ({ valor: `ciclo:${c.id}`, etiqueta: c.nombre, grupo: "Financiamientos por ciclo" })),
    ...ofertas.map((o) => ({ valor: `oferta:${o.id}`, etiqueta: `${o.nombre} · ${o.banco}`, grupo: "Ofertas de refinanciamiento" })),
  ];
}

/** El nombre del contrato de un covenant (o «Contrato desactivado» si ya no está). */
export function nombreContrato(c: Pick<Covenant, "ambito" | "refId">, contratos: { valor: string; etiqueta: string }[]): string {
  const valor = c.ambito === "general" ? "general" : `${c.ambito}:${c.refId}`;
  return contratos.find((x) => x.valor === valor)?.etiqueta ?? "Contrato desactivado";
}
