// Emparejamiento de la conciliación bancaria. Lógica pura (sin Supabase): recibe las líneas del banco que faltan
// conciliar y lo que hay para cubrirlas, y devuelve propuestas con puntaje. Prueba en `emparejar.test.ts`.
//
// Contra qué se busca cada línea:
//   1. Corte de Yappy: el «DEPOSITO YAPPY (N TRANSACCIONES)» de un día es la suma de los cobros de Yappy del día
//      anterior (o de los anteriores acumulados, hasta 3). Si calzan la suma y el número de cobros, es prueba: se
//      concilia solo.
//   2. Consignación de Servientrega: la suma de las guías de una consignación. Si además la referencia del banco
//      termina en la que trae el código («BAC6458…» ↔ 418006458), es prueba: se concilia sola.
//   3. MiPOS: lo cobrado con tarjeta en un día, que llega neto de la comisión (hasta `comisionMax`).
//   4. Órdenes entregadas (`conc_ordenes_fuente`: las reales de `ven_ordenes` y, si no están ahí, las que se cruzaron a
//      mano en el Excel) pagadas por transferencia o en efectivo: una orden del mismo monto, el cierre del día de un
//      repartidor (lo que cobró en efectivo en una tienda ese día, `indexarOrdenes`) o, acotado, una parte de lo suyo.
//      Las órdenes reales pesan más que las del Excel.
//   5. Deliverys: lo que se le paga a un repartidor por una semana (por tienda o el neto) o lo que él rinde, si la
//      descripción lo nombra (`nombres.ts`).
//   6. Movimientos del libro de la misma cuenta: mismo monto con su signo y fecha de pago ± `diasLibro` días, uno o la
//      suma de varios (un pago a un repartidor que el libro reparte entre dos tiendas).
// Solo 1 y 2 se confirman sin una persona; todo lo demás queda como sugerencia. Cada parte se usa una sola vez: si dos
// líneas quieren el mismo movimiento, gana la de mayor puntaje.

import { normal } from "./leer-excel";
import { nombreEnDescripcion, palabrasEnComun, tiendaEnDescripcion } from "./nombres";

export type ClaseLinea =
  | "yappy"
  | "comision_yappy"
  | "servientrega"
  | "deposito_efectivo"
  | "transferencia_recibida"
  | "mipos"
  | "comision_bancaria"
  | "pago"
  | "otro";

export const ETIQUETA_CLASE: Record<ClaseLinea, string> = {
  yappy: "Depósito Yappy",
  comision_yappy: "Comisión Yappy",
  servientrega: "Servientrega",
  deposito_efectivo: "Depósito en efectivo",
  transferencia_recibida: "Transferencia recibida",
  mipos: "MiPOS",
  comision_bancaria: "Comisión bancaria",
  pago: "Pago",
  otro: "Otro",
};

/** Qué es una línea del banco, por su descripción y su signo. */
export function clasificarLinea(descripcion: string, monto: number): ClaseLinea {
  const d = normal(descripcion);
  if (/DEPOSITO YAPPY/.test(d)) return "yappy";
  if (/COMISION (DE )?TRANSACCIONES YAPPY/.test(d)) return "comision_yappy";
  if (monto > 0 && /RED VERDE|SERVIENTREGA/.test(d)) return "servientrega";
  if (monto > 0 && /\bMI ?POS\b|CREDOMATIC|MULTICREDIT|PROCESADORA DE TARJETAS/.test(d)) return "mipos";
  if (monto < 0 && /^(COM |COMISION|IVA POR COM|CARGO (POR |SERVICIO)|ITBMS)/.test(d)) return "comision_bancaria";
  if (monto > 0 && /(DEPOSITO|^DEP[._ ]|\bATM\b)/.test(d)) return "deposito_efectivo";
  if (monto > 0 && /(TEF DE|^ACH|TRANSFERENCIA DE)/.test(d)) return "transferencia_recibida";
  if (monto < 0) return "pago";
  return "otro";
}

/** «DEPOSITO YAPPY - … (44 TRANSACCIONES)» → 44. */
export function transaccionesDe(descripcion: string): number | null {
  const m = normal(descripcion).match(/\((\d+) TRANSACCION(ES)?\)/);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------------------------
// Entradas y salidas
// ---------------------------------------------------------------------------------------------

export interface LineaEmp {
  id: string;
  fecha: string;
  /** Con signo: crédito positivo, débito negativo. */
  monto: number;
  descripcion: string;
  referencia: string | null;
  referenciaExtra?: string | null;
  clase: ClaseLinea;
}

export interface MovEmp {
  id: string;
  /** Fecha de pago (o de registro si no tiene). */
  fecha: string | null;
  /** Efecto en la cuenta: positivo si entra (tipo con signo +), negativo si sale. */
  efecto: number;
  descripcion: string;
}

export interface CobroEmp {
  id: string;
  fuente: "yappy" | "mipos" | "servientrega";
  fecha: string;
  fechaDeposito: string | null;
  lote: string | null;
  referenciaBanco: string | null;
  bruto: number;
  anulada: boolean;
}

export interface OrdenEmp {
  id: string;
  /** `ven_ordenes` (las órdenes de las tiendas) o `libro_conciliacion` (lo cruzado a mano en el Excel). */
  fuente: string;
  numero: string;
  /** El día que se cobró (el de envío). */
  fecha: string | null;
  monto: number;
  metodo: string;
  /** El repartidor o transportista que la llevó. */
  repartidor: string | null;
  tienda?: string | null;
  /** Nombre de quien compró: solo para compararlo con la descripción del banco; nunca se muestra ni se guarda aquí. */
  cliente?: string | null;
}

/** Lo de un repartidor en una semana (jueves a miércoles): la semana completa (`unidadId` null) o una tienda. */
export interface SemanaDel {
  repartidorId: string;
  /** Para mostrar. */
  nombre: string;
  /** Su nombre y sus alias: con ellos se lo reconoce en la descripción del banco. */
  nombres: string[];
  /** Jueves de la semana. */
  semana: string;
  unidadId: string | null;
  tienda: string | null;
  /** Lo que la empresa le paga (0 si no se le paga nada). */
  pagar: number;
  /** Lo que él debe rendir del efectivo cobrado (0 si nada). */
  rendir: number;
  /** El pago registrado en Deliverys (cierre pagado), si lo hay. */
  pago?: { fecha: string; monto: number } | null;
}

export type ClaseParte = "movimiento" | "cobro" | "orden" | "delivery";
export type Metodo = "exacto" | "suma" | "corte" | "referencia" | "comision";

export interface Parte {
  clase: ClaseParte;
  id: string;
  /** Lo que cubre de la línea, con el signo de la línea. */
  monto: number;
  /** Solo órdenes: de qué tabla viene. */
  fuente?: string;
  /** Comisión que se descontó de esta parte (MiPOS): `monto` ya es neto de ella. */
  comision?: number;
  /** Solo deliverys: de quién, qué semana y qué tienda (null = la semana completa). */
  delivery?: { repartidorId: string; semana: string; unidadId: string | null };
}

export interface Propuesta {
  lineaId: string;
  grupo: string;
  metodo: Metodo;
  puntaje: number;
  /** Con prueba (corte de Yappy, referencia de Servientrega): se confirma sin una persona. */
  auto: boolean;
  partes: Parte[];
  /** Para mostrarla: «Yappy del 02/09 (31 cobros)», «Libro · 2 movimientos». */
  detalle: string;
}

export interface Opciones {
  /** Días de diferencia aceptados entre la línea y la fecha de pago del libro. */
  diasLibro: number;
  /** Días entre el cobro de MiPOS y su depósito. */
  diasCobro: number;
  /** Días entre la fecha del código de consignación de Servientrega y el depósito (lo cobrado con tarjeta tarda ~6). */
  diasServientrega: number;
  /** Días entre una orden y su depósito. */
  diasOrden: number;
  /** Días después del miércoles que cierra la semana en que se acepta el pago a un repartidor. */
  diasDelivery: number;
  /** Comisión máxima que se acepta en lo que llega neto (MiPOS), como fracción. */
  comisionMax: number;
  /** Cuántas partes como máximo en una suma. */
  maxSuma: number;
  /** Cuántos candidatos se prueban para una suma (los más cercanos en fecha). */
  maxCandidatos: number;
  /** Cuántas propuestas alternativas se guardan por línea, además de la elegida. */
  alternativas: number;
}

export const OPCIONES: Opciones = {
  diasLibro: 3,
  diasCobro: 4,
  diasServientrega: 8,
  diasOrden: 3,
  diasDelivery: 14,
  comisionMax: 0.04,
  maxSuma: 5,
  maxCandidatos: 18,
  alternativas: 2,
};

// ---------------------------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------------------------

const cent = (v: number) => Math.round(v * 100);

export function diasEntre(a: string, b: string): number {
  const d = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((d(b) - d(a)) / 86_400_000);
}

export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(Date.UTC(Number(fecha.slice(0, 4)), Number(fecha.slice(5, 7)) - 1, Number(fecha.slice(8, 10)) + dias));
  return d.toISOString().slice(0, 10);
}

const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/** Palabras que están en cualquier línea de banco y no distinguen nada. */
const COMUNES = new Set([
  "BANCA", "LINEA", "MOVIL", "TRANSFERENCIA", "TRANSFERENCIAS", "PAGO", "PAGOS", "DEPOSITO", "XPRESS", "BANCO", "GENERAL",
  "PANAMA", "CUENTA", "AHORROS", "LIBRETA", "SIN", "CRE", "XPR", "TEF", "INTERNACIONAL", "BANK", "S A", "COMERCIAL",
]);

/** Las palabras que identifican una descripción: nombres, comercios y números largos (cuentas, facturas). */
export function palabrasClave(descripcion: string): Set<string> {
  const p = normal(descripcion)
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((x) => (/^\d+$/.test(x) ? x.length >= 5 : x.length >= 4) && !COMUNES.has(x));
  return new Set(p);
}

/** Qué tanto se parecen dos descripciones (0 a 1): palabras clave en común; un número largo calza por su comienzo. */
export function parecido(a: string, b: string): number {
  const pa = palabrasClave(a);
  const pb = palabrasClave(b);
  if (!pa.size || !pb.size) return 0;
  let comunes = 0;
  for (const x of pa) {
    for (const y of pb) {
      const numeros = /^\d+$/.test(x) && /^\d+$/.test(y);
      if (x === y || (numeros && Math.min(x.length, y.length) >= 5 && (x.startsWith(y) || y.startsWith(x)))) {
        comunes++;
        break;
      }
    }
  }
  return Math.min(1, comunes / Math.min(pa.size, pb.size, 3));
}

/**
 * Suma acotada: los ids de entre 2 y `maxItems` elementos cuya suma es `objetivo` (± `tolerancia`), los menos posibles.
 * Busca en profundidad con poda (de mayor a menor, cortando cuando lo que falta no alcanza). Corta a los `maxNodos`
 * pasos: con muchos candidatos no se cuelga, solo deja de buscar.
 */
export function buscarSuma(
  objetivo: number,
  items: { id: string; valor: number }[],
  { maxItems = 5, tolerancia = 0.005, maxNodos = 60_000 }: { maxItems?: number; tolerancia?: number; maxNodos?: number } = {},
): string[] | null {
  const meta = cent(Math.abs(objetivo));
  const tol = Math.round(tolerancia * 100);
  const lista = items
    .map((x) => ({ id: x.id, v: cent(Math.abs(x.valor)) }))
    .filter((x) => x.v > 0 && x.v <= meta + tol)
    .sort((a, b) => b.v - a.v);
  const restos: number[] = new Array(lista.length + 1).fill(0);
  for (let i = lista.length - 1; i >= 0; i--) restos[i] = restos[i + 1] + lista[i].v;
  let nodos = 0;
  for (let k = 2; k <= Math.min(maxItems, lista.length); k++) {
    const elegidos: number[] = [];
    const dfs = (desde: number, suma: number): boolean => {
      if (++nodos > maxNodos) return false;
      if (elegidos.length === k) return Math.abs(suma - meta) <= tol;
      const faltan = k - elegidos.length;
      for (let i = desde; i <= lista.length - faltan; i++) {
        const s = suma + lista[i].v;
        if (s > meta + tol) continue;
        // Ni sumando todos los que quedan se llega.
        if (suma + restos[i] < meta - tol) return false;
        elegidos.push(i);
        if (dfs(i + 1, s)) return true;
        elegidos.pop();
      }
      return false;
    };
    if (dfs(0, 0)) return elegidos.map((i) => lista[i].id);
    if (nodos > maxNodos) break;
  }
  return null;
}

const iguales = (a: number, b: number) => Math.abs(cent(a) - cent(b)) <= 1;

// ---------------------------------------------------------------------------------------------
// Propuestas por fuente
// ---------------------------------------------------------------------------------------------

interface Dia {
  fecha: string;
  ids: string[];
  total: number;
}

/** Los cobros de Yappy (sin anular) agrupados por día. */
function diasYappy(cobros: CobroEmp[]): Map<string, Dia> {
  const dias = new Map<string, Dia>();
  for (const c of cobros) {
    if (c.fuente !== "yappy" || c.anulada) continue;
    const d = dias.get(c.fecha) ?? { fecha: c.fecha, ids: [], total: 0 };
    d.ids.push(c.id);
    d.total += c.bruto;
    dias.set(c.fecha, d);
  }
  return dias;
}

function propuestasYappy(l: LineaEmp, dias: Map<string, Dia>, montoDe: Map<string, number>): Propuesta[] {
  if (l.clase !== "yappy" || l.monto <= 0) return [];
  const n = transaccionesDe(l.descripcion);
  const salida: Propuesta[] = [];
  // El día anterior, o los anteriores acumulados (fin de semana, feriado), hasta 3; con menos puntaje, un solo día más atrás.
  const ventanas: { desde: number; hasta: number; base: number }[] = [
    { desde: 1, hasta: 1, base: 92 },
    { desde: 2, hasta: 1, base: 88 },
    { desde: 3, hasta: 1, base: 85 },
    { desde: 0, hasta: 0, base: 75 },
    { desde: 2, hasta: 2, base: 75 },
    { desde: 3, hasta: 3, base: 70 },
  ];
  for (const v of ventanas) {
    const fechas: string[] = [];
    for (let k = v.desde; k >= v.hasta; k--) fechas.push(sumarDias(l.fecha, -k));
    const grupo = fechas.map((f) => dias.get(f)).filter((d): d is Dia => !!d);
    if (grupo.length !== fechas.length) continue;
    const ids = grupo.flatMap((d) => d.ids);
    const total = grupo.reduce((a, d) => a + d.total, 0);
    if (!iguales(total, l.monto)) continue;
    const cuentaCalza = n !== null && n === ids.length;
    salida.push({
      lineaId: l.id,
      grupo: "",
      metodo: "corte",
      puntaje: Math.min(100, v.base + (cuentaCalza ? 8 : 0)),
      // Prueba: el día anterior (o acumulados) suma exacto y el número de cobros coincide con el que dice el banco.
      auto: cuentaCalza && v.hasta === 1,
      partes: ids.map((id) => ({ clase: "cobro" as const, id, monto: montoDe.get(id) ?? 0 })),
      detalle: `Yappy ${fechas.length === 1 ? `del ${fechaCorta(fechas[0])}` : `del ${fechaCorta(fechas[0])} al ${fechaCorta(fechas[fechas.length - 1])}`} (${ids.length} cobros)`,
    });
  }
  return salida;
}

interface Consignacion {
  lote: string;
  ids: string[];
  total: number;
  referencia: string | null;
  fecha: string;
}

function consignaciones(cobros: CobroEmp[]): Consignacion[] {
  const mapa = new Map<string, Consignacion>();
  for (const c of cobros) {
    if (c.fuente !== "servientrega" || c.anulada) continue;
    const lote = c.lote ?? `guia:${c.id}`;
    const x = mapa.get(lote) ?? { lote, ids: [], total: 0, referencia: c.referenciaBanco, fecha: c.fechaDeposito ?? c.fecha };
    x.ids.push(c.id);
    x.total += c.bruto;
    if (!c.fechaDeposito && c.fecha > x.fecha) x.fecha = c.fecha;
    mapa.set(lote, x);
  }
  return [...mapa.values()];
}

function propuestasServientrega(l: LineaEmp, grupos: Consignacion[], d: number, montoDe: Map<string, number>): Propuesta[] {
  if (l.monto <= 0 || l.clase === "yappy") return [];
  const refs = [l.referencia, ...(l.referenciaExtra ?? "").split(" · ")].filter((x): x is string => !!x).map((x) => x.replace(/\D/g, ""));
  const salida: Propuesta[] = [];
  for (const g of grupos) {
    if (!iguales(g.total, l.monto)) continue;
    const dias = diasEntre(g.fecha, l.fecha);
    const conReferencia = !!g.referencia && refs.some((r) => r.length >= g.referencia!.length && r.endsWith(g.referencia!));
    if (!conReferencia && (dias < -1 || dias > d)) continue;
    if (conReferencia && Math.abs(dias) > d + 3) continue;
    salida.push({
      lineaId: l.id,
      grupo: "",
      metodo: conReferencia ? "referencia" : "exacto",
      puntaje: conReferencia ? 100 : l.clase === "servientrega" ? 80 : 70,
      auto: conReferencia,
      partes: g.ids.map((id) => ({ clase: "cobro" as const, id, monto: montoDe.get(id) ?? 0 })),
      detalle: `Servientrega ${g.lote} (${g.ids.length} ${g.ids.length === 1 ? "guía" : "guías"})`,
    });
  }
  return salida;
}

function propuestasMipos(l: LineaEmp, cobros: CobroEmp[], o: Opciones, montoDe: Map<string, number>): Propuesta[] {
  // Solo lo que dice ser de la procesadora: una transferencia de una persona por el mismo monto no es una liquidación.
  if (l.monto <= 0 || !["mipos", "otro"].includes(l.clase)) return [];
  const porDia = new Map<string, Dia>();
  for (const c of cobros) {
    if (c.fuente !== "mipos" || c.anulada) continue;
    const dias = diasEntre(c.fecha, l.fecha);
    if (dias < 0 || dias > o.diasCobro) continue;
    const x = porDia.get(c.fecha) ?? { fecha: c.fecha, ids: [], total: 0 };
    x.ids.push(c.id);
    x.total += c.bruto;
    porDia.set(c.fecha, x);
  }
  const salida: Propuesta[] = [];
  for (const dia of porDia.values()) {
    const comision = Math.round((dia.total - l.monto) * 100) / 100;
    if (comision < -0.005 || comision > dia.total * o.comisionMax + 0.005) continue;
    salida.push({
      lineaId: l.id,
      grupo: "",
      metodo: comision > 0.005 ? "comision" : "exacto",
      puntaje: (l.clase === "mipos" ? 75 : 55) - Math.round((10 * comision) / Math.max(dia.total * o.comisionMax, 0.01)),
      auto: false,
      partes: repartirComision(dia.ids.map((id) => ({ id, bruto: montoDe.get(id) ?? 0 })), comision),
      detalle: `MiPOS del ${fechaCorta(dia.fecha)} (${dia.ids.length} cobros${comision > 0.005 ? `, comisión ${comision.toFixed(2)}` : ""})`,
    });
  }
  return salida;
}

/** Reparte la comisión entre los cobros en proporción a su monto (el último se lleva el redondeo): la suma de los netos es lo depositado. */
export function repartirComision(cobros: { id: string; bruto: number }[], comision: number): Parte[] {
  const total = cobros.reduce((a, c) => a + c.bruto, 0);
  let resto = cent(comision);
  return cobros.map((c, i) => {
    const parte = i === cobros.length - 1 ? resto : Math.round((cent(comision) * cent(c.bruto)) / Math.max(cent(total), 1));
    resto -= parte;
    return { clase: "cobro" as const, id: c.id, monto: (cent(c.bruto) - parte) / 100, comision: parte / 100 };
  });
}

const tiendaCorta = (t: string | null | undefined) => (t ?? "").replace(/ PAN$/, "");

const ORDENES_AL_BANCO = new Set(["efectivo", "transferencia", "cierre"]);
const CLASES_ORDEN = new Set<ClaseLinea>(["deposito_efectivo", "transferencia_recibida", "otro"]);

interface GrupoDia {
  fecha: string;
  repartidor: string;
  tienda: string | null;
  ordenes: OrdenEmp[];
  total: number;
}

/** Las órdenes que pueden llegar al banco, por fecha, y lo cobrado en efectivo por cada repartidor en cada día y tienda. */
export interface IndiceOrdenes {
  porFecha: Map<string, OrdenEmp[]>;
  /** fecha|repartidor → lo cobrado en efectivo en cada tienda (solo órdenes de las tiendas, no las marcadas en el Excel). */
  grupos: Map<string, GrupoDia[]>;
  /** fecha|repartidor → lo mismo, todas las tiendas juntas. */
  gruposDia: Map<string, GrupoDia>;
  repartidores: string[];
  /** Las tiendas (OFERFY, KENKU…), para reconocerlas en la descripción. */
  tiendas: string[];
}

export function indexarOrdenes(ordenes: OrdenEmp[]): IndiceOrdenes {
  const porFecha = new Map<string, OrdenEmp[]>();
  const porTienda = new Map<string, GrupoDia>();
  const gruposDia = new Map<string, GrupoDia>();
  const repartidores = new Set<string>();
  const sumar = (mapa: Map<string, GrupoDia>, clave: string, x: OrdenEmp, tienda: string | null) => {
    const g = mapa.get(clave) ?? { fecha: x.fecha!, repartidor: x.repartidor!, tienda, ordenes: [], total: 0 };
    g.ordenes.push(x);
    g.total += x.monto;
    mapa.set(clave, g);
  };
  for (const x of ordenes) {
    if (!x.fecha || !ORDENES_AL_BANCO.has(x.metodo) || x.monto <= 0) continue;
    const lista = porFecha.get(x.fecha) ?? [];
    lista.push(x);
    porFecha.set(x.fecha, lista);
    if (x.metodo === "efectivo" && x.repartidor && x.fuente === FUENTE_VENTAS) {
      repartidores.add(x.repartidor);
      sumar(porTienda, `${x.fecha}|${x.repartidor}|${x.tienda ?? ""}`, x, x.tienda ?? null);
      sumar(gruposDia, `${x.fecha}|${x.repartidor}`, x, null);
    }
  }
  const grupos = new Map<string, GrupoDia[]>();
  for (const g of porTienda.values()) {
    const k = `${g.fecha}|${g.repartidor}`;
    grupos.set(k, [...(grupos.get(k) ?? []), g]);
  }
  return { porFecha, grupos, gruposDia, repartidores: [...repartidores], tiendas: [...new Set([...porTienda.values()].map((g) => tiendaCorta(g.tienda)).filter(Boolean))] };
}

/** De dónde viene una orden: las órdenes reales de las tiendas o lo que se cruzó a mano en el Excel de conciliación. */
export const FUENTE_VENTAS = "ven_ordenes";
export const FUENTE_EXCEL = "libro_conciliacion";

function propuestasOrdenes(l: LineaEmp, idx: IndiceOrdenes, o: Opciones): Propuesta[] {
  if (l.monto <= 0 || !CLASES_ORDEN.has(l.clase)) return [];
  // Los repartidores que nombra la descripción (pocos: se prueban todos).
  const nombrados = new Set(idx.repartidores.filter((r) => nombreEnDescripcion(r, l.descripcion)));
  const nombraA = (r: string | null) => !!r && (nombrados.has(r) || nombreEnDescripcion(r, l.descripcion));
  const tiendaDicha = tiendaEnDescripcion(l.descripcion, idx.tiendas);
  const salida: Propuesta[] = [];

  // 1. Una orden con el mismo monto (una transferencia de quien compró, o de un repartidor por una orden).
  // Quien paga por transferencia a veces paga antes del envío: para esas, la ventana va también hacia adelante.
  const iguales_: { x: OrdenEmp; d: number }[] = [];
  for (let d = -o.diasOrden; d <= o.diasOrden; d++) {
    for (const x of idx.porFecha.get(sumarDias(l.fecha, -d)) ?? []) {
      if ((d >= 0 || x.metodo === "transferencia") && iguales(x.monto, l.monto)) iguales_.push({ x, d: Math.abs(d) });
    }
  }
  // Varias del mismo monto en la ventana: ninguna es segura.
  const ambiguedad = Math.min(12, 4 * Math.max(0, iguales_.length - 1));
  for (const { x, d } of iguales_) {
    const deCliente = !!x.cliente && palabrasEnComun(x.cliente, l.descripcion) >= 2;
    salida.push({
      lineaId: l.id,
      grupo: "",
      metodo: "exacto",
      puntaje: Math.max(
        40,
        Math.min(95, 60 + (d === 0 ? 10 : d === 1 ? 7 : 3) + (nombraA(x.repartidor) ? 15 : 0) + (deCliente ? 20 : 0) + (x.fuente === FUENTE_VENTAS ? 5 : -5) - ambiguedad),
      ),
      auto: false,
      partes: [{ clase: "orden", id: x.id, monto: l.monto, fuente: x.fuente }],
      detalle: [`Orden ${x.numero}`, tiendaCorta(x.tienda) || null, x.repartidor].filter(Boolean).join(" · "),
    });
  }

  // 2. El cierre del día de un repartidor: lo cobrado en efectivo en una tienda (o en todas) ese día.
  const deGrupo = (g: GrupoDia, d: number, base: number) => {
    const n = g.ordenes.length;
    salida.push({
      lineaId: l.id,
      grupo: "",
      metodo: n === 1 ? "exacto" : "corte",
      puntaje: base - 2 * d + (tiendaDicha && tiendaCorta(g.tienda) === tiendaDicha ? 3 : 0),
      auto: false,
      partes: g.ordenes.map((x) => ({ clase: "orden" as const, id: x.id, monto: x.monto, fuente: x.fuente })),
      detalle: `Cierre del ${fechaCorta(g.fecha)}${g.tienda ? ` · ${tiendaCorta(g.tienda)}` : ""} · ${n} ${n === 1 ? "orden" : "órdenes"} de ${g.repartidor}`,
    });
  };
  for (let d = 0; d <= o.diasOrden; d++) {
    const fecha = sumarDias(l.fecha, -d);
    const candidatos = nombrados.size ? [...nombrados] : l.clase === "deposito_efectivo" ? idx.repartidores : [];
    for (const r of candidatos) {
      const base = nombrados.size ? 90 : 64;
      const tiendas = idx.grupos.get(`${fecha}|${r}`) ?? [];
      for (const g of tiendas) if (g.ordenes.length > 1 && iguales(g.total, l.monto)) deGrupo(g, d, base);
      // Todas las tiendas del día juntas (si no es lo mismo que una sola tienda).
      const dia = idx.gruposDia.get(`${fecha}|${r}`);
      if (dia && tiendas.length > 1 && iguales(dia.total, l.monto)) deGrupo(dia, d, base - 4);
    }
  }

  // 3. Si nada de lo anterior es seguro: una parte de lo que cobró el repartidor nombrado (búsqueda acotada).
  if (!salida.some((p) => p.puntaje >= 80)) {
    const porRepartidor = new Map<string, { x: OrdenEmp; d: number }[]>();
    for (let d = 0; d <= o.diasOrden; d++) {
      for (const x of idx.porFecha.get(sumarDias(l.fecha, -d)) ?? []) {
        if (x.monto < l.monto && nombraA(x.repartidor)) porRepartidor.set(x.repartidor!, [...(porRepartidor.get(x.repartidor!) ?? []), { x, d }]);
      }
    }
    for (const [repartidor, lista] of porRepartidor) {
      // Primero las del día más cercano y de la tienda que dice la descripción.
      const orden = lista
        .sort((a, b) => a.d - b.d || Number(tiendaCorta(b.x.tienda) === tiendaDicha) - Number(tiendaCorta(a.x.tienda) === tiendaDicha))
        .slice(0, o.maxCandidatos)
        .map((y) => y.x);
      const ids = buscarSuma(
        l.monto,
        orden.map((x) => ({ id: x.id, valor: x.monto })),
        { maxItems: o.maxSuma },
      );
      if (!ids) continue;
      const porId = new Map(orden.map((x) => [x.id, x]));
      salida.push({
        lineaId: l.id,
        grupo: "",
        metodo: "suma",
        // Por debajo de un cierre o una orden exacta con el nombre del repartidor (≥ 80).
        puntaje: 75,
        auto: false,
        partes: ids.map((id) => ({ clase: "orden" as const, id, monto: porId.get(id)!.monto, fuente: porId.get(id)!.fuente })),
        detalle: `${ids.length} órdenes de ${repartidor}`,
      });
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------------------------
// Deliverys: lo que se le paga a un repartidor (o lo que él rinde) según su liquidación semanal
// ---------------------------------------------------------------------------------------------

export const claveDelivery = (repartidorId: string, semana: string, unidadId: string | null) => `${repartidorId}|${semana}|${unidadId ?? ""}`;

function propuestasDelivery(l: LineaEmp, semanas: SemanaDel[], o: Opciones): Propuesta[] {
  if (!semanas.length || !["pago", "deposito_efectivo", "transferencia_recibida", "otro"].includes(l.clase)) return [];
  const nombrado = new Map<string, boolean>();
  const lo = (s: SemanaDel) => {
    if (!nombrado.has(s.repartidorId)) nombrado.set(s.repartidorId, s.nombres.some((n) => nombreEnDescripcion(n, l.descripcion)));
    return nombrado.get(s.repartidorId)!;
  };
  const sale = l.monto < 0;
  const salida: Propuesta[] = [];
  // Por repartidor y semana: la semana completa y cada tienda.
  const porSemana = new Map<string, SemanaDel[]>();
  for (const s of semanas) {
    // Se paga después del miércoles que cierra la semana; un depósito para rendir puede llegar durante la semana.
    const d = diasEntre(sumarDias(s.semana, 6), l.fecha);
    if (d < (sale ? -1 : -6) || d > o.diasDelivery || !lo(s)) continue;
    porSemana.set(`${s.repartidorId}|${s.semana}`, [...(porSemana.get(`${s.repartidorId}|${s.semana}`) ?? []), s]);
  }
  const parte = (s: SemanaDel, valor: number): Parte => ({
    clase: "delivery",
    id: claveDelivery(s.repartidorId, s.semana, s.unidadId),
    monto: sale ? -valor : valor,
    delivery: { repartidorId: s.repartidorId, semana: s.semana, unidadId: s.unidadId },
  });
  const textoSemana = (s: SemanaDel) => `semana del ${fechaCorta(s.semana)}`;
  for (const lista of porSemana.values()) {
    const s0 = lista[0];
    const d = diasEntre(sumarDias(s0.semana, 6), l.fecha);
    const tarde = d > 7 ? 4 : 0;
    for (const s of lista) {
      const valor = sale ? s.pagar : s.rendir;
      if (valor <= 0 || !iguales(valor, Math.abs(l.monto))) continue;
      // El pago que se registró en Deliverys (cierre pagado) con ese monto y esa fecha lo confirma más.
      const registrado = sale && !!s.pago && iguales(s.pago.monto, valor) && Math.abs(diasEntre(s.pago.fecha, l.fecha)) <= 3;
      salida.push({
        lineaId: l.id,
        grupo: "",
        metodo: "exacto",
        puntaje: 84 + (registrado ? 8 : 0) - tarde + (s.unidadId ? 0 : 1),
        auto: false,
        partes: [parte(s, valor)],
        detalle: `Deliverys · ${s.nombre} · ${textoSemana(s)} · ${s.tienda ? tiendaCorta(s.tienda) : sale ? "toda la semana" : "a rendir"}`,
      });
    }
    // Un pago que junta varias tiendas de la misma semana.
    if (sale && !salida.some((p) => p.partes.some((x) => x.delivery?.repartidorId === s0.repartidorId && x.delivery.semana === s0.semana))) {
      const tiendas = lista.filter((s) => s.unidadId && s.pagar > 0);
      const ids = buscarSuma(
        -l.monto,
        tiendas.map((s) => ({ id: claveDelivery(s.repartidorId, s.semana, s.unidadId), valor: s.pagar })),
        { maxItems: Math.min(o.maxSuma, 6) },
      );
      if (ids) {
        const elegidas = tiendas.filter((s) => ids.includes(claveDelivery(s.repartidorId, s.semana, s.unidadId)));
        salida.push({
          lineaId: l.id,
          grupo: "",
          metodo: "suma",
          puntaje: 78 - tarde,
          auto: false,
          partes: elegidas.map((s) => parte(s, s.pagar)),
          detalle: `Deliverys · ${s0.nombre} · ${textoSemana(s0)} · ${elegidas.map((s) => tiendaCorta(s.tienda)).join(" + ")}`,
        });
      }
    }
  }
  return salida;
}

function propuestasLibro(l: LineaEmp, movs: MovEmp[], o: Opciones): Propuesta[] {
  const mismoSigno = movs.filter((m) => m.fecha && Math.sign(m.efecto) === Math.sign(l.monto) && Math.abs(diasEntre(m.fecha, l.fecha)) <= o.diasLibro);
  const bonoFecha = (m: MovEmp) => [20, 15, 10, 5][Math.abs(diasEntre(m.fecha!, l.fecha))] ?? 0;
  const salida: Propuesta[] = [];
  for (const m of mismoSigno) {
    if (!iguales(m.efecto, l.monto)) continue;
    salida.push({
      lineaId: l.id,
      grupo: "",
      metodo: "exacto",
      puntaje: Math.min(100, 60 + bonoFecha(m) + Math.round(20 * parecido(l.descripcion, m.descripcion))),
      auto: false,
      partes: [{ clase: "movimiento", id: m.id, monto: m.efecto }],
      detalle: "Libro · 1 movimiento",
    });
  }
  if (!salida.length) {
    const candidatos = mismoSigno
      .filter((m) => Math.abs(m.efecto) < Math.abs(l.monto))
      .map((m) => ({ m, orden: Math.abs(diasEntre(m.fecha!, l.fecha)) * 2 - parecido(l.descripcion, m.descripcion) * 3 }))
      .sort((a, b) => a.orden - b.orden)
      .slice(0, o.maxCandidatos)
      .map((x) => x.m);
    const ids = buscarSuma(
      l.monto,
      candidatos.map((m) => ({ id: m.id, valor: m.efecto })),
      { maxItems: o.maxSuma },
    );
    if (ids) {
      const porId = new Map(candidatos.map((m) => [m.id, m]));
      const elegidos = ids.map((id) => porId.get(id)!);
      const fecha = elegidos.reduce((a, m) => a + bonoFecha(m), 0) / elegidos.length;
      const sim = elegidos.reduce((a, m) => a + parecido(l.descripcion, m.descripcion), 0) / elegidos.length;
      salida.push({
        lineaId: l.id,
        grupo: "",
        metodo: "suma",
        puntaje: Math.round(45 + fecha * 0.75 + 20 * sim),
        auto: false,
        partes: elegidos.map((m) => ({ clase: "movimiento" as const, id: m.id, monto: m.efecto })),
        detalle: `Libro · ${elegidos.length} movimientos`,
      });
    }
  }
  return salida;
}

// ---------------------------------------------------------------------------------------------
// Todo junto
// ---------------------------------------------------------------------------------------------

export interface Resultado {
  /** La propuesta elegida de cada línea (la de mayor puntaje cuyas partes nadie más tomó). */
  elegidas: Propuesta[];
  /** Por línea: otras propuestas posibles, para mostrar (sus partes pueden estar tomadas por otra línea). */
  alternativas: Map<string, Propuesta[]>;
}

const claveParte = (p: Parte) => `${p.clase}:${p.fuente ?? ""}:${p.id}`;

/**
 * Qué marca una parte al elegirse y con qué choca. Lo de un repartidor en una semana se puede conciliar por tiendas o
 * completo, no de las dos formas: la semana completa choca con cualquiera de sus tiendas y al revés.
 */
function marcasDe(p: Parte): { ocupa: string[]; choca: string[] } {
  if (p.clase !== "delivery" || !p.delivery) return { ocupa: [claveParte(p)], choca: [claveParte(p)] };
  const semana = `${p.delivery.repartidorId}|${p.delivery.semana}`;
  if (!p.delivery.unidadId) return { ocupa: [`dsem:${semana}`], choca: [`dsem:${semana}`, `dtie:${semana}`] };
  return { ocupa: [claveParte(p), `dtie:${semana}`], choca: [claveParte(p), `dsem:${semana}`] };
}

/**
 * Propone qué cubre cada línea. `movimientos`, `cobros` y `ordenes` deben traer solo lo que todavía no está conciliado.
 * El grupo de cada propuesta es estable (`linea|metodo|partes`): volver a correrlo da el mismo.
 */
export function emparejar(
  lineas: LineaEmp[],
  datos: { movimientos: MovEmp[]; cobros: CobroEmp[]; ordenes: OrdenEmp[]; semanas?: SemanaDel[] },
  opciones: Partial<Opciones> = {},
  /** Grupos que una persona ya descartó: no se vuelven a proponer. */
  descartados: Set<string> = new Set(),
): Resultado {
  const o = { ...OPCIONES, ...opciones };
  const dias = diasYappy(datos.cobros);
  const grupos = consignaciones(datos.cobros);
  const montoDe = new Map(datos.cobros.map((c) => [c.id, c.bruto]));
  const indice = indexarOrdenes(datos.ordenes);
  const semanas = datos.semanas ?? [];
  const todas: Propuesta[] = [];
  for (const l of lineas) {
    const propias = [
      ...propuestasYappy(l, dias, montoDe),
      ...propuestasServientrega(l, grupos, o.diasServientrega, montoDe),
      ...propuestasMipos(l, datos.cobros, o, montoDe),
      ...propuestasOrdenes(l, indice, o),
      ...propuestasDelivery(l, semanas, o),
      ...propuestasLibro(l, datos.movimientos, o),
    ];
    for (const p of propias) {
      p.grupo = `${l.id}|${p.metodo}|${p.partes.map(claveParte).sort().join(",")}`;
      if (!descartados.has(p.grupo)) todas.push(p);
    }
  }
  // Primero lo que tiene prueba; después por puntaje; a igual puntaje, la línea más antigua (orden estable).
  todas.sort((a, b) => Number(b.auto) - Number(a.auto) || b.puntaje - a.puntaje || a.grupo.localeCompare(b.grupo));
  const usadas = new Set<string>();
  const conPropuesta = new Set<string>();
  const elegidas: Propuesta[] = [];
  for (const p of todas) {
    if (conPropuesta.has(p.lineaId) || p.partes.some((x) => marcasDe(x).choca.some((k) => usadas.has(k)))) continue;
    elegidas.push(p);
    conPropuesta.add(p.lineaId);
    for (const x of p.partes) for (const k of marcasDe(x).ocupa) usadas.add(k);
  }
  const elegidaDe = new Map(elegidas.map((p) => [p.lineaId, p.grupo]));
  const alternativas = new Map<string, Propuesta[]>();
  // Las alternativas de una línea no comparten partes entre sí ni con la elegida (una parte se propone una vez por línea).
  const partesDe = new Map(elegidas.map((p) => [p.lineaId, new Set(p.partes.map(claveParte))]));
  for (const p of todas) {
    if (elegidaDe.get(p.lineaId) === p.grupo) continue;
    const lista = alternativas.get(p.lineaId) ?? [];
    const vistas = partesDe.get(p.lineaId) ?? new Set<string>();
    if (lista.length >= o.alternativas || p.partes.some((x) => vistas.has(claveParte(x)))) continue;
    lista.push(p);
    for (const x of p.partes) vistas.add(claveParte(x));
    partesDe.set(p.lineaId, vistas);
    alternativas.set(p.lineaId, lista);
  }
  return { elegidas, alternativas };
}

export type EstadoLinea = "pendiente" | "sugerida" | "conciliada" | "ignorada";

/**
 * El estado de una línea según sus parejas: conciliada si lo confirmado cubre su monto (± 1 centavo; el monto de cada
 * parte ya es neto de su comisión), sugerida si tiene alguna propuesta, pendiente si no. Ignorada se respeta.
 */
export function estadoDeLinea(
  actual: EstadoLinea,
  monto: number,
  pares: { estado: "sugerido" | "confirmado" | "descartado"; monto: number; principal?: boolean }[],
): EstadoLinea {
  if (actual === "ignorada") return actual;
  const confirmados = pares.filter((p) => p.estado === "confirmado");
  const cubierto = confirmados.reduce((a, p) => a + Math.abs(p.monto), 0);
  if (confirmados.length && Math.abs(cent(cubierto) - cent(Math.abs(monto))) <= 1) return "conciliada";
  // Solo la propuesta elegida la hace «sugerida»; las alternativas se ven en la ficha pero la línea sigue pendiente.
  return pares.some((p) => p.estado === "sugerido" && p.principal !== false) ? "sugerida" : "pendiente";
}

/** Cuánto falta cubrir de una línea con lo confirmado (0 si está cubierta). */
export function faltaCubrir(monto: number, confirmados: { monto: number }[]): number {
  return Math.round((Math.abs(monto) - confirmados.reduce((a, p) => a + Math.abs(p.monto), 0)) * 100) / 100;
}
