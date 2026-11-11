// Tema y cálculos puros de las gráficas del Portal AF4 360°. Los colores son variables CSS (globals.css, `--grafica-*`),
// definidas para el tema claro y el oscuro: ninguna gráfica lleva un color fijo. Cada serie, además del color, se
// distingue por su forma (barra llena, línea continua, línea punteada), para no depender solo del color.

/** Los colores de las series, en el orden en que se asignan. 1 = la magnitud base (ingresos, ventas), 2 = el resultado
 * que importa (EBITDA, contribución), 3 y 4 = series extra, 5 = la referencia (presupuesto, período anterior). */
export const COLOR_SERIE = {
  1: "var(--grafica-1)",
  2: "var(--grafica-2)",
  3: "var(--grafica-3)",
  4: "var(--grafica-4)",
  5: "var(--grafica-5)",
} as const;
export type IndiceColor = keyof typeof COLOR_SERIE;

export const COLOR_POSITIVO = "var(--grafica-positivo)";
export const COLOR_NEGATIVO = "var(--grafica-negativo)";
export const COLOR_REJILLA = "var(--border)";
export const COLOR_EJE = "var(--muted-foreground)";
export const COLOR_CERO = "var(--border-control)";

/** Trazos para distinguir series sin color: continua, rayas, puntos. */
export const TRAZO = { continuo: undefined, rayas: "6 3", puntos: "2 3" } as const;
export type Trazo = keyof typeof TRAZO;

/** Cómo se formatea un valor de la gráfica (los componentes de cliente no reciben funciones desde el servidor). */
export type FormatoValor = "dinero" | "porcentaje" | "entero" | "veces";

// ---------------------------------------------------------------------------------------------
// Cascada (waterfall)
// ---------------------------------------------------------------------------------------------

/** Un paso de la cascada: el arranque (ventas), un delta (± un costo) o un total intermedio (margen, EBITDA). */
export interface PasoCascada {
  etiqueta: string;
  valor: number;
  tipo: "inicio" | "delta" | "total";
}

/** Una barra de la cascada lista para dibujar como barra apilada: un tramo invisible (`base`) y el visible (`alto`). */
export interface BarraCascada {
  etiqueta: string;
  /** Lo que aporta el paso (con signo) o el total. */
  valor: number;
  /** Donde arranca la barra visible. */
  base: number;
  /** El alto de la barra visible (siempre positivo). */
  alto: number;
  /** Lo acumulado después de este paso. */
  acumulado: number;
  clase: "total" | "sube" | "baja";
}

/**
 * Convierte los pasos en barras apiladas. Un total se dibuja desde cero hasta su valor; un delta, desde lo acumulado
 * hasta lo acumulado más el delta. Si lo acumulado cruza el cero, la barra igual queda entre los dos extremos.
 */
export function barrasCascada(pasos: PasoCascada[]): BarraCascada[] {
  let acumulado = 0;
  return pasos.map((p) => {
    if (p.tipo === "inicio" || p.tipo === "total") {
      acumulado = p.tipo === "inicio" ? p.valor : acumulado;
      const valor = p.tipo === "inicio" ? p.valor : acumulado;
      return { etiqueta: p.etiqueta, valor, base: Math.min(0, valor), alto: Math.abs(valor), acumulado, clase: "total" };
    }
    const desde = acumulado;
    acumulado += p.valor;
    return {
      etiqueta: p.etiqueta,
      valor: p.valor,
      base: Math.min(desde, acumulado),
      alto: Math.abs(p.valor),
      acumulado,
      clase: p.valor >= 0 ? "sube" : "baja",
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Escenarios
// ---------------------------------------------------------------------------------------------

/** La banda entre el peor y el mejor escenario de cada punto (para el área sombreada). */
export function bandaEscenarios(series: number[][]): [number, number][] {
  const largo = Math.max(0, ...series.map((s) => s.length));
  return Array.from({ length: largo }, (_, i) => {
    const valores = series.map((s) => s[i]).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return valores.length ? [Math.min(...valores), Math.max(...valores)] : [0, 0];
  });
}
