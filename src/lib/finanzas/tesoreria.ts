// Portal AF4 360° › Tesorería (/tesoreria). Lógica pura: saldos bancarios diarios por cuenta, posición de caja del día,
// seguimiento del saldo de Dropi (cuándo conviene pedir un retiro), efectivo en manos de repartidores (antigüedad y
// depósitos faltantes), comisiones y costo de cobrar por medio de pago, pedidos de Dropi en tránsito como ingreso
// esperado y las alertas de la página. Los datos los lee `cargar-tesoreria.ts` (migración 0931); prueba en
// `tesoreria.test.ts`.

const r2 = (v: number) => Math.round(v * 100) / 100;
const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

const aFecha = (f: string) => Date.parse(`${f.slice(0, 10)}T00:00:00Z`);
export const diasEntre = (a: string, b: string) => Math.round((aFecha(b) - aFecha(a)) / 86_400_000);
export function sumarDias(f: string, n: number): string {
  return new Date(aFecha(f) + n * 86_400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------------
// Ajustes (fin_config, clave `tesoreria`)
// ---------------------------------------------------------------------------------------------

export interface ConfigTesoreria {
  /** Saldo de la wallet de Dropi desde el que conviene pedir un retiro (USD). */
  dropiUmbral: number;
  /** Días desde el último retiro pedido que ya justifican otro (si hay saldo). */
  dropiDias: number;
  /** Días con efectivo en manos de un repartidor que encienden la alerta. */
  efectivoDias: number;
  /** Días desde el último saldo de una cuenta para darlo por viejo. */
  saldoDias: number;
  /** Días antes de la renovación de una línea de crédito para avisar. */
  lineaDias: number;
  /** Diferencia que se tolera entre lo cobrado y lo depositado por un repartidor (USD). */
  toleranciaDeposito: number;
}

export const CONFIG_TESORERIA_POR_DEFECTO: ConfigTesoreria = {
  dropiUmbral: 500,
  dropiDias: 7,
  efectivoDias: 7,
  saldoDias: 3,
  lineaDias: 30,
  toleranciaDeposito: 1,
};

const LIMITES: Record<keyof ConfigTesoreria, [number, number]> = {
  dropiUmbral: [0, 10_000_000],
  dropiDias: [1, 120],
  efectivoDias: [1, 90],
  saldoDias: [1, 60],
  lineaDias: [1, 365],
  toleranciaDeposito: [0, 1_000],
};

export const CLAVES_CONFIG_TESORERIA = Object.keys(LIMITES) as (keyof ConfigTesoreria)[];

const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(/[$\s,]/g, "")) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Lee lo guardado (o lo que llega del formulario): cada valor fuera de su rango vuelve al de por defecto. */
export function leerConfigTesoreria(v: unknown): ConfigTesoreria {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const salida = { ...CONFIG_TESORERIA_POR_DEFECTO };
  for (const k of CLAVES_CONFIG_TESORERIA) {
    const n = numero(o[k]);
    const [min, max] = LIMITES[k];
    if (n !== null && n >= min && n <= max) salida[k] = k === "dropiUmbral" || k === "toleranciaDeposito" ? r2(n) : Math.round(n);
  }
  return salida;
}

// ---------------------------------------------------------------------------------------------
// Saldos bancarios diarios
// ---------------------------------------------------------------------------------------------

export interface PuntoSaldo {
  cuentaId: string;
  fecha: string;
  saldo: number;
  origen: "manual" | "extracto";
}

export interface CuentaTesoreria {
  id: string;
  nombre: string;
  clase: string;
  moneda: string;
}

/** El último saldo de cada cuenta (con su fecha y su origen). */
export function ultimosSaldos(puntos: PuntoSaldo[]): Map<string, PuntoSaldo> {
  const m = new Map<string, PuntoSaldo>();
  for (const p of puntos) {
    const a = m.get(p.cuentaId);
    if (!a || p.fecha > a.fecha || (p.fecha === a.fecha && p.origen === "manual")) m.set(p.cuentaId, p);
  }
  return m;
}

/** Los días de `desde` a `hasta` (inclusive). */
export function dias(desde: string, hasta: string): string[] {
  const salida: string[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) salida.push(f);
  return salida;
}

/**
 * La serie diaria de una cuenta: cada día con dato toma su saldo (manda el manual si hay dos) y los días sin dato
 * arrastran el anterior (también el último antes de `desde`). Antes del primer dato, null.
 */
export function serieDiaria(puntos: PuntoSaldo[], desde: string, hasta: string): (number | null)[] {
  const porDia = new Map<string, PuntoSaldo>();
  let previo: PuntoSaldo | null = null;
  for (const p of puntos) {
    if (p.fecha < desde) {
      if (!previo || p.fecha > previo.fecha || (p.fecha === previo.fecha && p.origen === "manual")) previo = p;
      continue;
    }
    const a = porDia.get(p.fecha);
    if (!a || p.origen === "manual") porDia.set(p.fecha, p);
  }
  let actual: number | null = previo ? previo.saldo : null;
  return dias(desde, hasta).map((d) => {
    const p = porDia.get(d);
    if (p) actual = p.saldo;
    return actual;
  });
}

/** Las cuentas que entran a la posición de caja: bancos y billeteras (las tarjetas son deuda, no caja). */
export const esCuentaDeCaja = (c: Pick<CuentaTesoreria, "clase">) => c.clase === "banco" || c.clase === "billetera";
const esYappy = (c: Pick<CuentaTesoreria, "nombre" | "clase">) => c.clase === "billetera" || /yappy/i.test(c.nombre);

// ---------------------------------------------------------------------------------------------
// Posición de caja del día
// ---------------------------------------------------------------------------------------------

export type ClavePosicion = "bancos" | "yappy" | "repartidores" | "dropi_wallet" | "dropi_retiros";

export interface PartidaPosicion {
  clave: ClavePosicion;
  etiqueta: string;
  monto: number;
  /** De qué día es el dato (el más viejo si junta varias cuentas); null = sin dato. */
  fecha: string | null;
  /** Días desde ese dato hasta hoy. */
  antiguedad: number | null;
  detalle: { etiqueta: string; monto: number; fecha: string | null }[];
  href: string;
}

export interface DatosPosicion {
  hoy: string;
  cuentas: CuentaTesoreria[];
  saldos: Map<string, PuntoSaldo>;
  /** Cobros de Yappy que todavía no llegan al banco (neto). */
  yappyPorLiquidar: { monto: number; fecha: string | null } | null;
  /** Efectivo en manos de repartidores sin rendir. */
  efectivoRepartidores: { monto: number; fecha: string | null } | null;
  dropiWallet: { monto: number; fecha: string } | null;
  dropiRetiros: { monto: number; fecha: string | null; cantidad: number } | null;
}

export interface Posicion {
  partidas: PartidaPosicion[];
  total: number;
  /** El dato más viejo de los que suman. */
  fechaMasVieja: string | null;
}

export function posicionCaja(d: DatosPosicion): Posicion {
  const ant = (f: string | null) => (f ? Math.max(diasEntre(f, d.hoy), 0) : null);
  const masVieja = (fs: (string | null)[]) => fs.filter((f): f is string => !!f).sort()[0] ?? null;
  const partidas: PartidaPosicion[] = [];
  const conSaldo = d.cuentas.filter((c) => esCuentaDeCaja(c) && d.saldos.has(c.id));
  const bancos = conSaldo.filter((c) => !esYappy(c));
  const billeteras = conSaldo.filter(esYappy);
  const det = (cs: CuentaTesoreria[]): PartidaPosicion["detalle"] => cs.map((c) => ({ etiqueta: c.nombre, monto: d.saldos.get(c.id)!.saldo, fecha: d.saldos.get(c.id)!.fecha }));
  if (bancos.length) {
    const detalle = det(bancos);
    const fecha = masVieja(detalle.map((x) => x.fecha));
    partidas.push({ clave: "bancos", etiqueta: "Bancos", monto: r2(suma(detalle.map((x) => x.monto))), fecha, antiguedad: ant(fecha), detalle, href: "/tesoreria/saldos" });
  }
  if (billeteras.length || (d.yappyPorLiquidar && d.yappyPorLiquidar.monto > 0)) {
    const detalle = det(billeteras);
    if (d.yappyPorLiquidar && d.yappyPorLiquidar.monto > 0) detalle.push({ etiqueta: "Yappy por liquidar", monto: d.yappyPorLiquidar.monto, fecha: d.yappyPorLiquidar.fecha });
    const fecha = masVieja(detalle.map((x) => x.fecha));
    partidas.push({ clave: "yappy", etiqueta: "Yappy", monto: r2(suma(detalle.map((x) => x.monto))), fecha, antiguedad: ant(fecha), detalle, href: "/conciliacion-bancaria/cobros" });
  }
  if (d.efectivoRepartidores) {
    const { monto, fecha } = d.efectivoRepartidores;
    partidas.push({ clave: "repartidores", etiqueta: "Efectivo en repartidores", monto: r2(monto), fecha, antiguedad: ant(fecha), detalle: [], href: "/tesoreria/repartidores" });
  }
  if (d.dropiWallet) {
    partidas.push({ clave: "dropi_wallet", etiqueta: "Wallet de Dropi", monto: r2(d.dropiWallet.monto), fecha: d.dropiWallet.fecha, antiguedad: ant(d.dropiWallet.fecha), detalle: [], href: "/tesoreria#dropi" });
  }
  if (d.dropiRetiros && d.dropiRetiros.monto > 0) {
    partidas.push({
      clave: "dropi_retiros",
      etiqueta: "Retiros de Dropi en camino",
      monto: r2(d.dropiRetiros.monto),
      fecha: d.dropiRetiros.fecha,
      antiguedad: ant(d.dropiRetiros.fecha),
      detalle: [],
      href: "/retiros",
    });
  }
  return { partidas, total: r2(suma(partidas.map((p) => p.monto))), fechaMasVieja: masVieja(partidas.map((p) => p.fecha)) };
}

// ---------------------------------------------------------------------------------------------
// Dropi: saldo de la wallet y cuándo pedir un retiro
// ---------------------------------------------------------------------------------------------

export interface DatosDropi {
  hoy: string;
  /** Saldos de la wallet registrados (cualquier orden). */
  saldos: { fecha: string; monto: number }[];
  /** Retiros pedidos (fecha del pedido y estado propio). */
  retiros: { fecha: string; estado: string; monto: number; aRecibir: number }[];
}

export type MotivoRetiro = "umbral" | "dias";

export interface SeguimientoDropi {
  saldo: number | null;
  fechaSaldo: string | null;
  diasDesdeSaldo: number | null;
  ultimoRetiro: string | null;
  diasDesdeRetiro: number | null;
  abiertos: number;
  enCamino: number;
  /** Conviene pedir un retiro hoy, y por qué. */
  pedir: boolean;
  motivos: MotivoRetiro[];
}

const ESTADOS_EN_CAMINO = ["abierto", "novedad"];

export function seguimientoDropi(d: DatosDropi, c: Pick<ConfigTesoreria, "dropiUmbral" | "dropiDias">): SeguimientoDropi {
  const ultimoSaldo = [...d.saldos].sort((a, b) => b.fecha.localeCompare(a.fecha))[0] ?? null;
  const pedidos = d.retiros.filter((r) => r.estado !== "cancelado").map((r) => r.fecha).sort();
  const ultimoRetiro = pedidos.at(-1) ?? null;
  const abiertos = d.retiros.filter((r) => ESTADOS_EN_CAMINO.includes(r.estado));
  const saldo = ultimoSaldo ? r2(ultimoSaldo.monto) : null;
  const diasDesdeRetiro = ultimoRetiro ? Math.max(diasEntre(ultimoRetiro, d.hoy), 0) : null;
  const motivos: MotivoRetiro[] = [];
  if (saldo !== null && saldo > 0) {
    if (saldo >= c.dropiUmbral) motivos.push("umbral");
    if (diasDesdeRetiro === null || diasDesdeRetiro >= c.dropiDias) motivos.push("dias");
  }
  return {
    saldo,
    fechaSaldo: ultimoSaldo?.fecha ?? null,
    diasDesdeSaldo: ultimoSaldo ? Math.max(diasEntre(ultimoSaldo.fecha, d.hoy), 0) : null,
    ultimoRetiro,
    diasDesdeRetiro,
    abiertos: abiertos.length,
    enCamino: r2(suma(abiertos.map((r) => r.aRecibir || r.monto))),
    pedir: motivos.length > 0,
    motivos,
  };
}

// ---------------------------------------------------------------------------------------------
// Efectivo de repartidores: depósitos frente a lo cobrado, y su antigüedad
// ---------------------------------------------------------------------------------------------

/** Una semana de cierre (jueves a miércoles) de un repartidor, como la devuelve `fin_tesoreria_depositos`. */
export interface SemanaRepartidor {
  repartidorId: string;
  repartidor: string;
  /** Jueves. */
  semana: string;
  primeraFecha: string;
  cobrado: number;
  depositadoBanco: number;
  cierreEstado: string | null;
  aPagar: number | null;
  adelantos: number;
  descuentos: number;
  rendicionRecibo: number | null;
}

export type EstadoDeposito = "en_curso" | "completo" | "incompleto" | "faltante";

export interface DepositoRepartidor extends SemanaRepartidor {
  /** Lo que se quedó como pago de su cierre (cerrado o pagado). */
  compensado: number;
  /** Lo que debía entregar: cobrado − compensado. */
  esperado: number;
  /** Lo que llegó: depósito al banco o rendición del recibo (el mayor; son el mismo dinero). */
  rendido: number;
  faltante: number;
  estado: EstadoDeposito;
  /** Días desde el primer cobro de la semana hasta hoy (si falta algo). */
  antiguedad: number;
}

/**
 * Cuánto falta rendir de cada semana. Un cierre cerrado o pagado compensa lo que se le debía pagar (a pagar − adelantos −
 * descuentos) con el efectivo que tenía; el resto lo debía depositar. La semana sigue «en curso» hasta el miércoles.
 */
export function depositosRepartidores(semanas: SemanaRepartidor[], hoy: string, tolerancia = CONFIG_TESORERIA_POR_DEFECTO.toleranciaDeposito): DepositoRepartidor[] {
  return semanas
    .map((s) => {
      const cerrado = s.cierreEstado === "cerrado" || s.cierreEstado === "pagado";
      const compensado = cerrado ? r2(Math.min(s.cobrado, Math.max((s.aPagar ?? 0) - s.adelantos - s.descuentos, 0))) : 0;
      const esperado = r2(Math.max(s.cobrado - compensado, 0));
      const rendido = r2(Math.max(s.depositadoBanco, s.rendicionRecibo ?? 0));
      const faltante = r2(Math.max(esperado - rendido, 0));
      const terminada = hoy > sumarDias(s.semana, 6);
      const estado: EstadoDeposito =
        faltante <= tolerancia ? "completo" : !terminada ? "en_curso" : rendido > tolerancia ? "incompleto" : "faltante";
      return { ...s, compensado, esperado, rendido, faltante: estado === "completo" ? 0 : faltante, estado, antiguedad: Math.max(diasEntre(s.primeraFecha, hoy), 0) };
    })
    .sort((a, b) => b.faltante - a.faltante || a.semana.localeCompare(b.semana));
}

export const TRAMOS_ANTIGUEDAD = [
  { clave: "0-3", etiqueta: "0 a 3 días", hasta: 3 },
  { clave: "4-7", etiqueta: "4 a 7 días", hasta: 7 },
  { clave: "8-14", etiqueta: "8 a 14 días", hasta: 14 },
  { clave: "15+", etiqueta: "15 días o más", hasta: Number.POSITIVE_INFINITY },
] as const;

export interface AntiguedadRepartidor {
  repartidorId: string;
  repartidor: string;
  total: number;
  tramos: Record<(typeof TRAMOS_ANTIGUEDAD)[number]["clave"], number>;
  masViejo: number;
  /** Desde qué día tiene efectivo sin rendir. */
  desde: string;
  alerta: boolean;
}

/** El efectivo sin rendir de cada repartidor por antigüedad (alerta desde `diasAlerta`). */
export function antiguedadEfectivo(depositos: DepositoRepartidor[], diasAlerta = CONFIG_TESORERIA_POR_DEFECTO.efectivoDias): AntiguedadRepartidor[] {
  const porRep = new Map<string, AntiguedadRepartidor>();
  for (const d of depositos) {
    if (d.faltante <= 0) continue;
    const a =
      porRep.get(d.repartidorId) ??
      ({ repartidorId: d.repartidorId, repartidor: d.repartidor, total: 0, tramos: { "0-3": 0, "4-7": 0, "8-14": 0, "15+": 0 }, masViejo: 0, desde: d.primeraFecha, alerta: false } as AntiguedadRepartidor);
    a.total = r2(a.total + d.faltante);
    const tramo = TRAMOS_ANTIGUEDAD.find((t) => d.antiguedad <= t.hasta)!;
    a.tramos[tramo.clave] = r2(a.tramos[tramo.clave] + d.faltante);
    a.masViejo = Math.max(a.masViejo, d.antiguedad);
    if (d.primeraFecha < a.desde) a.desde = d.primeraFecha;
    a.alerta = a.masViejo >= diasAlerta;
    porRep.set(d.repartidorId, a);
  }
  return [...porRep.values()].sort((a, b) => Number(b.alerta) - Number(a.alerta) || b.total - a.total);
}

// ---------------------------------------------------------------------------------------------
// Comisiones y costo de cobrar
// ---------------------------------------------------------------------------------------------

export interface FilaComision {
  mes: string;
  fuente: "libro" | "banco" | "pasarela";
  concepto: string;
  monto: number;
}

const ETIQUETA_CONCEPTO_COMISION: Record<string, string> = {
  comision_bancaria: "Comisiones bancarias",
  comision_yappy: "Comisión de Yappy (banco)",
  yappy: "Yappy",
  mipos: "MiPOS (tarjeta)",
  servientrega: "Servientrega (contra entrega)",
};
export const etiquetaComision = (c: string) => ETIQUETA_CONCEPTO_COMISION[c] ?? c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();

export const FUENTES_COMISION = [
  { clave: "libro", etiqueta: "Según el libro" },
  { clave: "banco", etiqueta: "Según los extractos" },
  { clave: "pasarela", etiqueta: "Según las pasarelas" },
] as const;

/** Por fuente y concepto, un valor por mes (en el orden de `meses`). */
export function comisionesPorMes(filas: FilaComision[], meses: string[]): { fuente: FilaComision["fuente"]; concepto: string; valores: number[] }[] {
  const idx = new Map(meses.map((m, i) => [m, i]));
  const m = new Map<string, { fuente: FilaComision["fuente"]; concepto: string; valores: number[] }>();
  for (const f of filas) {
    const i = idx.get(f.mes.slice(0, 10));
    if (i === undefined) continue;
    const k = `${f.fuente}|${f.concepto}`;
    const x = m.get(k) ?? { fuente: f.fuente, concepto: f.concepto, valores: meses.map(() => 0) };
    x.valores[i] = r2(x.valores[i] + f.monto);
    m.set(k, x);
  }
  const orden = FUENTES_COMISION.map((x) => x.clave as string);
  return [...m.values()].sort((a, b) => orden.indexOf(a.fuente) - orden.indexOf(b.fuente) || suma(b.valores) - suma(a.valores));
}

export interface FilaCostoCobro {
  mes: string;
  metodo: string;
  ordenes: number;
  ventas: number;
  comision: number;
}

export const MEDIOS_COBRO = [
  { clave: "yappy", etiqueta: "Yappy", metodos: ["yappy"] },
  { clave: "tarjeta", etiqueta: "Tarjeta", metodos: ["tarjeta"] },
  { clave: "contra_entrega", etiqueta: "Contra entrega", metodos: ["efectivo", "servientrega"] },
  { clave: "transferencia", etiqueta: "Transferencia", metodos: ["transferencia", "previo_pago"] },
] as const;
export type MedioCobro = (typeof MEDIOS_COBRO)[number]["clave"];

export interface CostoMedio {
  medio: MedioCobro;
  etiqueta: string;
  ventas: number[];
  costo: number[];
  /** Costo ÷ ventas × 100 por mes (null sin ventas). */
  pct: (number | null)[];
  ventasTotal: number;
  costoTotal: number;
  pctTotal: number | null;
}

/**
 * Lo que cuesta cobrar por cada medio, por mes: lo que se quedó la pasarela sobre lo vendido por ese medio. La comisión de
 * Yappy se toma de los cobros de Yappy y, si ese mes no la traen, de las líneas «comisión Yappy» del banco (son la misma
 * comisión vista en dos lugares: no se suman). Contra entrega = efectivo de repartidores + Servientrega (su comisión).
 */
export function costoCobroPorMedio(filas: FilaCostoCobro[], meses: string[]): CostoMedio[] {
  const idx = new Map(meses.map((m, i) => [m, i]));
  const ventas = new Map<string, number[]>();
  const comision = new Map<string, number[]>();
  const sumar = (m: Map<string, number[]>, k: string, i: number, v: number) => {
    const x = m.get(k) ?? meses.map(() => 0);
    x[i] = r2(x[i] + v);
    m.set(k, x);
  };
  for (const f of filas) {
    const i = idx.get(f.mes.slice(0, 10));
    if (i === undefined) continue;
    if (f.ventas) sumar(ventas, f.metodo, i, f.ventas);
    if (f.comision) sumar(comision, f.metodo, i, f.comision);
  }
  const yappyBanco = comision.get("yappy_banco");
  if (yappyBanco) {
    const y = comision.get("yappy") ?? meses.map(() => 0);
    comision.set("yappy", y.map((v, i) => (v > 0 ? v : yappyBanco[i])));
  }
  return MEDIOS_COBRO.map((m) => {
    const v = meses.map((_, i) => r2(suma(m.metodos.map((x) => ventas.get(x)?.[i] ?? 0))));
    const c = meses.map((_, i) => r2(suma(m.metodos.map((x) => comision.get(x)?.[i] ?? 0))));
    const vt = r2(suma(v));
    const ct = r2(suma(c));
    return {
      medio: m.clave,
      etiqueta: m.etiqueta,
      ventas: v,
      costo: c,
      pct: v.map((x, i) => (x > 0 ? Math.round((c[i] / x) * 10_000) / 100 : null)),
      ventasTotal: vt,
      costoTotal: ct,
      pctTotal: vt > 0 ? Math.round((ct / vt) * 10_000) / 100 : null,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Pedidos de Dropi en tránsito como ingreso esperado
// ---------------------------------------------------------------------------------------------

export interface HistoriaDropi {
  entregados: number;
  devueltos: number;
  montoEntregados: number;
  conGanancia: number;
  montoConGanancia: number;
  ganancia: number;
  diasAGanancia: number | null;
}

export interface SupuestoTransito {
  tasaEntrega: number;
  /** Lo que Dropi acredita por cada dólar de pedido entregado. */
  netoSobreVenta: number;
  diasAGanancia: number;
}

/** Con menos que esto de historia no se proyecta (no hay de dónde sacar la tasa ni el neto). */
export const MINIMO_HISTORIA_TRANSITO = 20;

export function supuestoTransito(h: HistoriaDropi | null): SupuestoTransito | null {
  if (!h || h.entregados + h.devueltos < MINIMO_HISTORIA_TRANSITO || h.conGanancia < 5 || h.montoConGanancia <= 0) return null;
  return {
    tasaEntrega: Math.round((h.entregados / (h.entregados + h.devueltos)) * 10_000) / 10_000,
    netoSobreVenta: Math.round((h.ganancia / h.montoConGanancia) * 10_000) / 10_000,
    diasAGanancia: h.diasAGanancia === null ? 7 : Math.min(Math.max(h.diasAGanancia, 0), 45),
  };
}

/**
 * Lo que se espera cobrar de los pedidos despachados sin entregar: monto × tasa de entrega × neto, en la fecha en que
 * Dropi suele acreditar (pedido + días a la ganancia, como pronto hoy) más los días de un retiro hasta el banco.
 */
export function ingresosTransito(pedidos: { fecha: string; pedidos: number; monto: number }[], s: SupuestoTransito, diasRetiro: number, hoy: string): { fecha: string; monto: number; pedidos: number }[] {
  const porFecha = new Map<string, { monto: number; pedidos: number }>();
  for (const p of pedidos) {
    const acreditado = sumarDias(p.fecha, Math.round(s.diasAGanancia));
    const fecha = sumarDias(acreditado < hoy ? hoy : acreditado, Math.round(diasRetiro));
    const x = porFecha.get(fecha) ?? { monto: 0, pedidos: 0 };
    x.monto += p.monto * s.tasaEntrega * s.netoSobreVenta;
    x.pedidos += p.pedidos;
    porFecha.set(fecha, x);
  }
  return [...porFecha.entries()].map(([fecha, x]) => ({ fecha, monto: r2(x.monto), pedidos: x.pedidos })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}

// ---------------------------------------------------------------------------------------------
// Alertas de la página
// ---------------------------------------------------------------------------------------------

export type SeveridadTesoreria = "critica" | "aviso" | "info";

export interface AlertaTesoreria {
  clave: string;
  severidad: SeveridadTesoreria;
  titulo: string;
  mensaje: string;
  href: string;
}

export interface DatosAlertasTesoreria {
  hoy: string;
  config: ConfigTesoreria;
  dropi: SeguimientoDropi | null;
  antiguedad: AntiguedadRepartidor[] | null;
  depositos: DepositoRepartidor[] | null;
  saldosViejos: { cuenta: string; fecha: string }[];
  lineas: { nombre: string; alertas: ("vencida" | "renovacion" | "uso_alto")[]; diasParaRenovar: number | null; uso: number }[];
  porAprobar: number;
}

const PESO: Record<SeveridadTesoreria, number> = { critica: 0, aviso: 1, info: 2 };

/** Lo que pide atención hoy en Tesorería (de lo más grave a lo más leve). `formatoDinero` viene de la página. */
export function alertasTesoreria(d: DatosAlertasTesoreria, formatoDinero: (v: number) => string): AlertaTesoreria[] {
  const a: AlertaTesoreria[] = [];
  if (d.dropi?.pedir && d.dropi.saldo !== null) {
    const porque = d.dropi.motivos.includes("umbral")
      ? `supera ${formatoDinero(d.config.dropiUmbral)}`
      : d.dropi.diasDesdeRetiro === null
        ? "sin retiros pedidos"
        : `${d.dropi.diasDesdeRetiro} días desde el último retiro`;
    a.push({ clave: "dropi-retiro", severidad: "aviso", titulo: "Conviene pedir un retiro de Dropi", mensaje: `Wallet en ${formatoDinero(d.dropi.saldo)}: ${porque}`, href: "/retiros?nuevo=1" });
  }
  const viejos = (d.antiguedad ?? []).filter((x) => x.alerta);
  if (viejos.length) {
    const total = r2(suma(viejos.map((x) => x.total)));
    a.push({
      clave: "efectivo-viejo",
      severidad: viejos.some((x) => x.masViejo >= d.config.efectivoDias * 2) ? "critica" : "aviso",
      titulo: `Efectivo en repartidores con más de ${d.config.efectivoDias} días`,
      mensaje: `${viejos.length} ${viejos.length === 1 ? "repartidor" : "repartidores"} · ${formatoDinero(total)} sin rendir`,
      href: "/tesoreria/repartidores",
    });
  }
  const faltan = (d.depositos ?? []).filter((x) => x.estado === "faltante" || x.estado === "incompleto");
  if (faltan.length) {
    a.push({
      clave: "depositos-faltantes",
      severidad: "aviso",
      titulo: "Depósitos de repartidores faltantes o incompletos",
      mensaje: `${faltan.length} ${faltan.length === 1 ? "semana" : "semanas"} · faltan ${formatoDinero(r2(suma(faltan.map((x) => x.faltante))))}`,
      href: "/tesoreria/repartidores",
    });
  }
  for (const l of d.lineas) {
    if (l.alertas.includes("vencida")) a.push({ clave: `linea-vencida:${l.nombre}`, severidad: "critica", titulo: "Línea de crédito vencida", mensaje: `${l.nombre}: la renovación ya pasó`, href: "/tesoreria/deuda" });
    else if (l.alertas.includes("renovacion"))
      a.push({ clave: `linea-renovar:${l.nombre}`, severidad: "aviso", titulo: "Línea de crédito por renovar", mensaje: `${l.nombre}: renueva en ${l.diasParaRenovar} días`, href: "/tesoreria/deuda" });
    if (l.alertas.includes("uso_alto"))
      a.push({ clave: `linea-uso:${l.nombre}`, severidad: "aviso", titulo: "Línea de crédito casi agotada", mensaje: `${l.nombre}: usada al ${Math.round(l.uso * 100)} %`, href: "/tesoreria/deuda" });
  }
  if (d.saldosViejos.length) {
    a.push({
      clave: "saldos-viejos",
      severidad: "info",
      titulo: `Saldos bancarios de más de ${d.config.saldoDias} días`,
      mensaje: d.saldosViejos.map((s) => s.cuenta).join(", "),
      href: "/tesoreria/saldos",
    });
  }
  if (d.porAprobar > 0) {
    a.push({ clave: "pagos-por-aprobar", severidad: "info", titulo: "Pagos por aprobar", mensaje: `${d.porAprobar} ${d.porAprobar === 1 ? "pago solicitado" : "pagos solicitados"}`, href: "/tesoreria/pagos" });
  }
  return a.sort((x, y) => PESO[x.severidad] - PESO[y.severidad]);
}
