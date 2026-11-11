// Portal AF4 360° › Desglose de una cifra del EERR hasta sus movimientos (mejora 32). Lógica pura: de los movimientos del
// libro que entran a esa cifra (los cargados directo a la tienda y, de A DISTRIBUIR, la parte que le toca con la base de
// reparto) arma la lista con lo que aporta cada uno, con el mismo signo con que se ve en la tabla. Prueba en
// `desglose.test.ts`.

import type { Seccion } from "./eerr";

export interface MovimientoDesglose {
  id: string;
  periodo: string;
  fecha: string | null;
  unidad_id: string;
  unidad: string;
  clase: string;
  entidad_id: string | null;
  tipo: string;
  seccion: Seccion;
  signo: number;
  descripcion: string;
  /** En la moneda en que se ve el EERR, positivo como en el libro (un reverso, negativo). */
  monto: number;
  intercompania: boolean;
}

export interface LineaDesglose {
  id: string;
  fecha: string | null;
  periodo: string;
  unidad: string;
  tipo: string;
  descripcion: string;
  monto: number;
  /** 1 si es directo; la participación de la tienda si viene de A DISTRIBUIR. */
  participacion: number;
  /** Lo que suma a la cifra, con el signo de la tabla. */
  aporte: number;
  repartido: boolean;
  intercompania: boolean;
}

export interface OpcionesDesglose {
  /** La tienda de la cifra, o null para todas. */
  unidadId: string | null;
  /** Participación en el reparto de A DISTRIBUIR de un mes, entidad y tienda (null = todas). */
  participacion: (periodo: string, entidad: string | null, unidad: string | null) => number;
  /** El consolidado deja fuera lo intercompañía. */
  sinIntercompania: boolean;
  /** Una fila de resultado (margen, EBITDA, neto) suma con el signo de cada tipo; una sección, como se ve en la tabla. */
  resultado: boolean;
}

/**
 * Cómo se ve un monto en la tabla del EERR: en un resultado, con su efecto (+ ingreso, − gasto); dentro de ingresos, con
 * el signo del tipo (la devolución resta); en una sección de costos, positivo (lo que se gastó).
 */
export function signoVista(seccion: Seccion, signo: number, resultado: boolean): number {
  if (resultado || seccion === "ingresos") return signo;
  return 1;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export function desglosar(movs: MovimientoDesglose[], o: OpcionesDesglose): { lineas: LineaDesglose[]; total: number } {
  const lineas: LineaDesglose[] = [];
  for (const m of movs) {
    if (o.sinIntercompania && m.intercompania) continue;
    const repartido = m.clase === "reparto";
    let participacion = 1;
    if (repartido) participacion = o.participacion(m.periodo, m.entidad_id, o.unidadId);
    else if (o.unidadId && m.unidad_id !== o.unidadId) continue;
    if (participacion <= 0) continue;
    const aporte = r2(m.monto * participacion * signoVista(m.seccion, m.signo, o.resultado));
    lineas.push({
      id: m.id,
      fecha: m.fecha,
      periodo: m.periodo,
      unidad: m.unidad,
      tipo: m.tipo,
      descripcion: m.descripcion,
      monto: m.monto,
      participacion,
      aporte,
      repartido,
      intercompania: m.intercompania,
    });
  }
  lineas.sort((a, b) => Math.abs(b.aporte) - Math.abs(a.aporte) || a.id.localeCompare(b.id));
  return { lineas, total: r2(lineas.reduce((s, l) => s + l.aporte, 0)) };
}

/** Qué secciones (y qué tipo) forman una fila del EERR por su clave (`filasEstado`), o null si no se desglosa (un %). */
export function seccionesDeFila(clave: string): { secciones: Seccion[]; tipo: string | null; resultado: boolean } | null {
  const RESULTADOS: Record<string, Seccion[]> = {
    "ingresos-netos": ["ingresos"],
    "margen-bruto": ["ingresos", "costo_ventas"],
    ebitda: ["ingresos", "costo_ventas", "administracion", "marketing"],
    ebit: ["ingresos", "costo_ventas", "administracion", "marketing", "depreciacion"],
    "resultado-neto": ["ingresos", "costo_ventas", "administracion", "marketing", "depreciacion", "finanzas", "otros", "impuesto_ganancias"],
  };
  if (clave.endsWith("-pct")) return null;
  if (RESULTADOS[clave]) return { secciones: RESULTADOS[clave], tipo: null, resultado: true };
  const SECCIONES: Seccion[] = ["ingresos", "costo_ventas", "administracion", "marketing", "depreciacion", "finanzas", "otros", "impuesto_ganancias"];
  if ((SECCIONES as string[]).includes(clave)) return { secciones: [clave as Seccion], tipo: null, resultado: false };
  const s = SECCIONES.find((x) => clave.startsWith(`${x}-`));
  if (s) return { secciones: [s], tipo: clave.slice(s.length + 1), resultado: false };
  return null;
}
