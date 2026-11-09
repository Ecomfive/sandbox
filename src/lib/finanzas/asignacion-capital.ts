// Asignación de capital entre tiendas según el ROI marginal (Capital y riesgo › Asignación, mejora 42). Lógica pura.
//
// Modelo (simple y explicable): los pedidos de una tienda crecen con su pauta con rendimientos decrecientes,
// pedidos(P) = k · P^e, con la elasticidad `e` entre 0 y 1 (0,5 = duplicar la pauta multiplica los pedidos por 1,41). La
// curva se ancla en lo que la tienda hace hoy (pauta y pedidos por mes de la unidad económica), así que no hay que estimar
// nada más que `e`. Cada pedido deja la contribución por pedido de la tienda (margen antes de pauta ÷ pedidos: ya trae la
// tasa de entrega, el envío, las devoluciones y la comisión). El retorno del próximo dólar es
// contribución por pedido × e × pedidos(P) ÷ P − 1. El reparto empieza con cada tienda en su piso y va dando el monto en
// pasos a la tienda con mayor retorno marginal, sin pasar su techo de pauta (pauta ÷ ventas ≤ techo, 22 % por defecto) y
// sin dar un dólar que no se paga (retorno ≤ 0 queda sin asignar). Prueba en `asignacion-capital.test.ts`.

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export interface TiendaCapital {
  unidadId: string;
  nombre: string;
  /** Promedios por mes de la ventana. */
  pauta: number;
  pedidos: number;
  ventas: number;
  /** Margen antes de pauta (margen real + marketing). */
  contribucion: number;
  /** Costo de la mercancía. */
  mercancia: number;
  /** Entregadas ÷ enviadas (0–1), para mostrar. */
  tasaEntrega: number | null;
  /** Techo de pauta de la tienda, % de las ventas (0–100). */
  techo: number;
}

export interface SupuestosAsignacion {
  /** Elasticidad de los pedidos a la pauta (0,2–0,9). */
  elasticidad: number;
  /** Piso de cada tienda, % de su pauta de hoy (0–100). */
  pisoPct: number;
  /** Días de venta que se mantienen en inventario: el capital de trabajo que piden los pedidos extra. */
  diasInventario: number;
}

export const SUPUESTOS_ASIGNACION_PREDETERMINADOS: SupuestosAsignacion = { elasticidad: 0.5, pisoPct: 50, diasInventario: 45 };

export const LIMITES_ASIGNACION = {
  elasticidad: { min: 0.1, max: 0.95, etiqueta: "Elasticidad" },
  pisoPct: { min: 0, max: 100, etiqueta: "Piso por tienda (%)" },
  diasInventario: { min: 0, max: 365, etiqueta: "Días de inventario" },
} as const;

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};

export function leerSupuestosAsignacion(v: unknown): SupuestosAsignacion {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const d = SUPUESTOS_ASIGNACION_PREDETERMINADOS;
  const en = (x: unknown, def: number, l: { min: number; max: number }) => {
    const n = numero(x);
    return n === null || n < l.min || n > l.max ? def : n;
  };
  return {
    elasticidad: en(o.elasticidad, d.elasticidad, LIMITES_ASIGNACION.elasticidad),
    pisoPct: en(o.pisoPct ?? o.piso_pct, d.pisoPct, LIMITES_ASIGNACION.pisoPct),
    diasInventario: en(o.diasInventario ?? o.dias_inventario, d.diasInventario, LIMITES_ASIGNACION.diasInventario),
  };
}

/** Pedidos por mes con una pauta P, anclado en lo de hoy. */
export function pedidosCon(t: Pick<TiendaCapital, "pauta" | "pedidos">, P: number, e: number): number {
  if (t.pauta <= 0 || t.pedidos <= 0) return t.pedidos;
  if (P <= 0) return 0;
  return t.pedidos * (P / t.pauta) ** e;
}

export const contribucionPorPedido = (t: Pick<TiendaCapital, "contribucion" | "pedidos">) => (t.pedidos > 0 ? t.contribucion / t.pedidos : 0);

/** Retorno del próximo dólar de pauta con una pauta P (EBITDA por dólar: 0,8 = cada dólar deja 80 centavos netos). */
export function retornoMarginal(t: TiendaCapital, P: number, e: number): number | null {
  if (t.pauta <= 0 || t.pedidos <= 0 || P <= 0) return null;
  return contribucionPorPedido(t) * e * (pedidosCon(t, P, e) / P) - 1;
}

/** La pauta máxima que respeta el techo: P ≤ techo × ventas(P). Con rendimientos decrecientes tiene una sola solución. */
export function pautaMaxima(t: TiendaCapital, e: number): number | null {
  if (t.pauta <= 0 || t.pedidos <= 0 || t.ventas <= 0) return null;
  const ticket = t.ventas / t.pedidos;
  // P = techo · ticket · pedidos · (P / P0)^e  ⇒  P^(1−e) = techo · ticket · pedidos / P0^e
  return ((t.techo / 100) * ticket * t.pedidos * t.pauta ** -e) ** (1 / (1 - e));
}

export interface PropuestaTienda {
  unidadId: string;
  nombre: string;
  pautaHoy: number;
  pautaPropuesta: number;
  cambio: number;
  pedidosHoy: number;
  pedidosPropuestos: number;
  /** EBITDA por mes que suma (o resta) el cambio: contribución de los pedidos extra − pauta extra. */
  ebitdaIncremental: number;
  /** Retorno del próximo dólar hoy y después del reparto. */
  retornoHoy: number | null;
  retornoFinal: number | null;
  /** Pauta ÷ ventas hoy y con la propuesta (0–100). */
  pctHoy: number | null;
  pctPropuesto: number | null;
  techo: number;
  pautaMaxima: number | null;
  /** Capital de trabajo extra en inventario que piden los pedidos de más. */
  capitalInventario: number;
  limite: "techo" | "retorno" | "piso" | "monto" | "sin_datos";
  explicacion: string;
}

export interface ResultadoAsignacion {
  tiendas: PropuestaTienda[];
  monto: number;
  asignado: number;
  sinAsignar: number;
  ebitdaIncremental: number;
  capitalInventario: number;
  /** El EBITDA anual que suma × el múltiplo de la valoración. */
  valorCreado: number | null;
}

const fmt = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const pct = (v: number) => `${(v * 100).toFixed(0)} %`;

/**
 * Reparte `monto` (pauta del mes) entre las tiendas. Las tiendas sin pauta o sin pedidos no entran (no hay de dónde
 * anclar la curva). `pasos` controla la precisión (200 = de a 0,5 % del monto).
 */
export function asignarCapital(tiendas: TiendaCapital[], monto: number, s: SupuestosAsignacion, multiplo: number | null = null, pasos = 400): ResultadoAsignacion {
  const e = s.elasticidad;
  const validas = tiendas.filter((t) => t.pauta > 0 && t.pedidos > 0 && t.ventas > 0);
  const P = new Map<string, number>();
  const tope = new Map<string, number>();
  for (const t of validas) {
    const max = pautaMaxima(t, e) ?? Infinity;
    tope.set(t.unidadId, max);
    P.set(t.unidadId, Math.min((t.pauta * s.pisoPct) / 100, max));
  }
  // Si los pisos suman más que el monto, se achican en proporción.
  const pisos = [...P.values()].reduce((a, b) => a + b, 0);
  const escala = pisos > monto && pisos > 0 ? monto / pisos : 1;
  const piso = new Map<string, number>();
  for (const [k, v] of P) {
    P.set(k, v * escala);
    piso.set(k, v * escala);
  }
  let restante = Math.max(monto - pisos * escala, 0);
  const paso = Math.max(monto / pasos, 0.01);
  const limite = new Map<string, PropuestaTienda["limite"]>(validas.map((t) => [t.unidadId, "piso"]));
  while (restante > 1e-6) {
    let mejor: TiendaCapital | null = null;
    let mejorR = 0;
    for (const t of validas) {
      const p = P.get(t.unidadId)!;
      if (p >= tope.get(t.unidadId)! - 1e-6) {
        limite.set(t.unidadId, "techo");
        continue;
      }
      const r = retornoMarginal(t, Math.max(p, paso / 2), e) ?? -1;
      if (r > mejorR) {
        mejorR = r;
        mejor = t;
      }
    }
    if (!mejor) break;
    const dar = Math.min(paso, restante, tope.get(mejor.unidadId)! - P.get(mejor.unidadId)!);
    P.set(mejor.unidadId, P.get(mejor.unidadId)! + dar);
    restante -= dar;
    limite.set(mejor.unidadId, "monto");
  }
  // Por qué se detuvo cada una.
  for (const t of validas) {
    const p = P.get(t.unidadId)!;
    if (p >= tope.get(t.unidadId)! - 1e-6) limite.set(t.unidadId, "techo");
    else if ((retornoMarginal(t, p, e) ?? -1) <= 0) limite.set(t.unidadId, p <= piso.get(t.unidadId)! + 1e-6 ? "piso" : "retorno");
    else if (restante > 1e-6) limite.set(t.unidadId, "retorno");
  }
  const salida: PropuestaTienda[] = tiendas.map((t) => {
    if (!validas.includes(t)) {
      return {
        unidadId: t.unidadId,
        nombre: t.nombre,
        pautaHoy: r2(t.pauta),
        pautaPropuesta: r2(t.pauta),
        cambio: 0,
        pedidosHoy: Math.round(t.pedidos),
        pedidosPropuestos: Math.round(t.pedidos),
        ebitdaIncremental: 0,
        retornoHoy: null,
        retornoFinal: null,
        pctHoy: t.ventas > 0 ? (t.pauta / t.ventas) * 100 : null,
        pctPropuesto: t.ventas > 0 ? (t.pauta / t.ventas) * 100 : null,
        techo: t.techo,
        pautaMaxima: null,
        capitalInventario: 0,
        limite: "sin_datos",
        explicacion: t.pauta <= 0 ? "Sin pauta en la ventana: no hay cómo medir su respuesta; queda fuera del reparto." : "Sin pedidos o ventas en la ventana: queda fuera del reparto.",
      };
    }
    const p = P.get(t.unidadId)!;
    const ped = pedidosCon(t, p, e);
    const c = contribucionPorPedido(t);
    const ebitda = c * (ped - t.pedidos) - (p - t.pauta);
    const ticket = t.ventas / t.pedidos;
    const merc = t.mercancia / t.pedidos;
    const lim = limite.get(t.unidadId)!;
    const rHoy = retornoMarginal(t, t.pauta, e);
    const rFin = retornoMarginal(t, p, e);
    const max = tope.get(t.unidadId)!;
    const motivo =
      lim === "techo"
        ? `llega a su techo de pauta (${t.techo} % de las ventas, ${fmt(max)} al mes)`
        : lim === "retorno"
          ? "un dólar más ya no se paga (o rinde más en otra tienda)"
          : lim === "piso"
            ? `queda en su piso (${s.pisoPct} % de su pauta de hoy): ni su primer dólar se paga`
            : "se acabó el monto";
    return {
      unidadId: t.unidadId,
      nombre: t.nombre,
      pautaHoy: r2(t.pauta),
      pautaPropuesta: r2(p),
      cambio: r2(p - t.pauta),
      pedidosHoy: Math.round(t.pedidos),
      pedidosPropuestos: Math.round(ped),
      ebitdaIncremental: r2(ebitda),
      retornoHoy: rHoy,
      retornoFinal: rFin,
      pctHoy: (t.pauta / t.ventas) * 100,
      pctPropuesto: (p / (ticket * ped)) * 100,
      techo: t.techo,
      pautaMaxima: Number.isFinite(max) ? r2(max) : null,
      capitalInventario: r2(Math.max(ped - t.pedidos, 0) * merc * (s.diasInventario / 30)),
      limite: lim,
      explicacion:
        `Cada pedido deja ${fmt(c)} antes de pauta. Hoy el próximo dólar ${rHoy === null ? "no se puede medir" : rHoy >= 0 ? `deja ${pct(rHoy)} neto` : `pierde ${pct(-rHoy)}`}` +
        `; con ${fmt(p)} al mes ${rFin === null ? "" : rFin >= 0 ? `rinde ${pct(rFin)}` : `pierde ${pct(-rFin)}`} y ${motivo}.`,
    };
  });
  salida.sort((a, b) => b.cambio - a.cambio || a.nombre.localeCompare(b.nombre));
  const asignado = r2(salida.filter((x) => x.limite !== "sin_datos").reduce((a, x) => a + x.pautaPropuesta, 0));
  const ebitdaIncremental = r2(salida.reduce((a, x) => a + x.ebitdaIncremental, 0));
  return {
    tiendas: salida,
    monto: r2(monto),
    asignado,
    sinAsignar: r2(Math.max(monto - asignado, 0)),
    ebitdaIncremental,
    capitalInventario: r2(salida.reduce((a, x) => a + x.capitalInventario, 0)),
    valorCreado: multiplo === null ? null : r2(ebitdaIncremental * 12 * multiplo),
  };
}
