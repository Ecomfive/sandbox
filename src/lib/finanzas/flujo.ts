// Portal AF4 360° › Flujo de caja. Lógica pura: arma el estado de flujo (bloques operativo / inversión / financiamiento)
// y los saldos por cuenta a partir de las filas de la vista `fin_flujo_mensual` y de `fin_saldos_iniciales`
// (migración 0904). Sirve en el servidor y en el cliente. Prueba en `flujo.test.ts`.
//
// Reglas (las mismas que la hoja «EFE» de Majo, ver la migración):
//  · Entra lo marcado «FLUJO = SI», en el mes de su fecha de pago.
//  · El tipo da el sentido: un tipo que suma al resultado (Ingresos, intereses ganados, aportes) es una entrada; el resto,
//    una salida. Sin tipo, salida.
//  · «PAGO TDC» es un traspaso del banco a la tarjeta: baja el saldo del banco y paga la deuda de la tarjeta, pero no
//    cambia la caja total (el gasto ya se contó al cargarlo a la tarjeta).

import type { PorMes } from "./eerr";
import { factorEntre, type TasaMes } from "./entidades";

export type Bloque = "operativo" | "inversion" | "financiamiento" | "sin_clasificar" | "traspaso";
export type Sentido = "entrada" | "salida";

/** Los bloques del estado, en orden, con su nombre. El traspaso no es un bloque del estado: solo mueve saldos. */
export const BLOQUES: { clave: Exclude<Bloque, "traspaso">; etiqueta: string }[] = [
  { clave: "operativo", etiqueta: "Flujo operativo" },
  { clave: "inversion", etiqueta: "Flujo de inversión" },
  { clave: "financiamiento", etiqueta: "Flujo de financiamiento" },
  { clave: "sin_clasificar", etiqueta: "Sin clasificar" },
];

/** Una fila de la vista, ya con el nombre del tipo. */
export interface FilaFlujo {
  /** AAAA-MM-01 (mes de la fecha de pago). */
  mes: string;
  cuenta_id: string | null;
  tipo: string;
  orden: number;
  bloque: Bloque;
  sentido: Sentido;
  /** Positivo, en la moneda en que se ve el flujo. */
  monto: number;
  /** El mismo monto en la moneda de la cuenta (migración 0923), para su saldo. Sin él, `monto`. */
  monto_cuenta?: number;
}

export interface LineaFlujo {
  tipo: string;
  sentido: Sentido;
  /** Con su signo: entradas positivas, salidas negativas. */
  meses: PorMes;
  total: number;
}

export interface BloqueFlujo {
  bloque: Exclude<Bloque, "traspaso">;
  etiqueta: string;
  lineas: LineaFlujo[];
  entradas: PorMes;
  /** Positivas (lo que salió). */
  salidas: PorMes;
  neto: PorMes;
}

export interface EstadoFlujo {
  meses: string[];
  bloques: BloqueFlujo[];
  entradas: PorMes;
  salidas: PorMes;
  neto: PorMes;
}

const suma = (o: PorMes) => Object.values(o).reduce((a, b) => a + b, 0);
const redondear = (v: number) => Math.round(v * 100) / 100;

/** El estado de flujo de los meses pedidos: cada bloque con sus tipos (entradas primero), y los totales. */
export function armarFlujo(filas: FilaFlujo[], meses: string[]): EstadoFlujo {
  const cero = (): PorMes => Object.fromEntries(meses.map((m) => [m, 0]));
  const enVentana = new Set(meses);
  const lineas = new Map<string, Map<string, LineaFlujo & { orden: number }>>();
  for (const f of filas) {
    if (!enVentana.has(f.mes) || f.bloque === "traspaso") continue;
    const delBloque = lineas.get(f.bloque) ?? new Map();
    lineas.set(f.bloque, delBloque);
    const clave = `${f.sentido}|${f.tipo}`;
    const l = delBloque.get(clave) ?? { tipo: f.tipo, sentido: f.sentido, orden: f.orden, meses: cero(), total: 0 };
    const v = f.sentido === "entrada" ? f.monto : -f.monto;
    l.meses[f.mes] = redondear(l.meses[f.mes] + v);
    l.total = redondear(l.total + v);
    delBloque.set(clave, l);
  }
  const entradas = cero();
  const salidas = cero();
  const bloques: BloqueFlujo[] = BLOQUES.map(({ clave, etiqueta }) => {
    const ls = [...(lineas.get(clave)?.values() ?? [])].sort(
      (a, b) => (a.sentido === b.sentido ? 0 : a.sentido === "entrada" ? -1 : 1) || a.orden - b.orden || a.tipo.localeCompare(b.tipo),
    );
    const e = cero();
    const s = cero();
    for (const l of ls) {
      for (const m of meses) {
        if (l.sentido === "entrada") e[m] += l.meses[m];
        else s[m] -= l.meses[m];
      }
    }
    const neto = Object.fromEntries(meses.map((m) => [m, redondear(e[m] - s[m])]));
    for (const m of meses) {
      entradas[m] = redondear(entradas[m] + e[m]);
      salidas[m] = redondear(salidas[m] + s[m]);
    }
    const limpias = ls.map((l) => ({ tipo: l.tipo, sentido: l.sentido, meses: l.meses, total: l.total }));
    return { bloque: clave, etiqueta, lineas: limpias, entradas: e, salidas: s, neto };
  }).filter((b) => b.bloque !== "sin_clasificar" || b.lineas.length > 0);
  const neto = Object.fromEntries(meses.map((m) => [m, redondear(entradas[m] - salidas[m])]));
  return { meses, bloques, entradas, salidas, neto };
}

// ---------------------------------------------------------------------------------------------
// Saldos por cuenta
// ---------------------------------------------------------------------------------------------

export interface CuentaFlujo {
  id: string;
  nombre: string;
  clase: string;
}

export interface SaldoInicial {
  cuenta_id: string;
  /** AAAA-MM-01: saldo al comenzar ese mes. */
  fecha: string;
  monto: number;
}

/** Movimientos sin forma de pago. */
export const SIN_CUENTA = "sin-cuenta";
/** La contrapartida de «PAGO TDC»: el libro no dice a qué tarjeta se pagó. */
export const PAGOS_TARJETA = "pagos-tarjeta";

export interface SaldoCuenta {
  /** El id de la cuenta, o `SIN_CUENTA` / `PAGOS_TARJETA`. */
  id: string;
  nombre: string;
  clase: string;
  /** Si tiene un saldo inicial cargado (sin él, se parte de cero). */
  conSaldo: boolean;
  inicial: PorMes;
  entradas: PorMes;
  /** Positivas. */
  salidas: PorMes;
  /** Neto de traspasos (PAGO TDC): negativo en el banco que pagó, positivo en la contrapartida de tarjetas. */
  traspasos: PorMes;
  final: PorMes;
  /** Una cuenta en otra moneda: lo que cambió su saldo solo por el tipo de cambio (migración 0923). */
  diferencia?: PorMes;
}

/** Los meses AAAA-MM-01 desde `desde` hasta `hasta`, inclusive. */
export function rangoMeses(desde: string, hasta: string): string[] {
  const salida: string[] = [];
  let a = Number(desde.slice(0, 4));
  let m = Number(desde.slice(5, 7));
  const fin = hasta.slice(0, 7);
  for (let i = 0; i < 240; i++) {
    const clave = `${a}-${String(m).padStart(2, "0")}`;
    if (clave > fin) break;
    salida.push(`${clave}-01`);
    m += 1;
    if (m === 13) {
      m = 1;
      a += 1;
    }
  }
  return salida;
}

/**
 * Saldo inicial → entradas → salidas → traspasos → saldo final de cada cuenta en los meses pedidos. `filas` debe traer
 * TODOS los meses con movimientos (no solo la ventana): el saldo de un mes sale del saldo inicial cargado más cercano,
 * sumando el flujo de los meses que siguen o restando el de los que preceden si el saldo cargado es posterior.
 */
export function saldosPorCuenta(
  filas: FilaFlujo[],
  saldos: SaldoInicial[],
  cuentas: CuentaFlujo[],
  meses: string[],
): SaldoCuenta[] {
  if (!meses.length) return [];
  const nombre = new Map(cuentas.map((c) => [c.id, c]));
  // Neto de cada cuenta por mes, en toda la historia.
  const flujo = new Map<string, Map<string, { e: number; s: number; t: number }>>();
  const sumar = (cuenta: string, mes: string, campo: "e" | "s" | "t", v: number) => {
    const porMes = flujo.get(cuenta) ?? new Map();
    flujo.set(cuenta, porMes);
    const x = porMes.get(mes) ?? { e: 0, s: 0, t: 0 };
    x[campo] += v;
    porMes.set(mes, x);
  };
  for (const f of filas) {
    const cuenta = f.cuenta_id ?? SIN_CUENTA;
    if (f.bloque === "traspaso") {
      sumar(cuenta, f.mes, "t", -f.monto);
      sumar(PAGOS_TARJETA, f.mes, "t", f.monto);
    } else if (f.sentido === "entrada") sumar(cuenta, f.mes, "e", f.monto);
    else sumar(cuenta, f.mes, "s", f.monto);
  }
  const ids = new Set<string>([...flujo.keys(), ...saldos.map((s) => s.cuenta_id)]);
  const anclas = new Map<string, SaldoInicial[]>();
  for (const s of saldos) anclas.set(s.cuenta_id, [...(anclas.get(s.cuenta_id) ?? []), s].sort((a, b) => a.fecha.localeCompare(b.fecha)));

  const netoEntre = (porMes: Map<string, { e: number; s: number; t: number }> | undefined, desde: string, hasta: string) => {
    // Suma el neto de los meses en [desde, hasta).
    let total = 0;
    for (const [mes, x] of porMes ?? []) if (mes >= desde && mes < hasta) total += x.e - x.s + x.t;
    return total;
  };

  const salida: SaldoCuenta[] = [];
  for (const id of ids) {
    const porMes = flujo.get(id);
    const propias = anclas.get(id) ?? [];
    const inicialDe = (mes: string): number => {
      const antes = propias.filter((a) => a.fecha <= mes).at(-1);
      if (antes) return antes.monto + netoEntre(porMes, antes.fecha, mes);
      const despues = propias[0];
      if (despues) return despues.monto - netoEntre(porMes, mes, despues.fecha);
      // Sin saldo cargado: se parte de cero en el primer mes con movimientos.
      return netoEntre(porMes, "0000-01-01", mes);
    };
    const c = nombre.get(id);
    const fila: SaldoCuenta = {
      id,
      nombre: id === SIN_CUENTA ? "Sin forma de pago" : id === PAGOS_TARJETA ? "Pagos de tarjeta (sin tarjeta)" : (c?.nombre ?? "—"),
      clase: id === PAGOS_TARJETA ? "tarjeta" : id === SIN_CUENTA ? "otro" : (c?.clase ?? "otro"),
      conSaldo: propias.length > 0,
      inicial: {},
      entradas: {},
      salidas: {},
      traspasos: {},
      final: {},
    };
    for (const mes of meses) {
      const x = porMes?.get(mes) ?? { e: 0, s: 0, t: 0 };
      const ini = redondear(inicialDe(mes));
      fila.inicial[mes] = ini;
      fila.entradas[mes] = redondear(x.e);
      fila.salidas[mes] = redondear(x.s);
      fila.traspasos[mes] = redondear(x.t);
      fila.final[mes] = redondear(ini + x.e - x.s + x.t);
    }
    salida.push(fila);
  }
  const ORDEN_CLASE: Record<string, number> = { banco: 0, billetera: 1, tarjeta: 2, otro: 3 };
  const pesoEspecial = (id: string) => (id === PAGOS_TARJETA ? 1 : id === SIN_CUENTA ? 2 : 0);
  return salida.sort(
    (a, b) =>
      pesoEspecial(a.id) - pesoEspecial(b.id) ||
      (ORDEN_CLASE[a.clase] ?? 9) - (ORDEN_CLASE[b.clase] ?? 9) ||
      a.nombre.localeCompare(b.nombre),
  );
}

/** Cómo pasar a la moneda en que se ve el flujo los saldos de las cuentas en otra moneda (migración 0923). */
export interface ConversionFlujo {
  /** La moneda en que se ve (USD en el consolidado). */
  moneda: string;
  /** La moneda de cada cuenta; la que no está, en `moneda`. */
  monedaCuenta: Record<string, string>;
  tasas: TasaMes[];
}

/** El mes anterior (AAAA-MM-01). */
const mesPrevio = (mes: string) => {
  const a = Number(mes.slice(0, 4));
  const m = Number(mes.slice(5, 7));
  return m === 1 ? `${a - 1}-12-01` : `${a}-${String(m - 1).padStart(2, "0")}-01`;
};

/**
 * Saldos por cuenta con cuentas en otra moneda. Cada cuenta lleva su saldo en su moneda (saldo inicial cargado y
 * `monto_cuenta`) y se pasa a la moneda en que se ve con el tipo de cambio de cierre de cada mes. Sus entradas, salidas y
 * traspasos son los del flujo (ya convertidos al promedio del mes), así que lo que no cuadra es la diferencia de cambio:
 * saldo final − saldo inicial − entradas + salidas − traspasos. Sin ninguna tasa para esa moneda, la cuenta queda solo
 * con su flujo (sin saldo inicial ni diferencia). Las cuentas en la moneda en que se ve no cambian.
 */
export function saldosConvertidos(
  filas: FilaFlujo[],
  saldos: SaldoInicial[],
  cuentas: CuentaFlujo[],
  meses: string[],
  conversion: ConversionFlujo,
): SaldoCuenta[] {
  const monedaDe = (id: string) => conversion.monedaCuenta[id] ?? conversion.moneda;
  const enVista = (id: string) => monedaDe(id) === conversion.moneda;
  // Las cuentas en la moneda en que se ve, las de «sin cuenta» y la contrapartida de tarjetas: como siempre.
  const vista = saldosPorCuenta(filas, saldos.filter((s) => enVista(s.cuenta_id)), cuentas, meses);
  const salida = vista.filter((c) => c.id === SIN_CUENTA || c.id === PAGOS_TARJETA || enVista(c.id));
  const otras = [...new Set([...filas.map((f) => f.cuenta_id), ...saldos.map((s) => s.cuenta_id)])].filter(
    (id): id is string => !!id && !enVista(id),
  );
  for (const id of otras) {
    const moneda = monedaDe(id);
    const propias = filas.filter((f) => f.cuenta_id === id);
    const local = saldosPorCuenta(
      propias.map((f) => ({ ...f, monto: f.monto_cuenta ?? f.monto })),
      saldos.filter((s) => s.cuenta_id === id),
      cuentas,
      meses,
    ).find((c) => c.id === id);
    const flujo = vista.find((c) => c.id === id);
    if (!local) continue;
    const k = (mes: string) => factorEntre(conversion.tasas, moneda, conversion.moneda, mes, "cierre");
    const fila: SaldoCuenta = {
      ...local,
      nombre: `${local.nombre} · ${moneda}`,
      inicial: {},
      entradas: {},
      salidas: {},
      traspasos: {},
      final: {},
      diferencia: {},
    };
    const sinTasa = meses.every((m) => k(m) === null);
    if (sinTasa) fila.conSaldo = false;
    for (const mes of meses) {
      const e = flujo?.entradas[mes] ?? 0;
      const s = flujo?.salidas[mes] ?? 0;
      const t = flujo?.traspasos[mes] ?? 0;
      fila.entradas[mes] = e;
      fila.salidas[mes] = s;
      fila.traspasos[mes] = t;
      const kFin = k(mes);
      const kIni = k(mesPrevio(mes)) ?? kFin;
      if (sinTasa || kFin === null || kIni === null) {
        const ini = flujo?.inicial[mes] ?? 0;
        fila.inicial[mes] = ini;
        fila.final[mes] = redondear(ini + e - s + t);
        fila.diferencia![mes] = 0;
        continue;
      }
      const ini = redondear(local.inicial[mes] * kIni);
      const fin = redondear(local.final[mes] * kFin);
      fila.inicial[mes] = ini;
      fila.final[mes] = fin;
      fila.diferencia![mes] = redondear(fin - ini - e + s - t);
    }
    salida.push(fila);
  }
  return salida;
}

/** Caja de todas las cuentas por mes (saldo inicial y final). */
export function cajaTotal(cuentas: SaldoCuenta[], meses: string[]): { inicial: PorMes; final: PorMes } {
  const inicial: PorMes = Object.fromEntries(meses.map((m) => [m, 0]));
  const final: PorMes = Object.fromEntries(meses.map((m) => [m, 0]));
  for (const c of cuentas) {
    for (const m of meses) {
      inicial[m] = redondear(inicial[m] + c.inicial[m]);
      final[m] = redondear(final[m] + c.final[m]);
    }
  }
  return { inicial, final };
}

/** Meses que alcanza la caja al ritmo de salida operativa promedio (null sin salidas o sin caja). */
export function mesesDeCaja(caja: number, salidaOperativaPromedio: number): number | null {
  if (salidaOperativaPromedio <= 0 || caja <= 0) return null;
  return caja / salidaOperativaPromedio;
}

export const total = suma;

export interface ResumenFlujo {
  estado: EstadoFlujo;
  cuentas: SaldoCuenta[];
  caja: { inicial: PorMes; final: PorMes };
  /** Diferencia de cambio de las cuentas en otra moneda (ceros si todas están en la moneda en que se ve). */
  diferenciaCambio: PorMes;
  /** Si hay al menos un saldo inicial cargado (sin ninguno, la caja es solo el flujo acumulado). */
  conSaldos: boolean;
  /** Cuentas con movimiento en la ventana y sin saldo inicial. */
  cuentasSinSaldo: number;
  cajaFinal: number;
  salidaOperativaPromedio: number;
  mesesDeCaja: number | null;
}

/**
 * Todo lo que muestra la página (y baja el Excel) para una ventana de meses. Con `conversion` y alguna cuenta en otra
 * moneda, sus saldos se pasan a la moneda en que se ve y aparece la diferencia de cambio (migración 0923).
 */
export function resumirFlujo(
  filas: FilaFlujo[],
  saldos: SaldoInicial[],
  cuentas: CuentaFlujo[],
  meses: string[],
  conversion?: ConversionFlujo | null,
): ResumenFlujo {
  const estado = armarFlujo(filas, meses);
  const hayOtras = !!conversion && Object.values(conversion.monedaCuenta).some((m) => m !== conversion.moneda);
  const porCuenta = hayOtras ? saldosConvertidos(filas, saldos, cuentas, meses, conversion!) : saldosPorCuenta(filas, saldos, cuentas, meses);
  const caja = cajaTotal(porCuenta, meses);
  const diferenciaCambio: PorMes = Object.fromEntries(meses.map((m) => [m, 0]));
  for (const c of porCuenta) for (const m of meses) diferenciaCambio[m] = redondear(diferenciaCambio[m] + (c.diferencia?.[m] ?? 0));
  const ultimo = meses[meses.length - 1];
  const operativo = estado.bloques.find((b) => b.bloque === "operativo");
  const salidaOperativaPromedio = meses.length && operativo ? suma(operativo.salidas) / meses.length : 0;
  const cajaFinal = ultimo ? caja.final[ultimo] : 0;
  const cuentasSinSaldo = porCuenta.filter(
    (c) => !c.conSaldo && c.id !== SIN_CUENTA && c.id !== PAGOS_TARJETA && meses.some((m) => c.entradas[m] || c.salidas[m] || c.traspasos[m]),
  ).length;
  return {
    estado,
    cuentas: porCuenta,
    caja,
    diferenciaCambio,
    conSaldos: saldos.length > 0,
    cuentasSinSaldo,
    cajaFinal,
    salidaOperativaPromedio,
    mesesDeCaja: mesesDeCaja(cajaFinal, salidaOperativaPromedio),
  };
}

// ---------------------------------------------------------------------------------------------
// Filas del estado (las usan la tabla de la página y la descarga en Excel)
// ---------------------------------------------------------------------------------------------

export type TipoFilaFlujo = "grupo" | "seccion" | "detalle" | "resultado";

export interface FilaEstadoFlujo {
  clave: string;
  etiqueta: string;
  tipo: TipoFilaFlujo;
  valores: PorMes;
  /** La columna Total: por defecto la suma de los meses; un saldo lleva el del primer o el último mes. */
  total?: number | null;
}

/**
 * Las filas de la tabla por cuenta: cada cuenta con su saldo final por mes y, debajo, saldo inicial, entradas, salidas y
 * traspasos. Se omiten las cuentas sin saldo ni movimiento en la ventana.
 */
export function filasPorCuenta(cuentas: SaldoCuenta[], meses: string[]): FilaEstadoFlujo[] {
  const primero = meses[0];
  const ultimo = meses[meses.length - 1];
  const filas: FilaEstadoFlujo[] = [];
  for (const c of cuentas) {
    const vacia = meses.every((m) => !c.inicial[m] && !c.entradas[m] && !c.salidas[m] && !c.traspasos[m]);
    if (vacia) continue;
    const negativo = (o: PorMes) => Object.fromEntries(meses.map((m) => [m, -o[m]]));
    filas.push({
      clave: `${c.id}-final`,
      etiqueta: c.conSaldo || c.id === SIN_CUENTA || c.id === PAGOS_TARJETA ? c.nombre : `${c.nombre} · sin saldo inicial`,
      tipo: "grupo",
      valores: c.final,
      total: c.final[ultimo],
    });
    filas.push({ clave: `${c.id}-inicial`, etiqueta: "Saldo inicial", tipo: "detalle", valores: c.inicial, total: c.inicial[primero] });
    if (meses.some((m) => c.entradas[m])) filas.push({ clave: `${c.id}-entradas`, etiqueta: "Entradas", tipo: "detalle", valores: c.entradas });
    if (meses.some((m) => c.salidas[m])) filas.push({ clave: `${c.id}-salidas`, etiqueta: "Salidas", tipo: "detalle", valores: negativo(c.salidas) });
    if (meses.some((m) => c.traspasos[m])) filas.push({ clave: `${c.id}-traspasos`, etiqueta: "Traspasos (pago de tarjeta)", tipo: "detalle", valores: c.traspasos });
    if (c.diferencia && meses.some((m) => c.diferencia![m])) filas.push({ clave: `${c.id}-diferencia`, etiqueta: "Diferencia de cambio", tipo: "detalle", valores: c.diferencia });
  }
  return filas;
}

/**
 * Cada bloque con su neto y sus tipos, el flujo neto, la diferencia de cambio (si hay cuentas en otra moneda) y, si se
 * pasa la caja, caja inicial y final.
 */
export function filasEstadoFlujo(estado: EstadoFlujo, caja?: { inicial: PorMes; final: PorMes }, diferenciaCambio?: PorMes): FilaEstadoFlujo[] {
  const filas: FilaEstadoFlujo[] = [];
  const primero = estado.meses[0];
  const ultimo = estado.meses[estado.meses.length - 1];
  if (caja) filas.push({ clave: "caja-inicial", etiqueta: "Caja inicial", tipo: "resultado", valores: caja.inicial, total: caja.inicial[primero] });
  for (const b of estado.bloques) {
    if (!b.lineas.length) continue;
    filas.push({ clave: b.bloque, etiqueta: b.etiqueta, tipo: "seccion", valores: b.neto });
    for (const l of b.lineas) {
      filas.push({
        clave: `${b.bloque}-${l.sentido}-${l.tipo}`,
        etiqueta: l.sentido === "entrada" ? `${l.tipo} (entrada)` : l.tipo,
        tipo: "detalle",
        valores: l.meses,
      });
    }
  }
  filas.push({ clave: "neto", etiqueta: "Flujo neto", tipo: "resultado", valores: estado.neto });
  if (diferenciaCambio && estado.meses.some((m) => diferenciaCambio[m])) {
    filas.push({ clave: "diferencia-cambio", etiqueta: "Diferencia de cambio", tipo: "detalle", valores: diferenciaCambio });
  }
  if (caja) filas.push({ clave: "caja-final", etiqueta: "Caja final", tipo: "resultado", valores: caja.final, total: caja.final[ultimo] });
  return filas;
}

/** «2026-03» o «2026-03-01» → «2026-03-01»; cualquier otra cosa → null. */
export function leerMes(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{4})-(\d{2})(?:-01)?$/);
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12 || Number(m[1]) < 2000 || Number(m[1]) > 2100) return null;
  return `${m[1]}-${m[2]}-01`;
}

/**
 * La ventana que se pide en la dirección (`?desde=2026-01&hasta=2026-06`), dentro de los meses con datos. Sin
 * parámetros, los últimos 12 meses con datos. Si vienen al revés, se dan vuelta.
 */
export function ventanaPedida(desde: unknown, hasta: unknown, disponibles: string[]): string[] {
  if (!disponibles.length) return [];
  const primero = disponibles[0];
  const ultimo = disponibles[disponibles.length - 1];
  let d = leerMes(desde) ?? null;
  let h = leerMes(hasta) ?? null;
  if (!d && !h) return rangoMeses(disponibles[Math.max(0, disponibles.length - 12)], ultimo);
  d = d ?? primero;
  h = h ?? ultimo;
  if (d > h) [d, h] = [h, d];
  return rangoMeses(d, h);
}
