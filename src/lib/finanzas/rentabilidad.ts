// Rentabilidad por tienda y capital de trabajo (vista de CFO). Lógica pura: sirve en el servidor y en las pruebas
// (`rentabilidad.test.ts`). Junta dos fuentes por tienda y mes:
//   · Ventas por tienda (`ven_resumen_mensual`, 0122): órdenes, entregas, ventas entregadas, costo de la mercancía de lo
//     entregado y costo de envío de cada orden. Es lo devengado, orden por orden.
//   · El libro (`fin_rentabilidad_libro`, 0128, sobre `fin_eerr_mensual`): ingresos, costo de ventas partido en mercancía,
//     envío y otros costos de venta, marketing y administración (con A DISTRIBUIR ya repartido).
// Cada escalón de la cascada dice de qué fuente salió y si la otra fuente difiere más de la tolerancia.

import { MULTIPLO_EBITDA } from "./eerr";

// ---------------------------------------------------------------------------------------------
// Rubros del libro
// ---------------------------------------------------------------------------------------------

export type RubroCosto = "mercancia" | "envio" | "otros_variables";

const r2 = (n: number) => Math.round(n * 100) / 100;

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * En qué escalón cae un tipo de la sección «costo de ventas» del libro. La misma regla vive en la vista
 * `fin_rentabilidad_libro` (migración 0915): si cambias una, cambia la otra.
 */
export function rubroCostoVentas(nombreTipo: string): RubroCosto {
  const n = normalizar(nombreTipo);
  if (n.startsWith("shipping")) return "envio";
  if (n.includes("mercanc") || n === "costo de ventas" || n.startsWith("importacion") || n.startsWith("otros gastos de importacion")) {
    return "mercancia";
  }
  return "otros_variables";
}

// ---------------------------------------------------------------------------------------------
// Entradas
// ---------------------------------------------------------------------------------------------

/** Una tienda en un mes según el libro. Todo en positivo (lo que entró o se gastó). */
export interface LibroMes {
  periodo: string;
  unidad_id: string;
  ingresos: number;
  devoluciones: number;
  mercancia: number;
  envio: number;
  otros_variables: number;
  marketing: number;
  administracion: number;
}

/** Una tienda en un mes según Ventas por tienda. */
export interface VentasMes {
  periodo: string;
  unidad_id: string;
  ordenes: number;
  enviadas: number;
  entregadas: number;
  ventas_entregadas: number;
  costo_mercancia: number;
  costo_envio: number;
  lineas_producto: number;
  /** Líneas entregadas con costo (vigente o de la Matriz). */
  lineas_con_costo: number;
}

/** Una fila de `fin_eerr_mensual` con el nombre de su tipo (plan B si la vista `fin_rentabilidad_libro` no existe). */
export interface FilaEerrTipo {
  periodo: string;
  unidad_id: string;
  tipo: string;
  seccion: string;
  signo: number;
  monto: number;
}

/** Lo mismo que la vista `fin_rentabilidad_libro`, armado en JavaScript. */
export function libroDesdeEerr(filas: FilaEerrTipo[]): LibroMes[] {
  const mapa = new Map<string, LibroMes>();
  for (const f of filas) {
    const k = `${f.periodo}|${f.unidad_id}`;
    const x = mapa.get(k) ?? {
      periodo: f.periodo,
      unidad_id: f.unidad_id,
      ingresos: 0,
      devoluciones: 0,
      mercancia: 0,
      envio: 0,
      otros_variables: 0,
      marketing: 0,
      administracion: 0,
    };
    mapa.set(k, x);
    const gasto = -f.monto * f.signo;
    if (f.seccion === "ingresos") {
      if (f.signo > 0) x.ingresos += f.monto;
      else x.devoluciones += f.monto;
    } else if (f.seccion === "costo_ventas") x[rubroCostoVentas(f.tipo)] += gasto;
    else if (f.seccion === "marketing") x.marketing += gasto;
    else if (f.seccion === "administracion") x.administracion += gasto;
  }
  return [...mapa.values()].map((x) => ({
    ...x,
    ...Object.fromEntries(
      (["ingresos", "devoluciones", "mercancia", "envio", "otros_variables", "marketing", "administracion"] as const).map((c) => [c, r2(x[c])]),
    ),
  }));
}

/**
 * Las órdenes de una tienda solo cuentan como ventas propias si el libro le registra ingresos a esa tienda en algún mes:
 * una tienda que se opera para un tercero (su venta no es nuestra; lo que se cobra por el servicio entra a otra unidad)
 * no tiene ingresos propios en el libro y queda fuera de la cascada.
 */
export function ventasPropias(ventas: VentasMes[], libro: LibroMes[]): { propias: VentasMes[]; deTerceros: string[] } {
  const conIngresos = new Set(libro.filter((l) => l.ingresos > 0).map((l) => l.unidad_id));
  return {
    propias: ventas.filter((v) => conIngresos.has(v.unidad_id)),
    deTerceros: [...new Set(ventas.filter((v) => !conIngresos.has(v.unidad_id)).map((v) => v.unidad_id))],
  };
}

/** Debajo de esta parte de líneas con costo, el costo de la mercancía se toma del libro. */
export const COBERTURA_MINIMA = 0.8;
/** Dos fuentes «difieren» si se separan más de esta parte del mayor valor… */
export const TOLERANCIA_RELATIVA = 0.05;
/** …y más de estos dólares (para no marcar centavos en una tienda chica). */
export const TOLERANCIA_ABSOLUTA = 50;

export type Fuente = "ventas" | "libro" | "mixta" | "sin_datos";

export interface Escalon {
  valor: number;
  fuente: Fuente;
  /** Lo que dice la otra fuente, si tiene dato. */
  alterno: number | null;
  /** Meses en que las dos fuentes se separan más de la tolerancia. */
  mesesDifieren: number;
}

export interface Cascada {
  meses: number;
  ordenes: number;
  enviadas: number;
  entregadas: number;
  ventas: Escalon;
  mercancia: Escalon;
  otrosVariables: number;
  margenBruto: number;
  envio: Escalon;
  marketing: number;
  contribucion: number;
  administracion: number;
  ebitda: number;
}

export function difieren(a: number, b: number | null): boolean {
  if (b === null) return false;
  const dif = Math.abs(a - b);
  return dif > TOLERANCIA_ABSOLUTA && dif > TOLERANCIA_RELATIVA * Math.max(Math.abs(a), Math.abs(b));
}

const escalon = (valor: number, fuente: Fuente, alterno: number | null): Escalon => ({
  valor: r2(valor),
  fuente,
  alterno: alterno === null ? null : r2(alterno),
  mesesDifieren: difieren(valor, alterno) ? 1 : 0,
});

/** La cascada de una tienda en un mes, eligiendo la fuente de cada escalón. */
export function cascadaMes(v: VentasMes | null, l: LibroMes | null): Cascada {
  const ingresosLibro = l ? l.ingresos - l.devoluciones : null;
  const conVentas = !!v && v.ventas_entregadas > 0;

  const ventas = conVentas
    ? escalon(v!.ventas_entregadas, "ventas", ingresosLibro)
    : escalon(ingresosLibro ?? 0, l ? "libro" : "sin_datos", null);

  const cobertura = v && v.lineas_producto > 0 ? v.lineas_con_costo / v.lineas_producto : 0;
  const mercancia =
    conVentas && cobertura >= COBERTURA_MINIMA
      ? escalon(v!.costo_mercancia, "ventas", l ? l.mercancia : null)
      : escalon(l?.mercancia ?? 0, l ? "libro" : "sin_datos", v && v.costo_mercancia > 0 ? v.costo_mercancia : null);

  const envio =
    v && v.costo_envio > 0
      ? escalon(v.costo_envio, "ventas", l ? l.envio : null)
      : escalon(l?.envio ?? 0, l ? "libro" : "sin_datos", null);

  const otrosVariables = r2(l?.otros_variables ?? 0);
  const marketing = r2(l?.marketing ?? 0);
  const administracion = r2(l?.administracion ?? 0);
  const margenBruto = r2(ventas.valor - mercancia.valor - otrosVariables);
  const contribucion = r2(margenBruto - envio.valor - marketing);
  return {
    meses: 1,
    ordenes: v?.ordenes ?? 0,
    enviadas: v?.enviadas ?? 0,
    entregadas: v?.entregadas ?? 0,
    ventas,
    mercancia,
    otrosVariables,
    margenBruto,
    envio,
    marketing,
    contribucion,
    administracion,
    ebitda: r2(contribucion - administracion),
  };
}

const juntarFuente = (fs: Fuente[]): Fuente => {
  const con = [...new Set(fs.filter((f) => f !== "sin_datos"))];
  if (!con.length) return "sin_datos";
  return con.length === 1 ? con[0] : "mixta";
};

const sumarEscalones = (es: Escalon[]): Escalon => {
  const alternos = es.map((e) => e.alterno).filter((a): a is number => a !== null);
  return {
    valor: r2(es.reduce((a, e) => a + e.valor, 0)),
    fuente: juntarFuente(es.map((e) => e.fuente)),
    alterno: alternos.length ? r2(alternos.reduce((a, b) => a + b, 0)) : null,
    mesesDifieren: es.reduce((a, e) => a + e.mesesDifieren, 0),
  };
};

/** Suma cascadas (meses de una tienda, o tiendas de un período). La fuente queda «mixta» si se mezclan. */
export function sumarCascadas(cs: Cascada[]): Cascada {
  const s = (f: (c: Cascada) => number) => r2(cs.reduce((a, c) => a + f(c), 0));
  return {
    meses: cs.length ? Math.max(...cs.map((c) => c.meses)) : 0,
    ordenes: s((c) => c.ordenes),
    enviadas: s((c) => c.enviadas),
    entregadas: s((c) => c.entregadas),
    ventas: sumarEscalones(cs.map((c) => c.ventas)),
    mercancia: sumarEscalones(cs.map((c) => c.mercancia)),
    otrosVariables: s((c) => c.otrosVariables),
    margenBruto: s((c) => c.margenBruto),
    envio: sumarEscalones(cs.map((c) => c.envio)),
    marketing: s((c) => c.marketing),
    contribucion: s((c) => c.contribucion),
    administracion: s((c) => c.administracion),
    ebitda: s((c) => c.ebitda),
  };
}

/** Valor sobre las ventas de la cascada, en %, o null sin ventas. */
export const sobreVentas = (valor: number, c: Cascada): number | null => (c.ventas.valor > 0 ? (100 * valor) / c.ventas.valor : null);

/** Cada tienda y mes del período: una cascada por tienda (suma de sus meses) y por mes. */
export function cascadas(
  ventas: VentasMes[],
  libro: LibroMes[],
  meses: string[],
  unidades?: string[],
): { porTienda: Map<string, Cascada>; porMes: Map<string, Cascada>; porTiendaMes: Map<string, Cascada> } {
  const enVentana = new Set(meses);
  const filtro = unidades ? new Set(unidades) : null;
  const k = (p: string, u: string) => `${p}|${u}`;
  const v = new Map(ventas.filter((x) => enVentana.has(x.periodo)).map((x) => [k(x.periodo, x.unidad_id), x]));
  const l = new Map(libro.filter((x) => enVentana.has(x.periodo)).map((x) => [k(x.periodo, x.unidad_id), x]));
  const claves = [...new Set([...v.keys(), ...l.keys()])].filter((c) => !filtro || filtro.has(c.split("|")[1]));
  const porTiendaMes = new Map<string, Cascada>();
  for (const c of claves) porTiendaMes.set(c, cascadaMes(v.get(c) ?? null, l.get(c) ?? null));
  const agrupar = (llave: (c: string) => string) => {
    const g = new Map<string, Cascada[]>();
    for (const [c, x] of porTiendaMes) g.set(llave(c), [...(g.get(llave(c)) ?? []), x]);
    return new Map([...g].map(([id, xs]) => [id, sumarCascadas(xs)]));
  };
  const porTienda = agrupar((c) => c.split("|")[1]);
  const porMes = agrupar((c) => c.split("|")[0]);
  // En una tienda, «meses» es cuántos meses del período tienen datos; en un mes, siempre 1.
  for (const [id, x] of porTienda) x.meses = claves.filter((c) => c.endsWith(`|${id}`)).length;
  for (const x of porMes.values()) x.meses = 1;
  return { porTienda, porMes, porTiendaMes };
}

// ---------------------------------------------------------------------------------------------
// Economía unitaria
// ---------------------------------------------------------------------------------------------

export interface Economia {
  ordenes: number;
  entregadas: number;
  tasaEntrega: number | null;
  ticket: number | null;
  /** Envío y delivery ÷ órdenes enviadas. */
  costoEnvioPorEnviada: number | null;
  /** Marketing ÷ entregadas (sustituto del CAC). */
  marketingPorEntregada: number | null;
  contribucionPorEntregada: number | null;
  /** Administración repartida por mes. */
  fijosMes: number;
  entregadasMes: number;
  /** Entregadas por mes que cubren los gastos fijos; null si cada entrega no deja contribución. */
  equilibrioMes: number | null;
}

const div = (a: number, b: number) => (b > 0 ? a / b : null);

export function economia(c: Cascada): Economia {
  const meses = Math.max(c.meses, 1);
  const contribucionPorEntregada = div(c.contribucion, c.entregadas);
  const fijosMes = c.administracion / meses;
  return {
    ordenes: c.ordenes,
    entregadas: c.entregadas,
    tasaEntrega: div(c.entregadas, c.enviadas),
    ticket: div(c.ventas.valor, c.entregadas),
    costoEnvioPorEnviada: div(c.envio.valor, c.enviadas),
    marketingPorEntregada: div(c.marketing, c.entregadas),
    contribucionPorEntregada,
    fijosMes,
    entregadasMes: c.entregadas / meses,
    equilibrioMes: contribucionPorEntregada !== null && contribucionPorEntregada > 0 ? fijosMes / contribucionPorEntregada : null,
  };
}

// ---------------------------------------------------------------------------------------------
// Palancas de valor (regla AF4: impacto en EBITDA anual y en valor de empresa)
// ---------------------------------------------------------------------------------------------

export type ClavePalanca = "tasa_entrega" | "costo_envio" | "marketing" | "ticket";

export const PALANCAS: { clave: ClavePalanca; etiqueta: string }[] = [
  { clave: "tasa_entrega", etiqueta: "+1 punto de tasa de entrega" },
  { clave: "costo_envio", etiqueta: "−5 % de costo de envío por orden" },
  { clave: "marketing", etiqueta: "−10 % de marketing por orden entregada" },
  { clave: "ticket", etiqueta: "+5 % de ticket promedio" },
];

export interface Palanca {
  clave: ClavePalanca;
  etiqueta: string;
  ebitdaAnual: number;
  valorEmpresa: number;
}

/**
 * Cuánto EBITDA anual suma cada palanca, con todo lo demás igual:
 *   · tasa de entrega: 1 % más de las enviadas se entrega; cada una deja su margen bruto por entrega (el envío y el
 *     marketing ya se pagaron igual);
 *   · envío: −5 % del costo de envío;
 *   · marketing: −10 % del gasto, con las mismas entregas;
 *   · ticket: +5 % de las ventas con el mismo costo (supone que el volumen no cae).
 * Se anualiza con los meses con datos del período y el valor es EBITDA × múltiplo.
 */
export function palancas(c: Cascada, multiplo = MULTIPLO_EBITDA): Palanca[] {
  const anual = 12 / Math.max(c.meses, 1);
  const margenPorEntrega = c.entregadas > 0 ? c.margenBruto / c.entregadas : 0;
  const delta: Record<ClavePalanca, number> = {
    tasa_entrega: c.enviadas > 0 && c.entregadas > 0 ? Math.max(c.enviadas * 0.01 * margenPorEntrega, 0) : 0,
    costo_envio: c.envio.valor * 0.05,
    marketing: c.marketing * 0.1,
    ticket: c.entregadas > 0 ? c.ventas.valor * 0.05 : 0,
  };
  return PALANCAS.map(({ clave, etiqueta }) => {
    const ebitdaAnual = r2(delta[clave] * anual);
    return { clave, etiqueta, ebitdaAnual, valorEmpresa: r2(ebitdaAnual * multiplo) };
  });
}

export interface FilaPalanca extends Palanca {
  unidad_id: string;
}

/** Todas las palancas de todas las tiendas, de la que más valor crea a la que menos (sin las que no mueven nada). */
export function ordenarPalancas(porTienda: Map<string, Cascada>, multiplo = MULTIPLO_EBITDA): FilaPalanca[] {
  return [...porTienda]
    .flatMap(([unidad_id, c]) => palancas(c, multiplo).map((p) => ({ ...p, unidad_id })))
    .filter((p) => p.valorEmpresa > 0)
    .sort((a, b) => b.valorEmpresa - a.valorEmpresa || a.unidad_id.localeCompare(b.unidad_id));
}

// ---------------------------------------------------------------------------------------------
// Capital de trabajo y ciclo de conversión de caja
// ---------------------------------------------------------------------------------------------

/** Días de un mes (AAAA-MM-01). */
export function diasDelMes(periodo: string): number {
  const anio = Number(periodo.slice(0, 4));
  const mes = Number(periodo.slice(5, 7));
  return new Date(Date.UTC(anio, mes, 0)).getUTCDate();
}

export interface BaseDiaria {
  dias: number;
  meses: string[];
  ventasDia: number | null;
  costoDia: number | null;
}

/**
 * Ventas y costo de ventas (mercancía + otros costos de venta) por día de los meses dados, de las cascadas por mes de
 * todas las tiendas. Con 3 meses cerrados es la base de 90 días.
 */
export function baseDiaria(porMes: Map<string, Cascada>, meses: string[]): BaseDiaria {
  const usados = meses.filter((m) => porMes.has(m));
  const dias = usados.reduce((a, m) => a + diasDelMes(m), 0);
  const ventas = usados.reduce((a, m) => a + porMes.get(m)!.ventas.valor, 0);
  const costo = usados.reduce((a, m) => a + porMes.get(m)!.mercancia.valor + porMes.get(m)!.otrosVariables, 0);
  return { dias, meses: usados, ventasDia: dias && ventas > 0 ? ventas / dias : null, costoDia: dias && costo > 0 ? costo / dias : null };
}

export interface Saldos {
  cxcCartera: number;
  /** Cobros contra entrega (Yappy, MiPOS, Servientrega) sin depósito confirmado + efectivo de repartidores sin rendir. */
  cobrosPorDepositar: number;
  efectivoRepartidores: number;
  cxpCartera: number;
  comprasAbiertas: number;
  /** Stock físico × costo vigente; null si no hay stock cargado. */
  inventario: number | null;
}

export interface Capital {
  porCobrar: number;
  porPagar: number;
  dso: number | null;
  dpo: number | null;
  dio: number | null;
  /** DIO + DSO − DPO; null si falta alguno. */
  ccc: number | null;
  /** DSO − DPO, para leer el ciclo cuando falta el inventario. */
  cccSinInventario: number | null;
  /** Capital de trabajo operativo: por cobrar + inventario − por pagar. */
  capitalOperativo: number;
}

const dias = (saldo: number, porDia: number | null) => (porDia ? saldo / porDia : null);

export function capitalTrabajo(s: Saldos, base: BaseDiaria): Capital {
  const porCobrar = s.cxcCartera + s.cobrosPorDepositar + s.efectivoRepartidores;
  const porPagar = s.cxpCartera + s.comprasAbiertas;
  const dso = dias(porCobrar, base.ventasDia);
  const dpo = dias(porPagar, base.costoDia);
  const dio = s.inventario === null ? null : dias(s.inventario, base.costoDia);
  return {
    porCobrar: r2(porCobrar),
    porPagar: r2(porPagar),
    dso,
    dpo,
    dio,
    ccc: dso !== null && dpo !== null && dio !== null ? dio + dso - dpo : null,
    cccSinInventario: dso !== null && dpo !== null ? dso - dpo : null,
    capitalOperativo: r2(porCobrar + (s.inventario ?? 0) - porPagar),
  };
}

export interface CarteraMes {
  periodo: string;
  cxc: number;
  cxp: number;
}

export interface PuntoCapital {
  periodo: string;
  cxc: number;
  cxp: number;
  dso: number | null;
  dpo: number | null;
}

/**
 * DSO y DPO de cada mes con la cartera al cierre del mes y la base de los 3 meses que terminan en él (solo cartera: el
 * inventario y lo cobrado contra entrega no tienen historia).
 */
export function evolucionCapital(porMes: Map<string, Cascada>, cartera: CarteraMes[], meses: string[]): PuntoCapital[] {
  const enCartera = new Map(cartera.map((c) => [c.periodo, c]));
  return meses
    .filter((m) => porMes.has(m) && enCartera.has(m))
    .map((m) => {
      const i = meses.indexOf(m);
      const base = baseDiaria(porMes, meses.slice(Math.max(0, i - 2), i + 1));
      const c = enCartera.get(m)!;
      return { periodo: m, cxc: c.cxc, cxp: c.cxp, dso: dias(c.cxc, base.ventasDia), dpo: dias(c.cxp, base.costoDia) };
    });
}

// ---------------------------------------------------------------------------------------------
// Período elegido
// ---------------------------------------------------------------------------------------------

export interface Periodo {
  clave: string;
  etiqueta: string;
  meses: string[];
}

export const ULTIMOS_3 = "u3";
export const ULTIMOS_12 = "u12";

/**
 * El período de la página: un mes (`AAAA-MM-01`), los últimos 3 o los últimos 12 meses **cerrados** con datos (sin el
 * mes en curso). Sin elección, o con una que no existe, los últimos 3.
 */
export function elegirPeriodo(param: string | undefined, conDatos: string[], mesEnCurso: string): Periodo {
  const ordenados = [...new Set(conDatos)].sort();
  const cerrados = ordenados.filter((m) => m < mesEnCurso);
  const base = cerrados.length ? cerrados : ordenados;
  if (param && ordenados.includes(param)) return { clave: param, etiqueta: param, meses: [param] };
  if (param === ULTIMOS_12) return { clave: ULTIMOS_12, etiqueta: "Últimos 12 meses", meses: base.slice(-12) };
  return { clave: ULTIMOS_3, etiqueta: "Últimos 3 meses", meses: base.slice(-3) };
}
