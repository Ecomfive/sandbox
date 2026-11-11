// Portal AF4 360° › Proyección de caja a 13 semanas (/proyeccion-caja). Lógica pura: arma, semana a semana (lunes a
// domingo, hora de Panamá), las entradas y salidas esperadas de las próximas 13 semanas a partir de la caja de hoy, con
// tres escenarios, y compara las proyecciones guardadas con lo que pasó. Sirve en el servidor y en el cliente. Los datos
// los lee `cargar-proyeccion.ts`; prueba en `proyeccion-caja.test.ts`.
//
// Reglas:
//  · Semana 1 = la semana de hoy (de hoy al domingo). Lo que ya venció (o no tiene fecha) cae en la semana 1.
//  · Lo que sale de un promedio (ventas, repartidores, marketing, otros gastos, dividendos, reposición de mercancía) usa
//    las últimas 8 semanas completas con datos de su fuente; si la fuente empezó dentro de la ventana, el promedio se
//    divide entre las semanas desde la primera con datos. En la semana 1 cuenta solo la parte de la semana que queda.
//  · Ventas por tienda: envíos por semana × tasa de entrega (entregadas ÷ entregadas + devueltas) × ticket promedio de
//    las entregadas, menos la comisión de la pasarela de cada método. Una tienda sin envíos en las dos últimas semanas de
//    la ventana se da por cerrada, y una tienda sin ingresos en el libro es de un tercero (como en Rentabilidad).
//  · Lo que se conoce con fecha (retiros de Dropi abiertos, compras abiertas, cierres de repartidores) y lo que va al
//    ritmo del libro (ingresos de otras unidades, mercancía, otros envíos) no se cuenta dos veces: cada semana el ritmo
//    solo completa lo que falta.
//  · Escenarios: base; conservador (ventas −15 %, cobros una semana tarde); estrés (ventas −30 %, cobros una semana
//    tarde). Las ventas son las de las tiendas y los otros ingresos al ritmo del libro; bajarlas baja también los envíos
//    (son variables). Un cobro corrido una semana que sale de las 13 semanas no se cuenta.

import { rubroCostoVentas } from "./rentabilidad";

export const SEMANAS = 13;
/** Semanas completas que alimentan cada promedio. */
export const VENTANA_SEMANAS = 8;
/** Semanas del promedio de los retiros de dividendos (son irregulares: un trimestre). */
export const VENTANA_DIVIDENDOS = 13;

const redondear = (v: number) => Math.round(v * 100) / 100;
const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------------------------
// Fechas (AAAA-MM-DD, sin hora)
// ---------------------------------------------------------------------------------------------

const aFecha = (f: string) => new Date(`${f.slice(0, 10)}T00:00:00Z`);
const aTexto = (d: Date) => d.toISOString().slice(0, 10);

export function sumarDias(f: string, n: number): string {
  const d = aFecha(f);
  d.setUTCDate(d.getUTCDate() + n);
  return aTexto(d);
}

/** Días de `a` a `b` (positivo si `b` es posterior). */
export const diasEntre = (a: string, b: string) => Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / 86_400_000);

/** El lunes de la semana de una fecha. */
export function lunesDe(f: string): string {
  const dia = aFecha(f).getUTCDay(); // 0 = domingo
  return sumarDias(f, -((dia + 6) % 7));
}

/** Último día del mes de una fecha. */
export function finDeMes(f: string): string {
  const d = aFecha(`${f.slice(0, 7)}-01`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return aTexto(d);
}

/** Los lunes de las 13 semanas de la proyección (la primera es la de hoy). */
export function semanasProyeccion(hoy: string, n = SEMANAS): string[] {
  const primero = lunesDe(hoy);
  return Array.from({ length: n }, (_, i) => sumarDias(primero, i * 7));
}

/** Los lunes de las `n` semanas completas que terminan el domingo anterior a la semana de `hasta` (incluida si `incluir`). */
export function ventanaSemanas(hasta: string, n = VENTANA_SEMANAS, incluirSemanaDeHasta = false): string[] {
  const ultimo = incluirSemanaDeHasta ? lunesDe(hasta) : sumarDias(lunesDe(hasta), -7);
  return Array.from({ length: n }, (_, i) => sumarDias(ultimo, (i - n + 1) * 7));
}

/**
 * La ventana de un promedio: las `n` semanas completas que terminan como tarde el domingo anterior a hoy y como tarde el
 * último día con datos completos de la fuente (`completoHasta`). Si `completoHasta` es un domingo, su semana cuenta.
 */
export function ventanaPromedio(hoy: string, completoHasta: string | null, n = VENTANA_SEMANAS): string[] {
  const tope = completoHasta && completoHasta < hoy ? completoHasta : sumarDias(hoy, -1);
  const domingo = aFecha(tope).getUTCDay() === 0;
  return ventanaSemanas(tope, n, domingo);
}

/** La semana (0 a 12) en la que cae una fecha; lo anterior a hoy cae en la 0; lo posterior a la última, `null`. */
export function indiceSemana(semanas: string[], fecha: string | null, hoy: string): number | null {
  if (!fecha || fecha < hoy) return 0;
  const i = Math.floor(diasEntre(semanas[0], fecha) / 7);
  return i < semanas.length ? i : null;
}

/** La parte de la semana 1 que queda (de hoy al domingo, en séptimos). */
export const fraccionPrimeraSemana = (hoy: string) => (7 - ((aFecha(hoy).getUTCDay() + 6) % 7)) / 7;

/** «6 oct». */
export function diaCorto(f: string): string {
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;
}

// ---------------------------------------------------------------------------------------------
// Partidas
// ---------------------------------------------------------------------------------------------

export type Concepto =
  | "ventas"
  | "retiros_dropi"
  | "dropi_transito"
  | "otros_ingresos"
  | "cxc"
  | "ajustes_entrada"
  | "cxp"
  | "compras"
  | "mercancia"
  | "nomina"
  | "repartidores"
  | "marketing"
  | "recurrentes"
  | "otros_gastos"
  | "impuestos"
  | "dividendos"
  | "deuda"
  | "ajustes_salida";

export type Grupo = "entradas" | "salidas";

export const CONCEPTOS: { clave: Concepto; etiqueta: string; grupo: Grupo }[] = [
  { clave: "ventas", etiqueta: "Cobro de ventas", grupo: "entradas" },
  { clave: "retiros_dropi", etiqueta: "Retiros de Dropi", grupo: "entradas" },
  { clave: "dropi_transito", etiqueta: "Pedidos de Dropi en tránsito", grupo: "entradas" },
  { clave: "otros_ingresos", etiqueta: "Otros ingresos", grupo: "entradas" },
  { clave: "cxc", etiqueta: "Cuentas por cobrar", grupo: "entradas" },
  { clave: "ajustes_entrada", etiqueta: "Ajustes manuales", grupo: "entradas" },
  { clave: "cxp", etiqueta: "Cuentas por pagar", grupo: "salidas" },
  { clave: "compras", etiqueta: "Compras abiertas", grupo: "salidas" },
  { clave: "mercancia", etiqueta: "Reposición de mercancía", grupo: "salidas" },
  { clave: "nomina", etiqueta: "Nómina", grupo: "salidas" },
  { clave: "repartidores", etiqueta: "Envíos y repartidores", grupo: "salidas" },
  { clave: "marketing", etiqueta: "Marketing", grupo: "salidas" },
  { clave: "recurrentes", etiqueta: "Gastos fijos recurrentes", grupo: "salidas" },
  { clave: "otros_gastos", etiqueta: "Otros gastos operativos", grupo: "salidas" },
  { clave: "impuestos", etiqueta: "Impuestos", grupo: "salidas" },
  { clave: "dividendos", etiqueta: "Retiros de dividendos", grupo: "salidas" },
  { clave: "deuda", etiqueta: "Préstamos y líneas de crédito", grupo: "salidas" },
  { clave: "ajustes_salida", etiqueta: "Ajustes manuales", grupo: "salidas" },
];

export const esConcepto = (v: unknown): v is Concepto => typeof v === "string" && CONCEPTOS.some((c) => c.clave === v);
export const grupoDe = (c: Concepto): Grupo => CONCEPTOS.find((x) => x.clave === c)!.grupo;
export const etiquetaConcepto = (c: Concepto) => CONCEPTOS.find((x) => x.clave === c)!.etiqueta;

/** Lo que mueve una partida en cada semana (positivo; el grupo dice si entra o sale). */
export interface Linea {
  concepto: Concepto;
  detalle: string;
  valores: number[];
}

const ceros = (n = SEMANAS) => Array.from({ length: n }, () => 0);

function agregar(lineas: Map<string, Linea>, concepto: Concepto, detalle: string, semana: number | null, monto: number, n = SEMANAS) {
  if (semana === null || !monto) return;
  const clave = `${concepto}|${detalle}`;
  const l = lineas.get(clave) ?? { concepto, detalle, valores: ceros(n) };
  l.valores[semana] = redondear(l.valores[semana] + monto);
  lineas.set(clave, l);
}

/** Una partida que se repite igual cada semana (la 1, en proporción a lo que queda de ella). */
export function lineaPromedio(concepto: Concepto, detalle: string, porSemana: number, hoy: string, n = SEMANAS): Linea {
  const f = fraccionPrimeraSemana(hoy);
  return { concepto, detalle, valores: Array.from({ length: n }, (_, i) => redondear(porSemana * (i === 0 ? f : 1))) };
}

/**
 * Promedio semanal de unos montos en una ventana de semanas (lunes). Si los datos empiezan dentro de la ventana, se
 * divide entre las semanas desde la primera con datos. Sin datos, 0.
 */
export function promedioSemanal(montos: { fecha: string; monto: number }[], ventana: string[]): number {
  if (!ventana.length) return 0;
  const desde = ventana[0];
  const hasta = sumarDias(ventana[ventana.length - 1], 6);
  let total = 0;
  let primera: string | null = null;
  for (const m of montos) {
    const f = m.fecha.slice(0, 10);
    if (f < desde || f > hasta) continue;
    total += m.monto;
    const s = lunesDe(f);
    if (!primera || s < primera) primera = s;
  }
  if (!primera) return 0;
  const semanas = ventana.filter((s) => s >= primera!).length;
  return redondear(total / Math.max(semanas, 1));
}

// ---------------------------------------------------------------------------------------------
// Ventas por tienda
// ---------------------------------------------------------------------------------------------

/** Una tienda, semana de envío y método de pago (agregado en Postgres). */
export interface VentaSemana {
  unidad_id: string;
  /** Lunes de la semana de la fecha de envío. */
  semana: string;
  metodo: string | null;
  enviadas: number;
  entregadas: number;
  devueltas: number;
  valor_entregadas: number;
}

export interface SupuestoVentas {
  unidad_id: string;
  enviadasPorSemana: number;
  tasaEntrega: number;
  ticket: number;
  comision: number;
  cobroPorSemana: number;
}

/**
 * Lo que cobra cada tienda por semana: envíos promedio × tasa de entrega × ticket, menos comisiones. `comisiones` es la
 * parte que se queda la pasarela de cada método (0,02 = 2 %). Las tiendas sin envíos en las dos últimas semanas de la
 * ventana no cuentan, ni las que no están en `propias` (tiendas con ingresos en el libro), si se pasa.
 */
export function supuestosVentas(filas: VentaSemana[], ventana: string[], comisiones: Record<string, number> = {}, propias?: Set<string>): SupuestoVentas[] {
  const enVentana = new Set(ventana);
  const porTienda = new Map<string, VentaSemana[]>();
  for (const f of filas) {
    if (!enVentana.has(f.semana) || (propias && !propias.has(f.unidad_id))) continue;
    porTienda.set(f.unidad_id, [...(porTienda.get(f.unidad_id) ?? []), f]);
  }
  const ultimas = new Set(ventana.slice(-2));
  const salida: SupuestoVentas[] = [];
  for (const [unidad_id, fs] of porTienda) {
    if (!fs.some((f) => ultimas.has(f.semana) && f.enviadas > 0)) continue;
    const conEnvios = fs.filter((f) => f.enviadas > 0).map((f) => f.semana).sort();
    if (!conEnvios.length) continue;
    const semanas = ventana.filter((s) => s >= conEnvios[0]).length;
    const enviadas = suma(fs.map((f) => f.enviadas));
    const entregadas = suma(fs.map((f) => f.entregadas));
    const devueltas = suma(fs.map((f) => f.devueltas));
    const valor = suma(fs.map((f) => f.valor_entregadas));
    if (!entregadas || valor <= 0) continue;
    const tasa = entregadas / (entregadas + devueltas);
    const ticket = valor / entregadas;
    const comision = suma(fs.map((f) => f.valor_entregadas * (comisiones[f.metodo ?? ""] ?? 0))) / valor;
    const enviadasPorSemana = enviadas / semanas;
    salida.push({
      unidad_id,
      enviadasPorSemana: redondear(enviadasPorSemana),
      tasaEntrega: Math.round(tasa * 10_000) / 10_000,
      ticket: redondear(ticket),
      comision: Math.round(comision * 10_000) / 10_000,
      cobroPorSemana: redondear(enviadasPorSemana * tasa * ticket * (1 - comision)),
    });
  }
  return salida.sort((a, b) => b.cobroPorSemana - a.cobroPorSemana);
}

export function lineasVentas(supuestos: SupuestoVentas[], nombres: Map<string, string>, hoy: string): Linea[] {
  return supuestos.map((s) => lineaPromedio("ventas", nombres.get(s.unidad_id) ?? "Sin tienda", s.cobroPorSemana, hoy));
}

// ---------------------------------------------------------------------------------------------
// Cuentas por cobrar y por pagar, retiros de Dropi, compras
// ---------------------------------------------------------------------------------------------

export interface DocumentoCartera {
  clase: "cobrar" | "pagar";
  saldo: number;
  /** Vencimiento efectivo (el del documento o emisión + 30 días); null = sin fecha. */
  vencimiento: string | null;
}

export interface Probabilidades {
  /** Parte de lo vencido por cobrar que se espera cobrar en la semana 1 (0 a 1). */
  cobroVencido: number;
  /** Parte de lo vencido por pagar que se paga en la semana 1 (0 a 1). */
  pagoVencido: number;
}

export const PROBABILIDADES_POR_DEFECTO: Probabilidades = { cobroVencido: 0.5, pagoVencido: 1 };

/** Por vencer: en la semana de su vencimiento. Vencido o sin fecha: en la semana 1, por su probabilidad. */
export function lineasCartera(docs: DocumentoCartera[], hoy: string, semanas: string[], p: Probabilidades): Linea[] {
  const lineas = new Map<string, Linea>();
  for (const d of docs) {
    if (d.saldo <= 0.005) continue;
    const concepto: Concepto = d.clase === "cobrar" ? "cxc" : "cxp";
    if (!d.vencimiento || d.vencimiento < hoy) {
      agregar(lineas, concepto, "Vencido", 0, d.saldo * (d.clase === "cobrar" ? p.cobroVencido : p.pagoVencido));
    } else agregar(lineas, concepto, "Por vencer", indiceSemana(semanas, d.vencimiento, hoy), d.saldo);
  }
  return [...lineas.values()];
}

export interface RetiroAbierto {
  etiqueta: string;
  monto: number;
  fecha: string;
}

/**
 * Partidas con su fecha (pedidos de Dropi en tránsito, cuotas de deuda): cada una en la semana de su fecha (lo que ya pasó,
 * en la semana 1; lo que cae después de las 13 semanas, fuera).
 */
export function lineasFechadas(concepto: Concepto, items: { detalle: string; fecha: string; monto: number }[], hoy: string, semanas: string[]): Linea[] {
  const lineas = new Map<string, Linea>();
  for (const x of items) agregar(lineas, concepto, x.detalle, indiceSemana(semanas, x.fecha, hoy), x.monto, semanas.length);
  return [...lineas.values()];
}

/** Un retiro de Dropi llega `dias` después de pedido (lo que ya debió llegar, en la semana 1). */
export function lineasRetiros(retiros: RetiroAbierto[], dias: number, hoy: string, semanas: string[]): Linea[] {
  const lineas = new Map<string, Linea>();
  for (const r of retiros) agregar(lineas, "retiros_dropi", r.etiqueta, indiceSemana(semanas, sumarDias(r.fecha, Math.round(dias)), hoy), r.monto);
  return [...lineas.values()];
}

/** Días promedio entre pedir un retiro y recibirlo (sin historia, 3). */
export function diasDeRetiro(cerrados: { fecha: string; recibido: string }[]): number {
  const dias = cerrados.map((r) => diasEntre(r.fecha, r.recibido)).filter((d) => d >= 0 && d <= 60);
  return dias.length ? Math.round((suma(dias) / dias.length) * 10) / 10 : 3;
}

export interface CompraAbierta {
  etiqueta: string;
  monto_total: number;
  primer_pago: number | null;
  segundo_pago: number | null;
  pagado_a_proveedor: number | null;
  fecha_pago_1: string | null;
  fecha_pago_2: string | null;
  fecha_envio: string | null;
  fecha_limite: string | null;
  fecha_llegada: string | null;
}

/** Lo que falta pagarle al proveedor (la misma regla que el capital de trabajo). */
export const pendienteCompra = (c: CompraAbierta) =>
  redondear(Math.max(c.monto_total - (c.pagado_a_proveedor ?? (c.primer_pago ?? 0) + (c.segundo_pago ?? 0)), 0));

/**
 * Cuándo se paga lo pendiente de una compra: la fecha del pago que falta (el segundo si ya hubo un primero), si no la de
 * envío, la límite o la de llegada, la primera que no haya pasado. Si todas pasaron, semana 1; sin ninguna fecha, `null`
 * (se reparte en las primeras cuatro semanas).
 */
export function fechaPagoCompra(c: CompraAbierta, hoy: string): string | null {
  const yaPago = (c.pagado_a_proveedor ?? 0) > 0 || (c.primer_pago ?? 0) > 0;
  const candidatas = [yaPago ? c.fecha_pago_2 : c.fecha_pago_1, c.fecha_envio, c.fecha_limite, c.fecha_llegada].filter((f): f is string => !!f);
  if (!candidatas.length) return null;
  return candidatas.find((f) => f >= hoy) ?? hoy;
}

export const SEMANAS_COMPRA_SIN_FECHA = 4;

export function lineasCompras(compras: CompraAbierta[], hoy: string, semanas: string[]): Linea[] {
  const lineas = new Map<string, Linea>();
  for (const c of compras) {
    const pendiente = pendienteCompra(c);
    if (pendiente <= 0) continue;
    const fecha = fechaPagoCompra(c, hoy);
    if (fecha) agregar(lineas, "compras", c.etiqueta, indiceSemana(semanas, fecha, hoy), pendiente);
    else for (let i = 0; i < SEMANAS_COMPRA_SIN_FECHA; i++) agregar(lineas, "compras", c.etiqueta, i, pendiente / SEMANAS_COMPRA_SIN_FECHA);
  }
  return [...lineas.values()];
}

/**
 * Una partida al ritmo de las últimas semanas sin contar dos veces lo que ya se conoce con fecha (las compras abiertas
 * para la mercancía, los retiros abiertos para los ingresos de Dropi, los cierres para los envíos): cada semana suma lo
 * que falte para llegar al ritmo (si lo conocido de esa semana ya lo pasa, nada).
 */
export function lineaRitmo(concepto: Concepto, detalle: string, ritmoSemanal: number, conocidas: Linea[], hoy: string): Linea | null {
  if (ritmoSemanal <= 0) return null;
  const base = lineaPromedio(concepto, detalle, ritmoSemanal, hoy);
  const conocido = ceros();
  for (const c of conocidas) c.valores.forEach((v, i) => (conocido[i] += v));
  const valores = base.valores.map((v, i) => redondear(Math.max(v - conocido[i], 0)));
  return valores.some((v) => v > 0) ? { ...base, valores } : null;
}

// ---------------------------------------------------------------------------------------------
// Nómina
// ---------------------------------------------------------------------------------------------

/** Un pago habitual: a cuántos días del comienzo del mes de la nómina (14 = el 15; puede pasar al mes siguiente). */
export interface PagoHabitual {
  dia: number;
  fraccion: number;
}

/** Sin fechas de pago: quincena (el 15) y fin de mes, mitad y mitad. */
export const PATRON_QUINCENAL: PagoHabitual[] = [
  { dia: 14, fraccion: 0.5 },
  { dia: 30, fraccion: 0.5 },
];

/**
 * El patrón de pagos de una nómina a partir de sus pagos reales: los días (desde el comienzo del mes de la nómina) se
 * parten en primera quincena (hasta el día 20) y fin de mes (del 21 en adelante, también lo pagado los primeros días del
 * mes siguiente); cada parte es un pago en su día mediano (por monto) con su parte del total. Sin fechas, la quincena.
 * Un fin de mes entre el 28 y el 31 se toma como el último día.
 */
export function patronPagos(pagos: { periodo: string; fecha: string | null; monto: number }[]): PagoHabitual[] {
  const puntos = pagos
    .filter((p) => p.fecha && p.monto > 0)
    .map((p) => ({ dia: diasEntre(p.periodo.slice(0, 10), p.fecha!.slice(0, 10)), monto: p.monto }))
    .filter((p) => p.dia >= -5 && p.dia <= 45)
    .sort((a, b) => a.dia - b.dia);
  const total = suma(puntos.map((p) => p.monto));
  if (!puntos.length || total <= 0) return PATRON_QUINCENAL;
  const grupos = [puntos.filter((p) => p.dia <= 19), puntos.filter((p) => p.dia > 19)].filter((g) => g.length);
  const patron = grupos.map((g) => {
    const monto = suma(g.map((p) => p.monto));
    let acumulado = 0;
    const mediano = g.find((p) => (acumulado += p.monto) >= monto / 2)!.dia;
    return { dia: mediano >= 27 && mediano <= 30 ? 30 : mediano, fraccion: monto / total };
  });
  // Los grupos muy chicos se suman al más cercano.
  const grandes = patron.filter((p) => p.fraccion >= 0.05);
  for (const chico of patron.filter((p) => p.fraccion < 0.05)) {
    const cercano = grandes.reduce((a, b) => (Math.abs(b.dia - chico.dia) < Math.abs(a.dia - chico.dia) ? b : a), grandes[0]);
    if (cercano) cercano.fraccion += chico.fraccion;
  }
  return grandes.map((p) => ({ dia: p.dia, fraccion: Math.round(p.fraccion * 10_000) / 10_000 }));
}

/** La fecha de un pago habitual en el mes de una nómina (30 = el último día del mes). */
export function fechaDePago(periodo: string, dia: number): string {
  const inicio = `${periodo.slice(0, 7)}-01`;
  if (dia === 30) return finDeMes(inicio);
  return sumarDias(inicio, dia);
}

export interface CostoNomina {
  /** AAAA-MM-01. */
  periodo: string;
  tipo: string;
  /** Lo que sale de caja en el mes (neto + retenciones). */
  monto: number;
}

const ETIQUETA_NOMINA: Record<string, string> = { formal: "Planilla formal", externa: "Colaboradores externos" };

/**
 * La nómina de cada mes de la proyección (la del mes si ya está cargada; si no, la del último mes cargado), repartida en
 * sus pagos habituales. Se mira desde el mes anterior a hoy, por si un pago de ese mes cae después de hoy.
 */
export function lineasNomina(costos: CostoNomina[], patrones: Record<string, PagoHabitual[]>, hoy: string, semanas: string[]): Linea[] {
  const lineas = new Map<string, Linea>();
  const fin = sumarDias(semanas[semanas.length - 1], 6);
  const tipos = [...new Set(costos.map((c) => c.tipo))].sort();
  for (const tipo of tipos) {
    const delTipo = costos.filter((c) => c.tipo === tipo).sort((a, b) => a.periodo.localeCompare(b.periodo));
    const hasta = `${hoy.slice(0, 7)}-01`;
    if (!delTipo.some((c) => c.periodo <= hasta)) continue;
    let mes = `${sumarDias(hasta, -1).slice(0, 7)}-01`;
    while (mes <= fin) {
      const propio = delTipo.find((c) => c.periodo === mes);
      const ultimo = [...delTipo].reverse().find((c) => c.periodo <= mes);
      const monto = (propio ?? ultimo)?.monto ?? 0;
      // El mes anterior a hoy solo cuenta si su nómina está cargada.
      if (monto > 0 && (propio || mes >= hasta)) {
        for (const p of patrones[tipo] ?? PATRON_QUINCENAL) {
          const fecha = fechaDePago(mes, p.dia);
          if (fecha < hoy || fecha > fin) continue;
          agregar(lineas, "nomina", ETIQUETA_NOMINA[tipo] ?? tipo, indiceSemana(semanas, fecha, hoy), monto * p.fraccion);
        }
      }
      mes = `${sumarDias(finDeMes(mes), 1).slice(0, 7)}-01`;
    }
  }
  return [...lineas.values()];
}

// ---------------------------------------------------------------------------------------------
// Libro: clasificación, gastos recurrentes, impuestos y promedios
// ---------------------------------------------------------------------------------------------

/** Un movimiento del libro con FLUJO = SI (o PAGO TDC), con los datos de su tipo. */
export interface MovimientoLibro {
  /** Fecha de pago (si falta, el mes del libro). */
  fecha: string;
  unidad_id?: string | null;
  tipo: string | null;
  seccion: string | null;
  /** 1 entrada, −1 salida. */
  signo: number;
  bloque: string | null;
  descripcion: string;
  /** Con su signo de reverso (negativo resta de su tipo). */
  monto: number;
  esBienDeUso?: boolean;
}

export type RubroLibro =
  | "ingresos"
  | "otras_entradas"
  | "mercancia"
  | "envio"
  | "nomina"
  | "marketing"
  | "impuestos"
  | "dividendos"
  | "inversion"
  | "intertiendas"
  | "gasto"
  | "fuera";

const sinAcentos = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();

export const TIPOS_NOMINA = ["SUELDOS", "OTROS SUELDOS"];
export const TIPOS_DIVIDENDOS = ["RETIRO DE DIVIDENDOS", "DIVIDENDOS"];

export function esTipoImpuesto(tipo: string | null, seccion: string | null): boolean {
  if (seccion === "impuesto_ganancias") return true;
  const n = sinAcentos(tipo ?? "");
  if (n.startsWith("IMPORTACION")) return false;
  return /IMPUESTO|ITBMS|\bDGI\b|TASA UNICA/.test(n);
}

/** A qué parte de la proyección corresponde un movimiento del libro. */
export function rubroLibro(m: Pick<MovimientoLibro, "tipo" | "seccion" | "signo" | "bloque" | "esBienDeUso">): RubroLibro {
  const n = sinAcentos(m.tipo ?? "");
  if (m.seccion === "informacion" || m.seccion === "pago_tdc" || m.seccion === "depreciacion") return "fuera";
  // Ingresos y devoluciones: lo que se cobra de las ventas (la devolución lo baja).
  if (m.seccion === "ingresos") return "ingresos";
  if (m.signo === 1) return "otras_entradas";
  if (TIPOS_NOMINA.includes(n)) return "nomina";
  if (TIPOS_DIVIDENDOS.includes(n)) return "dividendos";
  if (m.seccion === "marketing") return "marketing";
  if (esTipoImpuesto(m.tipo, m.seccion)) return "impuestos";
  if (m.esBienDeUso || m.bloque === "inversion") return "inversion";
  if (n.includes("INTERTIENDA")) return "intertiendas";
  if (m.seccion === "costo_ventas") {
    const r = rubroCostoVentas(m.tipo ?? "");
    if (r === "mercancia") return "mercancia";
    if (r === "envio") return "envio";
  }
  return "gasto";
}

/** La descripción sin números, fechas, meses ni signos: lo que la hace «la misma» de un mes a otro. */
export function descripcionBase(d: string): string {
  return sinAcentos(d)
    .replace(/\b(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|SETIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE|ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SEPT|OCT|NOV|DIC)\b/g, " ")
    .replace(/[^A-Z ]+/g, " ")
    .replace(/\b[A-Z]\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface GastoRecurrente {
  clave: string;
  tipo: string;
  descripcion: string;
  /** Monto mensual (mediana de los meses en que aparece). */
  monto: number;
  /** Día del mes en que se suele pagar (mediana). */
  dia: number;
  /** En cuántos de los meses mirados aparece. */
  meses: number;
}

const mediana = (xs: number[]) => {
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};

export interface OpcionesRecurrentes {
  /** Meses (AAAA-MM-01) completos que se miran, del más viejo al más nuevo. */
  meses: string[];
  /** En cuántos de esos meses tiene que aparecer. */
  minMeses: number;
  /** Cuánto puede alejarse el monto de cada mes de la mediana (0,25 = ±25 %). */
  tolerancia: number;
  /** Juntar por tipo y descripción (gastos fijos) o solo por tipo (impuestos). */
  porDescripcion: boolean;
}

export const OPCIONES_RECURRENTES = { minMeses: 3, tolerancia: 0.25, porDescripcion: true };
/** Debajo de este monto mensual no vale la pena una línea (cargos de centavos del banco). */
export const MONTO_MINIMO_RECURRENTE = 5;
export const OPCIONES_IMPUESTOS = { minMeses: 2, tolerancia: Number.POSITIVE_INFINITY, porDescripcion: false };

/**
 * Pagos que se repiten cada mes con un monto parecido (alquiler, sistemas, cuotas): se juntan por tipo y descripción
 * base; cuentan los que aparecen en al menos `minMeses` de los meses mirados con cada mes a ±`tolerancia` de la mediana.
 */
export function detectarRecurrentes(movs: MovimientoLibro[], o: OpcionesRecurrentes): GastoRecurrente[] {
  const meses = new Set(o.meses.map((m) => m.slice(0, 7)));
  const grupos = new Map<string, { tipo: string; descripcion: string; porMes: Map<string, number>; dias: number[] }>();
  for (const m of movs) {
    const mes = m.fecha.slice(0, 7);
    if (!meses.has(mes) || !m.tipo) continue;
    const base = o.porDescripcion ? descripcionBase(m.descripcion) : "";
    if (o.porDescripcion && !base) continue;
    const clave = `${m.tipo}|${base}`;
    const g = grupos.get(clave) ?? { tipo: m.tipo, descripcion: base, porMes: new Map<string, number>(), dias: [] as number[] };
    g.porMes.set(mes, (g.porMes.get(mes) ?? 0) + m.monto);
    if (m.monto > 0) g.dias.push(Number(m.fecha.slice(8, 10)));
    grupos.set(clave, g);
  }
  const salida: GastoRecurrente[] = [];
  for (const [clave, g] of grupos) {
    const montos = [...g.porMes.values()].filter((v) => v > 0.005);
    if (montos.length < o.minMeses) continue;
    const med = mediana(montos);
    const ultimos = [...g.porMes.entries()].filter(([, v]) => v > 0.005).sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
    const monto = o.tolerancia === Number.POSITIVE_INFINITY ? suma(ultimos.slice(-3)) / Math.min(ultimos.length, 3) : med;
    if (montos.some((v) => Math.abs(v - med) > med * o.tolerancia) || monto < MONTO_MINIMO_RECURRENTE) continue;
    salida.push({ clave, tipo: g.tipo, descripcion: g.descripcion, monto: redondear(monto), dia: Math.round(mediana(g.dias.length ? g.dias : [15])), meses: montos.length });
  }
  return salida.sort((a, b) => b.monto - a.monto);
}

/** Cada gasto recurrente en su día de cada mes de la proyección (desde hoy). */
export function lineasRecurrentes(gastos: GastoRecurrente[], concepto: Concepto, hoy: string, semanas: string[], etiqueta: (g: GastoRecurrente) => string): Linea[] {
  const lineas = new Map<string, Linea>();
  const fin = sumarDias(semanas[semanas.length - 1], 6);
  for (const g of gastos) {
    let mes = `${hoy.slice(0, 7)}-01`;
    while (mes <= fin) {
      const ultimo = Number(finDeMes(mes).slice(8, 10));
      const fecha = `${mes.slice(0, 7)}-${String(Math.min(g.dia, ultimo)).padStart(2, "0")}`;
      if (fecha >= hoy && fecha <= fin) agregar(lineas, concepto, etiqueta(g), indiceSemana(semanas, fecha, hoy), g.monto);
      mes = `${sumarDias(finDeMes(mes), 1).slice(0, 7)}-01`;
    }
  }
  return [...lineas.values()];
}

export const etiquetaRecurrente = (g: GastoRecurrente) => {
  const d = g.descripcion.toLowerCase();
  return d ? `${g.tipo} · ${d.charAt(0).toUpperCase()}${d.slice(1)}` : g.tipo;
};

/**
 * El último mes completo del libro antes del mes de hoy: el anterior al de hoy, salvo que tenga menos de la mitad de los
 * movimientos que la mediana de los tres anteriores (todavía se está cargando); entonces el de antes. Un mes cerrado
 * (Cierre de mes) cuenta siempre como completo.
 */
export function ultimoMesCompleto(conteos: Map<string, number>, hoy: string, cerrados: string[] = []): string | null {
  const mesDeHoy = `${hoy.slice(0, 7)}-01`;
  const anterior = (m: string) => `${sumarDias(m, -1).slice(0, 7)}-01`;
  let candidato = anterior(mesDeHoy);
  for (let i = 0; i < 3; i++) {
    if (cerrados.includes(candidato)) return candidato;
    const previos = [1, 2, 3].map((k) => {
      let m = candidato;
      for (let j = 0; j < k; j++) m = anterior(m);
      return conteos.get(m) ?? 0;
    });
    const ref = mediana(previos);
    const n = conteos.get(candidato) ?? 0;
    if (n > 0 && n >= ref * 0.5) return candidato;
    candidato = anterior(candidato);
  }
  return [...conteos.keys()].filter((m) => m < mesDeHoy && (conteos.get(m) ?? 0) > 0).sort().at(-1) ?? null;
}

/** Los `n` meses (AAAA-MM-01) que terminan en `ultimo`. */
export function mesesHasta(ultimo: string, n: number): string[] {
  const salida = [ultimo];
  while (salida.length < n) salida.unshift(`${sumarDias(salida[0], -1).slice(0, 7)}-01`);
  return salida;
}

/** Lo que sale de caja por un movimiento (positivo; un reverso, negativo). */
const salidaDe = (m: MovimientoLibro) => (m.signo === 1 ? -m.monto : m.monto);

export interface PartidasLibro {
  recurrentes: GastoRecurrente[];
  impuestos: GastoRecurrente[];
  marketing: { tipo: string; porSemana: number }[];
  otrosPorSemana: number;
  mercanciaPorSemana: number;
  envioPorSemana: number;
  dividendosPorSemana: number;
  /** Ingresos de las unidades que no son tiendas con ventas (lo que entra de Dropi, por ejemplo), por unidad. */
  ingresosOtros: { unidad_id: string; porSemana: number }[];
  /** Unidades con ingresos en el libro (las tiendas propias). */
  conIngresos: string[];
}

/**
 * Lo que se proyecta desde el libro: gastos recurrentes e impuestos (de los últimos 4 meses completos), y los promedios
 * semanales de marketing (por tipo), otros gastos operativos (sin los recurrentes), mercancía, envíos, dividendos e
 * ingresos de las unidades que no están en `tiendas` (las que tienen ventas por tienda).
 */
export function partidasLibro(
  movs: MovimientoLibro[],
  mesesCompletos: string[],
  ventana: string[],
  ventanaDividendos: string[],
  tiendas: Set<string> = new Set(),
): PartidasLibro {
  const conRubro = movs.map((m) => ({ m, r: rubroLibro(m) }));
  const gastos = conRubro.filter((x) => x.r === "gasto").map((x) => x.m);
  const recurrentes = detectarRecurrentes(gastos, { meses: mesesCompletos.slice(-4), ...OPCIONES_RECURRENTES });
  const impuestos = detectarRecurrentes(
    conRubro.filter((x) => x.r === "impuestos").map((x) => x.m),
    { meses: mesesCompletos.slice(-3), ...OPCIONES_IMPUESTOS },
  );
  const claves = new Set(recurrentes.map((g) => g.clave));
  const otros = gastos.filter((m) => m.bloque !== "financiamiento" && !claves.has(`${m.tipo}|${descripcionBase(m.descripcion)}`));
  const porTipo = new Map<string, { fecha: string; monto: number }[]>();
  for (const x of conRubro) if (x.r === "marketing") porTipo.set(x.m.tipo ?? "Marketing", [...(porTipo.get(x.m.tipo ?? "Marketing") ?? []), { fecha: x.m.fecha, monto: salidaDe(x.m) }]);
  const montos = (xs: MovimientoLibro[]) => xs.map((m) => ({ fecha: m.fecha, monto: salidaDe(m) }));
  const ingresos = conRubro.filter((x) => x.r === "ingresos").map((x) => x.m);
  const porUnidad = new Map<string, { fecha: string; monto: number }[]>();
  for (const m of ingresos) {
    if (!m.unidad_id || tiendas.has(m.unidad_id)) continue;
    porUnidad.set(m.unidad_id, [...(porUnidad.get(m.unidad_id) ?? []), { fecha: m.fecha, monto: m.signo === 1 ? m.monto : -m.monto }]);
  }
  return {
    recurrentes,
    impuestos,
    marketing: [...porTipo.entries()].map(([tipo, ms]) => ({ tipo, porSemana: promedioSemanal(ms, ventana) })).filter((x) => x.porSemana > 0).sort((a, b) => b.porSemana - a.porSemana),
    otrosPorSemana: Math.max(promedioSemanal(montos(otros), ventana), 0),
    mercanciaPorSemana: Math.max(promedioSemanal(montos(conRubro.filter((x) => x.r === "mercancia").map((x) => x.m)), ventana), 0),
    envioPorSemana: Math.max(promedioSemanal(montos(conRubro.filter((x) => x.r === "envio").map((x) => x.m)), ventana), 0),
    dividendosPorSemana: Math.max(promedioSemanal(montos(conRubro.filter((x) => x.r === "dividendos").map((x) => x.m)), ventanaDividendos), 0),
    ingresosOtros: [...porUnidad.entries()]
      .map(([unidad_id, ms]) => ({ unidad_id, porSemana: promedioSemanal(ms, ventana) }))
      .filter((x) => x.porSemana > 0)
      .sort((a, b) => b.porSemana - a.porSemana),
    conIngresos: [...new Set(ingresos.filter((m) => m.signo === 1 && m.monto > 0 && m.unidad_id).map((m) => m.unidad_id!))],
  };
}

// ---------------------------------------------------------------------------------------------
// Ajustes manuales
// ---------------------------------------------------------------------------------------------

export interface AjusteProyeccion {
  id: string;
  /** Lunes de la semana. */
  semana: string;
  concepto: string;
  /** Con signo: positivo entra, negativo sale. */
  monto: number;
  nota: string | null;
}

export function lineasAjustes(ajustes: AjusteProyeccion[], semanas: string[]): Linea[] {
  const lineas = new Map<string, Linea>();
  for (const a of ajustes) {
    const i = semanas.indexOf(a.semana);
    if (i < 0 || !a.monto) continue;
    agregar(lineas, a.monto > 0 ? "ajustes_entrada" : "ajustes_salida", a.concepto, i, Math.abs(a.monto));
  }
  return [...lineas.values()];
}

/** Lee el monto de un ajuste («-1.500,50», «2500.75», «$ 300»): con signo, distinto de cero. */
export function leerMontoAjuste(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v !== 0 && Math.abs(v) < 1e10 ? redondear(v) : null;
  if (typeof v !== "string") return null;
  let t = v.replace(/[\s$]/g, "");
  if (!/^[-+]?[\d.,]+$/.test(t)) return null;
  const coma = t.lastIndexOf(",");
  const punto = t.lastIndexOf(".");
  if (coma > punto) t = t.replace(/\./g, "").replace(",", ".");
  else t = t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) && n !== 0 && Math.abs(n) < 1e10 ? redondear(n) : null;
}

/** Una fecha AAAA-MM-DD válida → el lunes de su semana; cualquier otra cosa → null. */
export function leerSemana(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = aFecha(v);
  if (Number.isNaN(d.getTime()) || aTexto(d) !== v) return null;
  return lunesDe(v);
}

/** Un porcentaje 0–100 («50», «12,5») → fracción 0–1. */
export function leerPorcentaje(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v.replace(",", ".").replace("%", "").trim()) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 10_000 : null;
}

// ---------------------------------------------------------------------------------------------
// Escenarios y armado
// ---------------------------------------------------------------------------------------------

export type Escenario = "base" | "conservador" | "estres";

export const ESCENARIOS: { clave: Escenario; etiqueta: string; factorVentas: number; retrasoCobros: number }[] = [
  { clave: "base", etiqueta: "Base", factorVentas: 1, retrasoCobros: 0 },
  { clave: "conservador", etiqueta: "Conservador", factorVentas: 0.85, retrasoCobros: 1 },
  { clave: "estres", etiqueta: "Estrés", factorVentas: 0.7, retrasoCobros: 1 },
];

export const esEscenario = (v: unknown): v is Escenario => typeof v === "string" && ESCENARIOS.some((e) => e.clave === v);

/** Lo que el escenario baja con las ventas (lo variable). */
export const CON_VENTAS: Concepto[] = ["ventas", "otros_ingresos", "dropi_transito", "repartidores"];
/** Lo que el escenario corre con los cobros. */
export const COBROS: Concepto[] = ["ventas", "otros_ingresos", "retiros_dropi", "dropi_transito", "cxc"];

export function aplicarEscenario(lineas: Linea[], escenario: Escenario): Linea[] {
  const e = ESCENARIOS.find((x) => x.clave === escenario)!;
  return lineas.map((l) => {
    let valores = l.valores;
    if (CON_VENTAS.includes(l.concepto) && e.factorVentas !== 1) valores = valores.map((v) => redondear(v * e.factorVentas));
    if (COBROS.includes(l.concepto) && e.retrasoCobros > 0) valores = [...ceros(e.retrasoCobros), ...valores].slice(0, valores.length);
    return { ...l, valores };
  });
}

export interface FilaConcepto {
  concepto: Concepto;
  etiqueta: string;
  grupo: Grupo;
  valores: number[];
  total: number;
  detalles: { detalle: string; valores: number[]; total: number }[];
}

export interface Proyeccion {
  semanas: string[];
  cajaInicial: number;
  entradas: FilaConcepto[];
  salidas: FilaConcepto[];
  totalEntradas: number[];
  totalSalidas: number[];
  neto: number[];
  cajaInicioSemana: number[];
  cajaFinal: number[];
}

export function armarProyeccion(lineas: Linea[], semanas: string[], cajaInicial: number): Proyeccion {
  const n = semanas.length;
  const filas = CONCEPTOS.map(({ clave, etiqueta, grupo }) => {
    const ls = lineas.filter((l) => l.concepto === clave);
    const valores = ceros(n);
    for (const l of ls) l.valores.forEach((v, i) => (valores[i] = redondear(valores[i] + v)));
    const detalles = ls
      .map((l) => ({ detalle: l.detalle, valores: l.valores, total: redondear(suma(l.valores)) }))
      .filter((d) => Math.abs(d.total) > 0.005)
      .sort((a, b) => b.total - a.total || a.detalle.localeCompare(b.detalle));
    return { concepto: clave, etiqueta, grupo, valores, total: redondear(suma(valores)), detalles };
  }).filter((f) => f.detalles.length > 0);
  const entradas = filas.filter((f) => f.grupo === "entradas");
  const salidas = filas.filter((f) => f.grupo === "salidas");
  const totalPor = (fs: FilaConcepto[]) => Array.from({ length: n }, (_, i) => redondear(suma(fs.map((f) => f.valores[i]))));
  const totalEntradas = totalPor(entradas);
  const totalSalidas = totalPor(salidas);
  const neto = totalEntradas.map((v, i) => redondear(v - totalSalidas[i]));
  const cajaInicioSemana: number[] = [];
  const cajaFinal: number[] = [];
  let caja = cajaInicial;
  for (let i = 0; i < n; i++) {
    cajaInicioSemana.push(redondear(caja));
    caja = redondear(caja + neto[i]);
    cajaFinal.push(caja);
  }
  return { semanas, cajaInicial: redondear(cajaInicial), entradas, salidas, totalEntradas, totalSalidas, neto, cajaInicioSemana, cajaFinal };
}

export interface Indicadores {
  cajaHoy: number;
  /** Caja final más baja de las 13 semanas y su semana (índice). */
  cajaMinima: number;
  semanaMinima: number;
  /** Primera semana (índice) que termina con caja negativa; null si ninguna. */
  semanaNegativa: number | null;
  /** Semanas que cubre la caja de hoy al ritmo de salida promedio proyectado; null sin salidas. */
  cobertura: number | null;
  /** Semanas que terminan por debajo de la caja mínima configurada. */
  bajoMinimo: number[];
}

export function indicadores(p: Proyeccion, cajaMinimaConfig: number): Indicadores {
  let semanaMinima = 0;
  p.cajaFinal.forEach((v, i) => {
    if (v < p.cajaFinal[semanaMinima]) semanaMinima = i;
  });
  const negativa = p.cajaFinal.findIndex((v) => v < 0);
  const salidaPromedio = suma(p.totalSalidas) / Math.max(p.semanas.length, 1);
  return {
    cajaHoy: p.cajaInicial,
    cajaMinima: p.cajaFinal[semanaMinima] ?? p.cajaInicial,
    semanaMinima,
    semanaNegativa: negativa < 0 ? null : negativa,
    cobertura: salidaPromedio > 0 ? Math.round((p.cajaInicial / salidaPromedio) * 10) / 10 : null,
    bajoMinimo: p.cajaFinal.map((v, i) => (v < cajaMinimaConfig ? i : -1)).filter((i) => i >= 0),
  };
}

/** Las filas para la tabla y el Excel: cada grupo con su total, sus conceptos y, debajo, sus detalles. */
export interface FilaTabla {
  clave: string;
  etiqueta: string;
  tipo: "grupo" | "concepto" | "detalle" | "resultado";
  /** El concepto al que pertenece un detalle (para desplegarlo). */
  padre?: string;
  valores: number[];
  /** null: un saldo (sin total). */
  total: number | null;
}

export function filasTabla(p: Proyeccion): FilaTabla[] {
  const filas: FilaTabla[] = [];
  const grupo = (clave: Grupo, etiqueta: string, conceptos: FilaConcepto[], totales: number[]) => {
    filas.push({ clave, etiqueta, tipo: "grupo", valores: totales, total: redondear(suma(totales)) });
    for (const c of conceptos) {
      const clave = `${c.grupo}-${c.concepto}`;
      filas.push({ clave, etiqueta: c.etiqueta, tipo: "concepto", valores: c.valores, total: c.total });
      for (const d of c.detalles) filas.push({ clave: `${clave}-${d.detalle}`, etiqueta: d.detalle, tipo: "detalle", padre: clave, valores: d.valores, total: d.total });
    }
  };
  filas.push({ clave: "caja-inicial", etiqueta: "Caja al comenzar la semana", tipo: "resultado", valores: p.cajaInicioSemana, total: null });
  grupo("entradas", "Entradas", p.entradas, p.totalEntradas);
  grupo("salidas", "Salidas", p.salidas, p.totalSalidas);
  filas.push({ clave: "neto", etiqueta: "Neto de la semana", tipo: "resultado", valores: p.neto, total: redondear(suma(p.neto)) });
  filas.push({ clave: "caja-final", etiqueta: "Caja final", tipo: "resultado", valores: p.cajaFinal, total: null });
  return filas;
}

// ---------------------------------------------------------------------------------------------
// Precisión: proyecciones guardadas contra lo real
// ---------------------------------------------------------------------------------------------

export type RubroPrecision = "ventas" | "otras_entradas" | "mercancia" | "nomina" | "envio" | "marketing" | "gastos" | "impuestos" | "dividendos";

export const RUBROS_PRECISION: { clave: RubroPrecision; etiqueta: string; grupo: Grupo }[] = [
  { clave: "ventas", etiqueta: "Cobro de ventas", grupo: "entradas" },
  { clave: "otras_entradas", etiqueta: "Otras entradas", grupo: "entradas" },
  { clave: "mercancia", etiqueta: "Mercancía", grupo: "salidas" },
  { clave: "nomina", etiqueta: "Nómina", grupo: "salidas" },
  { clave: "envio", etiqueta: "Envíos y repartidores", grupo: "salidas" },
  { clave: "marketing", etiqueta: "Marketing", grupo: "salidas" },
  { clave: "gastos", etiqueta: "Gastos fijos y otros", grupo: "salidas" },
  { clave: "impuestos", etiqueta: "Impuestos", grupo: "salidas" },
  { clave: "dividendos", etiqueta: "Dividendos", grupo: "salidas" },
];

export const RUBRO_DE_CONCEPTO: Record<Concepto, RubroPrecision> = {
  ventas: "ventas",
  retiros_dropi: "otras_entradas",
  dropi_transito: "otras_entradas",
  otros_ingresos: "otras_entradas",
  cxc: "otras_entradas",
  ajustes_entrada: "otras_entradas",
  cxp: "gastos",
  compras: "mercancia",
  mercancia: "mercancia",
  nomina: "nomina",
  repartidores: "envio",
  marketing: "marketing",
  recurrentes: "gastos",
  otros_gastos: "gastos",
  impuestos: "impuestos",
  dividendos: "dividendos",
  deuda: "gastos",
  ajustes_salida: "gastos",
};

/** El rubro de precisión de un movimiento real del libro (null: no es caja o es un traspaso). */
export function rubroPrecisionLibro(m: Pick<MovimientoLibro, "tipo" | "seccion" | "signo" | "bloque" | "esBienDeUso">): RubroPrecision | null {
  const r = rubroLibro(m);
  switch (r) {
    case "fuera":
      return null;
    case "ingresos":
      return "ventas";
    case "otras_entradas":
      return "otras_entradas";
    case "mercancia":
    case "envio":
    case "nomina":
    case "marketing":
    case "impuestos":
    case "dividendos":
      return r;
    default:
      return "gastos";
  }
}

/** Una foto: lo que la proyección base decía, por semana y rubro (entradas y salidas en positivo). */
export interface FotoProyeccion {
  /** Lunes de la semana en que se tomó. */
  semana: string;
  cajaInicial: number;
  /** semana (lunes) → rubro → monto. */
  valores: Record<string, Partial<Record<RubroPrecision, number>>>;
}

/** La foto de una proyección (base, sin ajustes de escenario). */
export function fotoDe(p: Proyeccion, semana: string): FotoProyeccion {
  const valores: FotoProyeccion["valores"] = {};
  for (const c of [...p.entradas, ...p.salidas]) {
    const rubro = RUBRO_DE_CONCEPTO[c.concepto];
    c.valores.forEach((v, i) => {
      if (!v) return;
      const s = (valores[p.semanas[i]] ??= {});
      s[rubro] = redondear((s[rubro] ?? 0) + v);
    });
  }
  return { semana, cajaInicial: p.cajaInicial, valores };
}

export function validarFoto(v: unknown): FotoProyeccion | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.semana !== "string" || typeof o.cajaInicial !== "number" || !o.valores || typeof o.valores !== "object") return null;
  const valores: FotoProyeccion["valores"] = {};
  for (const [s, rs] of Object.entries(o.valores as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !rs || typeof rs !== "object") continue;
    valores[s] = {};
    for (const [r, m] of Object.entries(rs as Record<string, unknown>)) {
      if (RUBROS_PRECISION.some((x) => x.clave === r) && typeof m === "number" && Number.isFinite(m)) valores[s][r as RubroPrecision] = m;
    }
  }
  return { semana: o.semana, cajaInicial: o.cajaInicial, valores };
}

export interface ComparacionRubro {
  rubro: RubroPrecision | "entradas" | "salidas" | "neto";
  etiqueta: string;
  proyectado: number;
  real: number;
  diferencia: number;
  /** (proyectado − real) ÷ |real|; null si lo real es 0. */
  error: number | null;
  /** Error absoluto medio ponderado: Σ|proyectado − real| ÷ Σ|real| de cada semana comparada. */
  errorAbsoluto: number | null;
}

export interface ResultadoPrecision {
  /** Semanas cerradas comparadas (lunes). */
  semanas: string[];
  /** Pares foto-semana comparados. */
  pares: number;
  rubros: ComparacionRubro[];
  /** Por semana: neto proyectado (promedio de las fotos que la cubrían) y real. */
  porSemana: { semana: string; proyectado: number; real: number; fotos: number }[];
}

/**
 * Compara cada foto con lo real en las semanas que ya terminaron (antes de `hoy`) y que la foto cubría, sin la semana en
 * que se tomó (ya estaba empezada). `real` es semana (lunes) → rubro → monto, de los movimientos del libro.
 */
export function compararFotos(fotos: FotoProyeccion[], real: Record<string, Partial<Record<RubroPrecision, number>>>, hoy: string): ResultadoPrecision {
  const acumulado = new Map<string, { p: number; r: number; abs: number; ref: number }>();
  const porSemana = new Map<string, { p: number; r: number; n: number }>();
  const semanas = new Set<string>();
  let pares = 0;
  const sumar = (clave: string, p: number, r: number) => {
    const a = acumulado.get(clave) ?? { p: 0, r: 0, abs: 0, ref: 0 };
    a.p += p;
    a.r += r;
    a.abs += Math.abs(p - r);
    a.ref += Math.abs(r);
    acumulado.set(clave, a);
  };
  for (const f of fotos) {
    for (const [semana, rubros] of Object.entries(f.valores)) {
      if (semana <= f.semana || sumarDias(semana, 6) >= hoy) continue;
      const r = real[semana] ?? {};
      pares++;
      semanas.add(semana);
      let pe = 0;
      let ps = 0;
      let re = 0;
      let rs = 0;
      for (const { clave, grupo } of RUBROS_PRECISION) {
        const p = rubros[clave] ?? 0;
        const x = r[clave] ?? 0;
        sumar(clave, p, x);
        if (grupo === "entradas") {
          pe += p;
          re += x;
        } else {
          ps += p;
          rs += x;
        }
      }
      sumar("entradas", pe, re);
      sumar("salidas", ps, rs);
      sumar("neto", pe - ps, re - rs);
      const s = porSemana.get(semana) ?? { p: 0, r: re - rs, n: 0 };
      s.p += pe - ps;
      s.n++;
      porSemana.set(semana, s);
    }
  }
  const fila = (rubro: ComparacionRubro["rubro"], etiqueta: string): ComparacionRubro => {
    const a = acumulado.get(rubro) ?? { p: 0, r: 0, abs: 0, ref: 0 };
    return {
      rubro,
      etiqueta,
      proyectado: redondear(a.p),
      real: redondear(a.r),
      diferencia: redondear(a.p - a.r),
      error: Math.abs(a.r) > 0.005 ? Math.round(((a.p - a.r) / Math.abs(a.r)) * 10_000) / 10_000 : null,
      errorAbsoluto: a.ref > 0.005 ? Math.round((a.abs / a.ref) * 10_000) / 10_000 : null,
    };
  };
  return {
    semanas: [...semanas].sort(),
    pares,
    rubros: [
      ...RUBROS_PRECISION.map((r) => fila(r.clave, r.etiqueta)),
      fila("entradas", "Total entradas"),
      fila("salidas", "Total salidas"),
      fila("neto", "Neto"),
    ],
    porSemana: [...porSemana.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([semana, s]) => ({ semana, proyectado: redondear(s.p / s.n), real: redondear(s.r), fotos: s.n })),
  };
}

/**
 * Lo real por semana y rubro a partir de los movimientos del libro (entradas y salidas en positivo). El libro carga las
 * ventas de cada tienda en un solo movimiento al mes: si se pasan `ventas` (lunes → lo entregado esa semana según Ventas
 * por tienda) y `tiendas`, el cobro de ventas sale de ahí y los ingresos del libro de esas tiendas no se cuentan; los de
 * las demás unidades van a «otras entradas».
 */
export function realPorSemana(
  movs: MovimientoLibro[],
  opciones?: { tiendas: Set<string>; ventas: Record<string, number> },
): Record<string, Partial<Record<RubroPrecision, number>>> {
  const salida: Record<string, Partial<Record<RubroPrecision, number>>> = {};
  if (opciones) for (const [semana, v] of Object.entries(opciones.ventas)) (salida[semana] ??= {}).ventas = redondear(v);
  for (const m of movs) {
    let rubro = rubroPrecisionLibro(m);
    if (!rubro) continue;
    if (opciones && rubro === "ventas") {
      if (m.unidad_id && opciones.tiendas.has(m.unidad_id)) continue;
      rubro = "otras_entradas";
    }
    const grupo = RUBROS_PRECISION.find((r) => r.clave === rubro)!.grupo;
    const s = (salida[lunesDe(m.fecha)] ??= {});
    // Una entrada suma a su rubro de entrada; un reverso (o una salida en un rubro de entrada) resta.
    const v = grupo === "entradas" ? (m.signo === 1 ? m.monto : -m.monto) : m.signo === 1 ? -m.monto : m.monto;
    s[rubro] = redondear((s[rubro] ?? 0) + v);
  }
  return salida;
}
