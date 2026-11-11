// Reporte para el contador externo (mejora 94): el libro del período en el formato de la declaración —fecha,
// RUC/proveedor, documento, base, ITBMS, total y tipo/cuenta— en Excel, con totales por tipo. Dos libros: «Compras y
// gastos» (los movimientos del libro que no son ingresos) y «Ventas facturadas» (las órdenes marcadas «facturado con
// ITBMS» de Ventas por tienda, cuyo total incluye el 7 %). Base = total − ITBMS como fórmula; los totales por tipo, con
// SUMIF sobre la hoja. Lógica pura; la carga vive en la ruta /api/exportar-libro-contador. Prueba en
// `libro-contador.test.ts`.

import * as XLSX from "xlsx";
import { FORMATO_DINERO, escribirLibro } from "./excel-formulas";

export const TASA_ITBMS = 0.07;

/** Las secciones del libro que no son compras ni gastos (no van al libro de compras). */
const NO_COMPRAS = new Set(["ingresos", "informacion", "patrimonial", "pago_tdc"]);

export interface MovimientoContador {
  fecha: string;
  ruc: string | null;
  proveedor: string | null;
  documento: string | null;
  total: number;
  /** El ITBMS del documento si se cargó (null = no cargado). */
  itbms: number | null;
  tipo: string;
  seccion: string;
  cuenta: string | null;
  tienda: string | null;
}

export interface VentaContador {
  fecha: string;
  documento: string | null;
  orden: string;
  tienda: string;
  total: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Solo las compras y gastos (fuera ingresos, información, patrimoniales y pagos de tarjeta), por fecha. */
export function comprasDelLibro(movs: MovimientoContador[]): MovimientoContador[] {
  return movs.filter((m) => !NO_COMPRAS.has(m.seccion) && m.total !== 0).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.tipo.localeCompare(b.tipo));
}

/** El ITBMS incluido en un total con el 7 %. */
export const itbmsIncluido = (total: number) => r2(total - total / (1 + TASA_ITBMS));

export interface TotalTipo {
  tipo: string;
  base: number;
  itbms: number;
  total: number;
  documentos: number;
}

/** Totales por tipo (para la prueba y para el resumen en pantalla). */
export function totalesPorTipo(compras: MovimientoContador[]): TotalTipo[] {
  const m = new Map<string, TotalTipo>();
  for (const c of compras) {
    const t = m.get(c.tipo) ?? { tipo: c.tipo, base: 0, itbms: 0, total: 0, documentos: 0 };
    t.total = r2(t.total + c.total);
    t.itbms = r2(t.itbms + (c.itbms ?? 0));
    t.base = r2(t.total - t.itbms);
    t.documentos++;
    m.set(c.tipo, t);
  }
  return [...m.values()].sort((a, b) => b.total - a.total);
}

/** Un texto que Excel podría ejecutar como fórmula se escribe con comilla. */
const textoSeguro = (v: string | null): string => {
  const s = (v ?? "").trim();
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

const celdaN = (v: number) => ({ t: "n" as const, v: r2(v), z: FORMATO_DINERO });

/** La hoja de compras: una fila por documento, Base = Total − ITBMS (fórmula) y la fila de totales con SUM. */
function hojaCompras(compras: MovimientoContador[], titulo: string): XLSX.WorkSheet {
  const enc = ["Fecha", "RUC", "Proveedor", "Documento", "Base", "ITBMS", "Total", "Tipo", "Cuenta", "Tienda"];
  const ws = XLSX.utils.aoa_to_sheet([[titulo], [], enc]);
  compras.forEach((c, i) => {
    const r = 3 + i;
    const fila = r + 1;
    const pon = (col: number, celda: XLSX.CellObject) => (ws[XLSX.utils.encode_cell({ r, c: col })] = celda);
    pon(0, { t: "s", v: c.fecha });
    pon(1, { t: "s", v: textoSeguro(c.ruc) });
    pon(2, { t: "s", v: textoSeguro(c.proveedor) });
    pon(3, { t: "s", v: textoSeguro(c.documento) });
    pon(4, { t: "n", v: r2(c.total - (c.itbms ?? 0)), f: `G${fila}-F${fila}`, z: FORMATO_DINERO });
    if (c.itbms !== null) pon(5, celdaN(c.itbms));
    pon(6, celdaN(c.total));
    pon(7, { t: "s", v: textoSeguro(c.tipo) });
    pon(8, { t: "s", v: textoSeguro(c.cuenta) });
    pon(9, { t: "s", v: textoSeguro(c.tienda) });
  });
  const ultima = 3 + compras.length;
  const rt = ultima;
  ws[XLSX.utils.encode_cell({ r: rt, c: 0 })] = { t: "s", v: "Total" };
  for (const [c, letra] of [[4, "E"], [5, "F"], [6, "G"]] as const) {
    const total = compras.reduce((a, x) => a + (c === 4 ? x.total - (x.itbms ?? 0) : c === 5 ? (x.itbms ?? 0) : x.total), 0);
    ws[XLSX.utils.encode_cell({ r: rt, c })] = { t: "n", v: r2(total), f: compras.length ? `SUM(${letra}4:${letra}${ultima})` : undefined, z: FORMATO_DINERO };
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rt, c: enc.length - 1 } });
  ws["!cols"] = [{ wch: 11 }, { wch: 16 }, { wch: 30 }, { wch: 16 }, { wch: 13 }, { wch: 12 }, { wch: 13 }, { wch: 28 }, { wch: 18 }, { wch: 16 }];
  return ws;
}

/** Totales por tipo con SUMIF sobre la hoja de compras (se recalculan si el contador corrige una fila). */
function hojaResumen(compras: MovimientoContador[], ventas: VentaContador[], titulo: string): XLSX.WorkSheet {
  const tipos = totalesPorTipo(compras);
  const ws = XLSX.utils.aoa_to_sheet([[titulo], [], ["Tipo", "Documentos", "Base", "ITBMS", "Total"]]);
  const ultima = 3 + compras.length;
  const rango = (letra: string) => `'Compras y gastos'!$${letra}$4:$${letra}$${Math.max(4, ultima)}`;
  tipos.forEach((t, i) => {
    const r = 3 + i;
    const fila = r + 1;
    ws[XLSX.utils.encode_cell({ r, c: 0 })] = { t: "s", v: textoSeguro(t.tipo) };
    ws[XLSX.utils.encode_cell({ r, c: 1 })] = { t: "n", v: t.documentos, f: `COUNTIF(${rango("H")},A${fila})` };
    ws[XLSX.utils.encode_cell({ r, c: 2 })] = { t: "n", v: t.base, f: `SUMIF(${rango("H")},A${fila},${rango("E")})`, z: FORMATO_DINERO };
    ws[XLSX.utils.encode_cell({ r, c: 3 })] = { t: "n", v: t.itbms, f: `SUMIF(${rango("H")},A${fila},${rango("F")})`, z: FORMATO_DINERO };
    ws[XLSX.utils.encode_cell({ r, c: 4 })] = { t: "n", v: t.total, f: `SUMIF(${rango("H")},A${fila},${rango("G")})`, z: FORMATO_DINERO };
  });
  const rt = 3 + tipos.length;
  ws[XLSX.utils.encode_cell({ r: rt, c: 0 })] = { t: "s", v: "Total compras y gastos" };
  for (const [c, letra] of [[1, "B"], [2, "C"], [3, "D"], [4, "E"]] as const) {
    const v = c === 1 ? compras.length : tipos.reduce((a, t) => a + (c === 2 ? t.base : c === 3 ? t.itbms : t.total), 0);
    ws[XLSX.utils.encode_cell({ r: rt, c })] = { t: "n", v: r2(v), f: tipos.length ? `SUM(${letra}4:${letra}${rt})` : undefined, ...(c > 1 ? { z: FORMATO_DINERO } : {}) };
  }
  const totalVentas = ventas.reduce((a, v) => a + v.total, 0);
  const rv = rt + 2;
  ws[XLSX.utils.encode_cell({ r: rv, c: 0 })] = { t: "s", v: "Ventas facturadas" };
  ws[XLSX.utils.encode_cell({ r: rv, c: 1 })] = { t: "n", v: ventas.length };
  ws[XLSX.utils.encode_cell({ r: rv, c: 2 })] = { t: "n", v: r2(totalVentas - ventas.reduce((a, v) => a + itbmsIncluido(v.total), 0)), f: ventas.length ? `'Ventas facturadas'!E${4 + ventas.length}` : undefined, z: FORMATO_DINERO };
  ws[XLSX.utils.encode_cell({ r: rv, c: 3 })] = { t: "n", v: r2(ventas.reduce((a, v) => a + itbmsIncluido(v.total), 0)), f: ventas.length ? `'Ventas facturadas'!F${4 + ventas.length}` : undefined, z: FORMATO_DINERO };
  ws[XLSX.utils.encode_cell({ r: rv, c: 4 })] = { t: "n", v: r2(totalVentas), f: ventas.length ? `'Ventas facturadas'!G${4 + ventas.length}` : undefined, z: FORMATO_DINERO };
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rv, c: 4 } });
  ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  return ws;
}

/** Las ventas facturadas: Base = Total / 1,07 y el ITBMS incluido (fórmulas), con su fila de totales. */
function hojaVentas(ventas: VentaContador[], titulo: string): XLSX.WorkSheet {
  const enc = ["Fecha", "Factura", "Orden", "Tienda", "Base", "ITBMS", "Total"];
  const ws = XLSX.utils.aoa_to_sheet([[titulo], [], enc]);
  const orden = [...ventas].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.orden.localeCompare(b.orden));
  orden.forEach((v, i) => {
    const r = 3 + i;
    const fila = r + 1;
    const itbms = itbmsIncluido(v.total);
    ws[XLSX.utils.encode_cell({ r, c: 0 })] = { t: "s", v: v.fecha };
    ws[XLSX.utils.encode_cell({ r, c: 1 })] = { t: "s", v: textoSeguro(v.documento) };
    ws[XLSX.utils.encode_cell({ r, c: 2 })] = { t: "s", v: textoSeguro(v.orden) };
    ws[XLSX.utils.encode_cell({ r, c: 3 })] = { t: "s", v: textoSeguro(v.tienda) };
    ws[XLSX.utils.encode_cell({ r, c: 4 })] = { t: "n", v: r2(v.total - itbms), f: `G${fila}-F${fila}`, z: FORMATO_DINERO };
    ws[XLSX.utils.encode_cell({ r, c: 5 })] = { t: "n", v: itbms, f: `ROUND(G${fila}-G${fila}/${1 + TASA_ITBMS},2)`, z: FORMATO_DINERO };
    ws[XLSX.utils.encode_cell({ r, c: 6 })] = celdaN(v.total);
  });
  const rt = 3 + orden.length;
  ws[XLSX.utils.encode_cell({ r: rt, c: 0 })] = { t: "s", v: "Total" };
  for (const [c, letra] of [[4, "E"], [5, "F"], [6, "G"]] as const) {
    const v = orden.reduce((a, x) => a + (c === 6 ? x.total : c === 5 ? itbmsIncluido(x.total) : x.total - itbmsIncluido(x.total)), 0);
    ws[XLSX.utils.encode_cell({ r: rt, c })] = { t: "n", v: r2(v), f: orden.length ? `SUM(${letra}4:${letra}${rt})` : undefined, z: FORMATO_DINERO };
  }
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rt, c: enc.length - 1 } });
  ws["!cols"] = [{ wch: 11 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 13 }, { wch: 12 }, { wch: 13 }];
  return ws;
}

/** El libro del contador en bytes: Resumen por tipo, Compras y gastos y Ventas facturadas, con encabezados congelados. */
export function libroContador(movimientos: MovimientoContador[], ventas: VentaContador[], etiquetaPeriodo: string): Buffer {
  const compras = comprasDelLibro(movimientos);
  return escribirLibro([
    { nombre: "Resumen por tipo", hoja: hojaResumen(compras, ventas, `Resumen por tipo · ${etiquetaPeriodo} · USD`), congelar: { filas: 3, columnas: 1 } },
    { nombre: "Compras y gastos", hoja: hojaCompras(compras, `Libro de compras y gastos · ${etiquetaPeriodo} · USD`), congelar: { filas: 3, columnas: 1 } },
    { nombre: "Ventas facturadas", hoja: hojaVentas(ventas, `Libro de ventas facturadas · ${etiquetaPeriodo} · USD`), congelar: { filas: 3, columnas: 1 } },
  ]);
}
