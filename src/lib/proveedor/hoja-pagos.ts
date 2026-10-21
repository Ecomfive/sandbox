// Portal del proveedor: leer las hojas de pagos de Chin («payment record for EcomFive», una por país) y emparejar cada fila con su
// compra. Lógica pura; la importación está en scripts/importar-pagos-proveedor.ts.
//
// Columnas: Product, Quantity, Amount, Delivery Time (= envío), Dowm payment (= anticipo), Paid amount, Payment Time (lo pagado del
// anticipo y cuándo; varias partes van en líneas de la misma celda o en filas sin producto debajo), Unpaid Amount, Due date for
// payment, Blance payment (= saldo que falta), Arrival Time (= llegada), Paid Time (cuándo se pagó el saldo).

import type { Pago } from "./cuotas";

export interface FilaHoja {
  producto: string;
  unidades: number | null;
  monto: number;
  anticipo: number;
  fechaEnvio: string;
  fechaLlegada: string | null;
  pagosAnticipo: Pago[];
  pagosSaldo: Pago[];
}

/** CSV con comillas y saltos de línea dentro de las celdas. */
export function leerCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          celda += '"';
          i++;
        } else comillas = false;
      } else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  if (celda || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

/** «dd/mm/aaaa» → «aaaa-mm-dd». Un año mal escrito (2015, 20206) no cuenta. */
function fecha(texto: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (!m) return null;
  const anio = Number(m[3]);
  if (anio < 2024 || anio > 2035 || Number(m[2]) < 1 || Number(m[2]) > 12 || Number(m[1]) < 1 || Number(m[1]) > 31) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
const lineas = (celda: string | undefined) => String(celda ?? "").split(/\s*\n\s*/).map((x) => x.trim()).filter(Boolean);
const fechas = (celda: string | undefined) => lineas(celda).map(fecha).filter((f): f is string => !!f);
const numero = (texto: string | undefined) => {
  const n = Number(String(texto ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const redondear = (n: number) => Math.round(n * 100) / 100;

/** Los montos pagados con su fecha; si hay menos fechas que montos, las que faltan toman la última. */
function pagosDe(montos: string | undefined, cuando: string | undefined, porDefecto: string | null): Pago[] {
  const ms = lineas(montos).map(numero).filter((n) => n > 0);
  const fs = fechas(cuando);
  return ms.flatMap((monto, i) => {
    const f = fs[i] ?? fs.at(-1) ?? porDefecto;
    return f ? [{ monto, fecha: f }] : [];
  });
}

/** Las filas de una hoja de pagos. */
export function leerHojaPagos(texto: string): FilaHoja[] {
  const filas: FilaHoja[] = [];
  for (const r of leerCsv(texto).slice(1)) {
    const producto = (r[0] ?? "").replace(/\s+/g, " ").trim();
    // Una fila sin producto con un monto pagado es otra parte del anticipo de la fila de arriba.
    if (!producto) {
      const anterior = filas.at(-1);
      if (anterior) anterior.pagosAnticipo.push(...pagosDe(r[5], r[6], null));
      continue;
    }
    if (/^total/i.test(producto)) continue;
    const envio = fecha(r[3] ?? "");
    const monto = numero(r[2]);
    if (!envio || monto <= 0) continue;
    const anticipo = Math.min(monto, numero(r[4]) || redondear(monto / 2));
    const vence = new Date(Date.parse(envio) + 10 * 864e5).toISOString().slice(0, 10);
    let pagosAnticipo = pagosDe(r[5], r[6], vence);
    // Pagado sin monto escrito: «Unpaid Amount» en 0 con su fecha de pago.
    if (!pagosAnticipo.length && numero(r[7]) === 0 && fechas(r[6]).length) pagosAnticipo = [{ monto: anticipo, fecha: fechas(r[6]).at(-1)! }];
    const saldo = redondear(monto - anticipo);
    const pagadoSaldo = fechas(r[11]);
    const falta = numero(r[9]);
    const pagosSaldo: Pago[] = saldo > 0 && pagadoSaldo.length && falta < saldo ? [{ monto: redondear(saldo - falta), fecha: pagadoSaldo.at(-1)! }] : [];
    filas.push({ producto, unidades: numero(r[1]) || null, monto, anticipo, fechaEnvio: envio, fechaLlegada: fechas(r[10]).at(-1) ?? null, pagosAnticipo, pagosSaldo });
  }
  return filas;
}

export interface PedidoParaEmparejar {
  id: string;
  producto: string;
  paisCodigo: string | null;
  unidades: number | null;
  montoTotal: number | null;
  fechaEnvio: string | null;
}

const IGNORAR = new Set(["panama", "mexico", "costa", "rica", "venezuela", "lote", "capsules", "capsulas", "ecom01", "ecom02", "ecom03", "ecom04", "the", "and", "con", "para", "del"]);
const palabras = (t: string) =>
  new Set(
    t
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .split(" ")
      .filter((w) => w.length > 2 && !IGNORAR.has(w)),
  );
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

/** Puntos de una fila contra un pedido: monto igual (3), unidades iguales (2), palabras en común (hasta 3), país (1), envío del mismo día (1). */
export function puntaje(f: FilaHoja, pais: string, p: PedidoParaEmparejar): number {
  if (!p.fechaEnvio || Math.abs(diasEntre(p.fechaEnvio, f.fechaEnvio)) > 7) return 0;
  let pts = 0;
  if (p.montoTotal != null && Math.abs(p.montoTotal - f.monto) <= 1) pts += 3;
  if (p.unidades != null && p.unidades === f.unidades) pts += 2;
  const a = palabras(f.producto);
  const b = palabras(p.producto);
  pts += Math.min(3, [...a].filter((w) => b.has(w)).length);
  if (p.paisCodigo === pais) pts += 1;
  if (Math.abs(diasEntre(p.fechaEnvio, f.fechaEnvio)) <= 1) pts += 1;
  return pts;
}

/** Puntaje mínimo para emparejar (con el monto igual y algo más; o nombre, unidades y fecha). */
export const PUNTAJE_MINIMO = 5;

/** Empareja cada fila con a lo más un pedido y cada pedido con a lo más una fila, de la pareja más segura a la menos segura. */
export function emparejar(filas: { fila: FilaHoja; pais: string }[], pedidos: PedidoParaEmparejar[]): Map<number, string> {
  const parejas: { i: number; id: string; pts: number }[] = [];
  filas.forEach(({ fila, pais }, i) => {
    for (const p of pedidos) {
      const pts = puntaje(fila, pais, p);
      if (pts >= PUNTAJE_MINIMO) parejas.push({ i, id: p.id, pts });
    }
  });
  parejas.sort((a, b) => b.pts - a.pts || a.i - b.i);
  const resultado = new Map<number, string>();
  const usados = new Set<string>();
  for (const { i, id } of parejas) {
    if (resultado.has(i) || usados.has(id)) continue;
    resultado.set(i, id);
    usados.add(id);
  }
  return resultado;
}
