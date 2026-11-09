// Portal AF4 360° › Tesorería › Optimizar deuda y Refinanciamiento (mejoras 18 y 19 del «CFO en línea»). Lógica pura:
// toda la deuda (préstamos, líneas de crédito y financiamientos por ciclo) como «instrumentos» comparables por su tasa
// efectiva anual, con sus pagos futuros; la avalancha (qué prepagar primero con la caja que sobra, neto de penalidades y
// comisiones de prepago), el ahorro de intereses a 12 meses y el calendario resultante; la amortización con meses de
// gracia y la simulación de una oferta bancaria que sustituye deudas. Prueba en `optimizar-deuda.test.ts`.

import {
  saldoAl,
  saldoCicloAl,
  sumarDiasFecha,
  sumarMesesFecha,
  tablaAmortizacion,
  tasaEfectivaAnualCiclo,
  tasaEfectivaAnualMensual,
  vencimientosCiclo,
  type Cuota,
  type FinanciamientoCiclo,
  type LineaCredito,
  type Prestamo,
} from "./deuda";

const r2 = (v: number) => Math.round(v * 100) / 100;

export type OrigenInstrumento = "prestamo" | "linea" | "ciclo" | "oferta";

export const ETIQUETA_ORIGEN: Record<OrigenInstrumento, string> = {
  prestamo: "Préstamo",
  linea: "Línea de crédito",
  ciclo: "Financiamiento por ciclo",
  oferta: "Oferta bancaria",
};

export interface PagoInstrumento {
  fecha: string;
  interes: number;
  capital: number;
}

export interface Instrumento {
  /** «prestamo:<id>», «linea:<id>», «ciclo:<id>», «oferta:<id>». */
  ref: string;
  origen: OrigenInstrumento;
  id: string;
  nombre: string;
  acreedor: string | null;
  /** Lo que se debe hoy. */
  saldo: number;
  /** Fracción anual comparable entre todos (capitalizando cuotas o ciclos). */
  tasaEfectivaAnual: number;
  /** Penalidad por prepagar: fracción de lo prepagado. */
  penalidad: number;
  /** Comisión fija por prepagar (USD). */
  comision: number;
  /** Los pagos después de hoy. */
  pagos: PagoInstrumento[];
  /** Todo el saldo vence (o se renueva) dentro del año: una línea o un giro. */
  todoCorriente: boolean;
}

/** Meses hacia adelante con que se arman los pagos (alcanza para 6 meses de proyección + 12 de corriente). */
export const HORIZONTE_MESES = 36;

const finDeMes = (f: string) => new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)), 0)).toISOString().slice(0, 10);

/** Los préstamos, líneas y giros activos como instrumentos (solo los que tienen saldo hoy). */
export function instrumentosDeDeuda(
  d: { prestamos: Prestamo[]; lineas: LineaCredito[]; ciclos?: FinanciamientoCiclo[] },
  hoy: string,
  horizonte = HORIZONTE_MESES,
): Instrumento[] {
  const hasta = sumarMesesFecha(hoy, horizonte);
  const salida: Instrumento[] = [];
  for (const p of d.prestamos) {
    const tabla = tablaAmortizacion(p);
    // Un préstamo que todavía no se desembolsó cuenta desde su desembolso: hoy no se debe, no se prepaga.
    const s = saldoAl(p, hoy, tabla);
    if (s.saldo <= 0.005) continue;
    salida.push({
      ref: `prestamo:${p.id}`,
      origen: "prestamo",
      id: p.id,
      nombre: p.nombre,
      acreedor: p.acreedor,
      saldo: s.saldo,
      tasaEfectivaAnual: tasaEfectivaAnualMensual(p.tasaAnual),
      penalidad: p.penalidadPrepago ?? 0,
      comision: p.comisionPrepago ?? 0,
      pagos: tabla.filter((c) => c.fecha > hoy && c.fecha <= hasta).map((c) => ({ fecha: c.fecha, interes: c.interes, capital: c.capital })),
      todoCorriente: false,
    });
  }
  for (const l of d.lineas) {
    if (l.usado <= 0.005) continue;
    const interes = r2((l.usado * l.tasaAnual) / 12);
    const pagos: PagoInstrumento[] = [];
    for (let k = 0; k <= horizonte; k++) {
      const f = finDeMes(sumarMesesFecha(`${hoy.slice(0, 7)}-01`, k));
      if (f > hoy && f <= hasta && interes > 0) pagos.push({ fecha: f, interes, capital: 0 });
    }
    salida.push({
      ref: `linea:${l.id}`,
      origen: "linea",
      id: l.id,
      nombre: l.nombre,
      acreedor: l.banco,
      saldo: r2(l.usado),
      tasaEfectivaAnual: tasaEfectivaAnualMensual(l.tasaAnual),
      penalidad: l.penalidadPrepago ?? 0,
      comision: l.comisionPrepago ?? 0,
      pagos,
      todoCorriente: true,
    });
  }
  for (const c of d.ciclos ?? []) {
    const saldo = saldoCicloAl(c, hoy);
    if (saldo <= 0.005) continue;
    salida.push({
      ref: `ciclo:${c.id}`,
      origen: "ciclo",
      id: c.id,
      nombre: c.nombre,
      acreedor: c.acreedor,
      saldo,
      tasaEfectivaAnual: tasaEfectivaAnualCiclo(c.tasaCiclo, c.diasCiclo),
      penalidad: c.penalidadPrepago ?? 0,
      comision: c.comisionPrepago ?? 0,
      pagos: vencimientosCiclo(c, sumarDiasFecha(hoy, 1), hasta).map((v) => ({ fecha: v.fecha, interes: v.interes, capital: v.capital })),
      todoCorriente: true,
    });
  }
  return salida;
}

/** Los intereses que paga un instrumento en (desde, hasta]. */
export const interesesEntre = (i: Instrumento, desde: string, hasta: string) => r2(i.pagos.filter((p) => p.fecha > desde && p.fecha <= hasta).reduce((a, p) => a + p.interes, 0));

/** Los intereses de los próximos 12 meses desde una fecha. */
export const intereses12 = (i: Instrumento, desde: string) => interesesEntre(i, desde, sumarMesesFecha(desde, 12));

/**
 * El instrumento con su saldo multiplicado por `f` (lo que queda después de prepagar una parte). Con la cuota recalculada
 * al mismo plazo, el saldo de cada mes, sus intereses y su capital bajan en la misma proporción.
 */
export function escalar(i: Instrumento, f: number): Instrumento {
  const k = Math.min(Math.max(f, 0), 1);
  return { ...i, saldo: r2(i.saldo * k), pagos: i.pagos.map((p) => ({ fecha: p.fecha, interes: r2(p.interes * k), capital: r2(p.capital * k) })) };
}

/** Lo que se debe a una fecha (hoy o después) y lo que de eso vence en los 12 meses siguientes. */
export function deudaAl(i: Instrumento, fecha: string): { saldo: number; corriente: number } {
  const pagado = i.pagos.filter((p) => p.fecha <= fecha).reduce((a, p) => a + p.capital, 0);
  const saldo = Math.max(r2(i.saldo - pagado), 0);
  if (i.todoCorriente) return { saldo, corriente: saldo };
  const en12 = sumarMesesFecha(fecha, 12);
  const corriente = i.pagos.filter((p) => p.fecha > fecha && p.fecha <= en12).reduce((a, p) => a + p.capital, 0);
  return { saldo, corriente: Math.min(r2(corriente), saldo) };
}

/** La deuda total de varios instrumentos a una fecha. */
export function deudaTotalAl(lista: Instrumento[], fecha: string): { saldo: number; corriente: number } {
  return lista.reduce(
    (a, i) => {
      const d = deudaAl(i, fecha);
      return { saldo: r2(a.saldo + d.saldo), corriente: r2(a.corriente + d.corriente) };
    },
    { saldo: 0, corriente: 0 },
  );
}

/**
 * El rendimiento de prepagar a un año: la tasa efectiva menos lo que cuesta prepagar (la penalidad y la comisión sobre el
 * saldo, que se pagan una vez). Es el orden de la avalancha cuando hay penalidades cargadas.
 */
export const tasaNetaPrepago = (i: Instrumento) => i.tasaEfectivaAnual - i.penalidad - (i.saldo > 0 ? i.comision / i.saldo : 0);

export interface PasoAvalancha {
  ref: string;
  nombre: string;
  origen: OrigenInstrumento;
  tasaEfectivaAnual: number;
  tasaNeta: number;
  saldo: number;
  prepago: number;
  /** Penalidad + comisión. */
  costoPrepago: number;
  /** Lo que sale de caja: prepago + costo. */
  salida: number;
  /** Intereses que se dejan de pagar en 12 meses, menos el costo del prepago. */
  ahorro12: number;
  /** Lo prepaga entero. */
  completo: boolean;
}

export interface ResultadoAvalancha {
  pasos: PasoAvalancha[];
  /** Instrumentos que no conviene prepagar (la penalidad o la comisión se comen el ahorro). */
  noConviene: { ref: string; nombre: string; motivo: string }[];
  caja: number;
  usada: number;
  sinUsar: number;
  interesesAntes12: number;
  interesesDespues12: number;
  ahorro12: number;
  /** Los instrumentos después de prepagar (para el calendario y la proyección de covenants). */
  despues: Instrumento[];
}

/**
 * La avalancha: con `caja` disponible, prepagar primero la deuda de mayor tasa neta (tasa efectiva anual menos penalidad y
 * comisión), hasta agotar la caja. Una deuda cuyo prepago no ahorra nada en 12 meses se salta. El ahorro de cada paso =
 * intereses de 12 meses × (prepago ÷ saldo) − penalidad − comisión.
 */
export function avalancha(instrumentos: Instrumento[], caja: number, hoy: string): ResultadoAvalancha {
  const orden = [...instrumentos].filter((i) => i.origen !== "oferta").sort((a, b) => tasaNetaPrepago(b) - tasaNetaPrepago(a) || b.saldo - a.saldo);
  let restante = Math.max(r2(caja), 0);
  const pasos: PasoAvalancha[] = [];
  const noConviene: ResultadoAvalancha["noConviene"] = [];
  const factor = new Map<string, number>();
  for (const i of orden) {
    const int12 = intereses12(i, hoy);
    // Si alcanzara para todo, ¿convendría? (el motivo se informa aunque no haya caja).
    const ahorroTotal = int12 - i.saldo * i.penalidad - i.comision;
    if (ahorroTotal <= 0.005) {
      noConviene.push({ ref: i.ref, nombre: i.nombre, motivo: int12 <= 0 ? "No paga intereses en los próximos 12 meses." : "La penalidad y la comisión de prepago superan el ahorro de 12 meses." });
      continue;
    }
    if (restante <= 0.005) continue;
    const prepago = r2(Math.min(i.saldo, Math.max((restante - i.comision) / (1 + i.penalidad), 0)));
    if (prepago <= 0.005) continue;
    const costo = r2(prepago * i.penalidad + i.comision);
    const ahorro = r2((int12 * prepago) / i.saldo - costo);
    if (ahorro <= 0.005) {
      noConviene.push({ ref: i.ref, nombre: i.nombre, motivo: "Con la caja que queda, la comisión fija se come el ahorro." });
      continue;
    }
    const salida = r2(prepago + costo);
    restante = r2(restante - salida);
    factor.set(i.ref, 1 - prepago / i.saldo);
    pasos.push({
      ref: i.ref,
      nombre: i.nombre,
      origen: i.origen,
      tasaEfectivaAnual: i.tasaEfectivaAnual,
      tasaNeta: tasaNetaPrepago(i),
      saldo: i.saldo,
      prepago,
      costoPrepago: costo,
      salida,
      ahorro12: ahorro,
      completo: prepago >= i.saldo - 0.005,
    });
  }
  const despues = instrumentos.map((i) => (factor.has(i.ref) ? escalar(i, factor.get(i.ref)!) : i)).filter((i) => i.saldo > 0.005);
  const antes12 = r2(instrumentos.reduce((a, i) => a + intereses12(i, hoy), 0));
  const despues12 = r2(despues.reduce((a, i) => a + intereses12(i, hoy), 0));
  const usada = r2(pasos.reduce((a, p) => a + p.salida, 0));
  return {
    pasos,
    noConviene,
    caja: Math.max(r2(caja), 0),
    usada,
    sinUsar: r2(Math.max(caja, 0) - usada),
    interesesAntes12: antes12,
    interesesDespues12: despues12,
    ahorro12: r2(pasos.reduce((a, p) => a + p.ahorro12, 0)),
    despues,
  };
}

/** Los 12 (o `n`) meses que empiezan en el mes de `desde`, como «AAAA-MM-01». */
export const mesesDesde = (desde: string, n = 12) => Array.from({ length: n }, (_, k) => sumarMesesFecha(`${desde.slice(0, 7)}-01`, k));

/** Lo que sale de caja por deuda cada mes (intereses + capital). */
export function servicioPorMes(lista: Instrumento[], meses: string[]): number[] {
  return meses.map((m) => r2(lista.reduce((a, i) => a + i.pagos.filter((p) => p.fecha.slice(0, 7) === m.slice(0, 7)).reduce((b, p) => b + p.interes + p.capital, 0), 0)));
}

export interface FilaCalendario {
  mes: string;
  antes: number;
  despues: number;
  /** Lo que sale de caja una sola vez (el prepago o lo que entra de una oferta, con signo de salida). */
  unico: number;
  /** Diferencia de caja del mes: antes − después − único (positivo = más caja). */
  efecto: number;
  acumulado: number;
}

/** El servicio de la deuda mes a mes antes y después, con un movimiento único en el mes de `fechaUnico`. */
export function calendario(antes: Instrumento[], despues: Instrumento[], desde: string, unico: { fecha: string; monto: number } | null, n = 12): FilaCalendario[] {
  const meses = mesesDesde(desde, n);
  const a = servicioPorMes(antes, meses);
  const d = servicioPorMes(despues, meses);
  let acumulado = 0;
  return meses.map((m, k) => {
    const u = unico && unico.fecha.slice(0, 7) === m.slice(0, 7) ? r2(unico.monto) : 0;
    const efecto = r2(a[k] - d[k] - u);
    acumulado = r2(acumulado + efecto);
    return { mes: m, antes: a[k], despues: d[k], unico: u, efecto, acumulado };
  });
}

/**
 * La caja que se puede usar sin bajar de la caja mínima: la caja final más baja de la proyección (todas sus semanas) menos
 * la caja mínima configurada. Nunca negativa.
 */
export function cajaDisponibleDeProyeccion(cajaFinal: number[], cajaInicial: number, cajaMinima: number): number {
  const minimo = cajaFinal.length ? Math.min(cajaInicial, ...cajaFinal) : cajaInicial;
  return Math.max(r2(minimo - cajaMinima), 0);
}

// ---------------------------------------------------------------------------------------------
// Amortización con gracia y ofertas de refinanciamiento
// ---------------------------------------------------------------------------------------------

/**
 * La tabla de un préstamo con `gracia` meses al comienzo en que solo se pagan intereses; después, cuota fija (francés) en
 * los meses que quedan. Sin gracia es la misma tabla de `tablaAmortizacion`.
 */
export function tablaConGracia(monto: number, tasaAnual: number, plazoMeses: number, graciaMeses: number, primerVencimiento: string): Cuota[] {
  const gracia = Math.min(Math.max(Math.floor(graciaMeses), 0), Math.max(plazoMeses - 1, 0));
  const i = tasaAnual / 12;
  const salida: Cuota[] = [];
  for (let k = 1; k <= gracia; k++) {
    const interes = r2(monto * i);
    salida.push({ numero: k, fecha: sumarMesesFecha(primerVencimiento, k - 1), cuota: interes, interes, capital: 0, saldo: r2(monto) });
  }
  const resto = tablaAmortizacion({ monto, tasaAnual, plazoMeses: plazoMeses - gracia, primerVencimiento: sumarMesesFecha(primerVencimiento, gracia) });
  for (const c of resto) salida.push({ ...c, numero: c.numero + gracia });
  return salida;
}

/** La tasa interna de retorno mensual de unos flujos (el primero es lo que se recibe), por bisección. null si no hay. */
export function tirMensual(flujos: number[]): number | null {
  const vpn = (r: number) => flujos.reduce((a, f, k) => a + f / Math.pow(1 + r, k), 0);
  let bajo = -0.99;
  let alto = 1;
  if (vpn(bajo) * vpn(alto) > 0) return null;
  for (let n = 0; n < 200; n++) {
    const medio = (bajo + alto) / 2;
    if (vpn(bajo) * vpn(medio) <= 0) alto = medio;
    else bajo = medio;
  }
  return (bajo + alto) / 2;
}

export interface OfertaRefinanciamiento {
  id: string;
  banco: string;
  nombre: string;
  monto: number;
  plazoMeses: number;
  /** Nominal anual. */
  tasaAnual: number;
  /** Fracción del monto que se cobra al desembolsar. */
  comisionApertura: number;
  graciaMeses: number;
  garantias: string | null;
  fechaDesembolso: string;
  /** Refs de los instrumentos que paga («ciclo:<id>»…). */
  sustituye: string[];
}

export interface Cubierta {
  ref: string;
  nombre: string;
  origen: OrigenInstrumento;
  saldo: number;
  tasaEfectivaAnual: number;
  cubierto: number;
  costoPrepago: number;
}

export interface SimulacionOferta {
  tabla: Cuota[];
  /** La cuota durante la gracia (solo intereses) y la cuota fija después. */
  cuotaGracia: number | null;
  cuota: number;
  /** Lo que entra neto de la comisión de apertura. */
  neto: number;
  comisionApertura: number;
  cubiertas: Cubierta[];
  /** Deuda elegida que el monto no alcanza a pagar. */
  sinCubrir: number;
  /** Lo que sobra del desembolso después de pagar lo sustituido (entra a caja). */
  excedente: number;
  /** Comisión de apertura + penalidades y comisiones de prepago. */
  costoUnico: number;
  interesesAntes12: number;
  interesesDespues12: number;
  /** Intereses que se dejan de pagar al año (sin los costos únicos). */
  ahorroAnual: number;
  /** El ahorro del primer año, ya restados los costos únicos. */
  ahorroPrimerAnio: number;
  /** El costo efectivo anual de la oferta, con la comisión de apertura (TIR de lo recibido contra las cuotas). */
  costoEfectivoAnual: number | null;
  /** La tasa efectiva anual promedio (ponderada por lo cubierto) de lo que sustituye. */
  tasaSustituida: number | null;
  /** Instrumentos con la oferta (lo sustituido reducido + el préstamo nuevo). */
  escenario: Instrumento[];
  /** El préstamo nuevo como instrumento. */
  nuevo: Instrumento;
  mensual: FilaCalendario[];
}

/**
 * Simula una oferta: con el monto neto de la comisión de apertura paga lo que sustituye, primero lo de mayor tasa neta
 * (con su penalidad y comisión de prepago), y lo que sobra entra a caja. Compara los intereses de 12 meses y el servicio de
 * la deuda mes a mes con y sin la oferta.
 */
export function simularOferta(o: OfertaRefinanciamiento, instrumentos: Instrumento[], hoy: string): SimulacionOferta {
  const primer = sumarMesesFecha(o.fechaDesembolso, 1);
  const tabla = tablaConGracia(o.monto, o.tasaAnual, o.plazoMeses, o.graciaMeses, primer);
  const comision = r2(o.monto * o.comisionApertura);
  const neto = r2(o.monto - comision);
  const elegidas = new Set(o.sustituye);
  const sustituidas = instrumentos.filter((i) => elegidas.has(i.ref)).sort((a, b) => tasaNetaPrepago(b) - tasaNetaPrepago(a));
  let restante = neto;
  const cubiertas: Cubierta[] = [];
  const factor = new Map<string, number>();
  for (const i of sustituidas) {
    const x = r2(Math.min(i.saldo, Math.max((restante - i.comision) / (1 + i.penalidad), 0)));
    const costo = x > 0 ? r2(x * i.penalidad + i.comision) : 0;
    if (x > 0) {
      restante = r2(restante - x - costo);
      factor.set(i.ref, 1 - x / i.saldo);
    }
    cubiertas.push({ ref: i.ref, nombre: i.nombre, origen: i.origen, saldo: i.saldo, tasaEfectivaAnual: i.tasaEfectivaAnual, cubierto: x, costoPrepago: costo });
  }
  const nuevo: Instrumento = {
    ref: `oferta:${o.id}`,
    origen: "oferta",
    id: o.id,
    nombre: o.nombre,
    acreedor: o.banco,
    saldo: r2(o.monto),
    tasaEfectivaAnual: tasaEfectivaAnualMensual(o.tasaAnual),
    penalidad: 0,
    comision: 0,
    pagos: tabla.filter((c) => c.fecha > hoy).map((c) => ({ fecha: c.fecha, interes: c.interes, capital: c.capital })),
    todoCorriente: false,
  };
  const escenario = [...instrumentos.map((i) => (factor.has(i.ref) ? escalar(i, factor.get(i.ref)!) : i)).filter((i) => i.saldo > 0.005), nuevo];
  const antes12 = r2(instrumentos.reduce((a, i) => a + intereses12(i, hoy), 0));
  const despues12 = r2(escenario.reduce((a, i) => a + intereses12(i, hoy), 0));
  const costoPrepagos = r2(cubiertas.reduce((a, c) => a + c.costoPrepago, 0));
  const costoUnico = r2(comision + costoPrepagos);
  const cubiertoTotal = cubiertas.reduce((a, c) => a + c.cubierto, 0);
  const tir = tirMensual([neto, ...tabla.map((c) => -c.cuota)]);
  const gracia = tabla.findIndex((c) => c.capital > 0);
  return {
    tabla,
    cuotaGracia: gracia > 0 ? tabla[0].cuota : null,
    cuota: tabla[Math.max(gracia, 0)]?.cuota ?? 0,
    neto,
    comisionApertura: comision,
    cubiertas,
    sinCubrir: r2(cubiertas.reduce((a, c) => a + (c.saldo - c.cubierto), 0)),
    excedente: Math.max(restante, 0),
    costoUnico,
    interesesAntes12: antes12,
    interesesDespues12: despues12,
    ahorroAnual: r2(antes12 - despues12),
    ahorroPrimerAnio: r2(antes12 - despues12 - costoUnico),
    costoEfectivoAnual: tir === null ? null : Math.pow(1 + tir, 12) - 1,
    tasaSustituida: cubiertoTotal > 0 ? cubiertas.reduce((a, c) => a + c.tasaEfectivaAnual * c.cubierto, 0) / cubiertoTotal : null,
    escenario,
    nuevo,
    // El mes del desembolso: entra el excedente (una salida negativa).
    mensual: calendario(instrumentos, escenario, hoy < o.fechaDesembolso ? hoy : o.fechaDesembolso, { fecha: o.fechaDesembolso, monto: -Math.max(restante, 0) }),
  };
}

// ---------------------------------------------------------------------------------------------
// Lectura de formularios
// ---------------------------------------------------------------------------------------------

const REF = /^(prestamo|linea|ciclo):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const esRefDeuda = (v: unknown): v is string => typeof v === "string" && REF.test(v);

/** Las refs elegidas (sin repetir, solo las bien formadas, hasta 50). */
export const leerRefs = (v: unknown[]): string[] => [...new Set(v.map((x) => String(x).trim()).filter(esRefDeuda))].slice(0, 50);

/**
 * La caja de más (o de menos) acumulada hasta una fecha por pasar de `antes` a `despues`: lo que se deja de pagar desde
 * `desde` hasta `fecha`, más un movimiento único (lo que entra de una oferta: positivo; un prepago: negativo) si ya ocurrió.
 */
export function efectoAcumuladoAl(antes: Instrumento[], despues: Instrumento[], desde: string, fecha: string, unico: { fecha: string; monto: number } | null): number {
  const pagado = (lista: Instrumento[]) => lista.reduce((a, i) => a + i.pagos.filter((p) => p.fecha > desde && p.fecha <= fecha).reduce((b, p) => b + p.interes + p.capital, 0), 0);
  return r2(pagado(antes) - pagado(despues) + (unico && unico.fecha <= fecha ? unico.monto : 0));
}
