// Portal AF4 360° › Proyección de caja › «¿Qué pasa si?». Lógica pura: aplica a las partidas de la proyección base un
// escenario que la persona arma al vuelo (bajar las ventas un X %, subir el marketing un Y %, atrasar un cobro N días) y
// lo compara con la base. No se guarda: corre en el navegador. Prueba en `que-pasa-si.test.ts`.

import { CON_VENTAS, COBROS, armarProyeccion, indicadores, type Linea, type Proyeccion } from "./proyeccion-caja";

const r2 = (v: number) => Math.round(v * 100) / 100;

export interface EscenarioQueSi {
  /** −0,10 = ventas un 10 % abajo. */
  ventas: number;
  /** 0,20 = marketing un 20 % arriba. */
  marketing: number;
  /** El cobro que se atrasa: «concepto|detalle» de una partida, «todos» = todos los cobros, null = ninguno. */
  cobro: string | null;
  dias: number;
}

export const ESCENARIO_NEUTRO: EscenarioQueSi = { ventas: 0, marketing: 0, cobro: null, dias: 0 };

export const claveLinea = (l: Pick<Linea, "concepto" | "detalle">) => `${l.concepto}|${l.detalle}`;

/** Corre los valores `dias` días hacia adelante, repartiendo cada semana entre las dos en que cae; lo que pasa de la última se pierde. */
export function correrDias(valores: number[], dias: number): number[] {
  if (dias <= 0) return [...valores];
  const semanas = dias / 7;
  const entero = Math.floor(semanas);
  const resto = semanas - entero;
  const salida = valores.map(() => 0);
  valores.forEach((v, i) => {
    const a = i + entero;
    if (a < salida.length) salida[a] += v * (1 - resto);
    if (resto > 0 && a + 1 < salida.length) salida[a + 1] += v * resto;
  });
  return salida.map(r2);
}

export function aplicarQueSi(lineas: Linea[], e: EscenarioQueSi): Linea[] {
  return lineas.map((l) => {
    let valores = l.valores;
    if (e.ventas && CON_VENTAS.includes(l.concepto)) valores = valores.map((v) => r2(v * (1 + e.ventas)));
    if (e.marketing && l.concepto === "marketing") valores = valores.map((v) => r2(v * (1 + e.marketing)));
    if (e.dias > 0 && e.cobro && COBROS.includes(l.concepto) && (e.cobro === "todos" || e.cobro === claveLinea(l))) valores = correrDias(valores, e.dias);
    return valores === l.valores ? l : { ...l, valores };
  });
}

export interface ComparacionQueSi {
  base: Proyeccion;
  escenario: Proyeccion;
  cajaFinal: { base: number; escenario: number };
  cajaMinima: { base: number; escenario: number; semanaBase: number; semanaEscenario: number };
  semanaNegativa: { base: number | null; escenario: number | null };
  bajoMinimo: { base: number; escenario: number };
}

export function compararQueSi(lineas: Linea[], semanas: string[], cajaInicial: number, cajaMinima: number, e: EscenarioQueSi): ComparacionQueSi {
  const base = armarProyeccion(lineas, semanas, cajaInicial);
  const escenario = armarProyeccion(aplicarQueSi(lineas, e), semanas, cajaInicial);
  const kb = indicadores(base, cajaMinima);
  const ke = indicadores(escenario, cajaMinima);
  return {
    base,
    escenario,
    cajaFinal: { base: base.cajaFinal.at(-1) ?? cajaInicial, escenario: escenario.cajaFinal.at(-1) ?? cajaInicial },
    cajaMinima: { base: kb.cajaMinima, escenario: ke.cajaMinima, semanaBase: kb.semanaMinima, semanaEscenario: ke.semanaMinima },
    semanaNegativa: { base: kb.semanaNegativa, escenario: ke.semanaNegativa },
    bajoMinimo: { base: kb.bajoMinimo.length, escenario: ke.bajoMinimo.length },
  };
}

/** Las partidas de cobro que se pueden atrasar (las que tienen algo en las 13 semanas), de la más grande a la más chica. */
export function cobrosAtrasables(lineas: Linea[]): { clave: string; etiqueta: string; total: number }[] {
  return lineas
    .filter((l) => COBROS.includes(l.concepto) && l.valores.some((v) => v > 0))
    .map((l) => ({ clave: claveLinea(l), etiqueta: l.detalle, total: r2(l.valores.reduce((a, b) => a + b, 0)) }))
    .sort((a, b) => b.total - a.total);
}
