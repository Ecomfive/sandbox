import * as XLSX from "xlsx";

// Excel del portal del proveedor (28 oct 2026): cada pestaña se baja como un .xlsx con lo que se ve (o con las filas que la persona marcó).
// El archivo se arma en el navegador (esta pieza se carga solo al pulsar «Descargar Excel»). Los números y las fechas van como números y
// fechas de Excel (se pueden sumar, ordenar y filtrar) y el texto como texto: una celda de texto nunca se evalúa como fórmula.

export type CeldaExcel = string | number | null;

export interface ColumnaExcel {
  titulo: string;
  /** `entero` y `dinero` son números; `fecha` espera «AAAA-MM-DD» (lo demás queda como texto). */
  tipo?: "texto" | "entero" | "dinero" | "fecha";
  /** Ancho aproximado en caracteres. */
  ancho?: number;
}

const FORMATO = { entero: "#,##0", dinero: "#,##0.00", fecha: "yyyy-mm-dd" } as const;
const ES_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;

/** El nombre de una hoja: Excel admite hasta 31 caracteres y no deja `: \ / ? * [ ]`. */
export function nombreHoja(texto: string): string {
  return texto.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Hoja";
}

function celda(valor: CeldaExcel, tipo: ColumnaExcel["tipo"]): XLSX.CellObject {
  if (valor === null || valor === undefined || valor === "") return { t: "z" };
  if (tipo === "entero" || tipo === "dinero") {
    const n = Number(valor);
    return Number.isFinite(n) ? { t: "n", v: n, z: FORMATO[tipo] } : { t: "s", v: String(valor) };
  }
  if (tipo === "fecha") {
    const m = ES_FECHA.exec(String(valor));
    return m ? { t: "d", v: new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))), z: FORMATO.fecha } : { t: "s", v: String(valor) };
  }
  return { t: "s", v: String(valor) };
}

/** Un .xlsx de una hoja: la fila de títulos y una fila por cada arreglo de `filas`, con filtros en los títulos. */
export function filasAXlsx(hoja: string, columnas: ColumnaExcel[], filas: CeldaExcel[][]): Uint8Array {
  const sheet: XLSX.WorkSheet = {};
  columnas.forEach((c, j) => {
    sheet[XLSX.utils.encode_cell({ r: 0, c: j })] = { t: "s", v: c.titulo };
  });
  filas.forEach((fila, i) => {
    columnas.forEach((c, j) => {
      const x = celda(fila[j] ?? null, c.tipo);
      if (x.t !== "z") sheet[XLSX.utils.encode_cell({ r: i + 1, c: j })] = x;
    });
  });
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(filas.length, 0), c: Math.max(columnas.length - 1, 0) } });
  sheet["!cols"] = columnas.map((c) => ({ wch: c.ancho ?? (c.tipo === "texto" || !c.tipo ? 28 : 14) }));
  // Filtros en los títulos, para ordenar y buscar.
  sheet["!autofilter"] = { ref: sheet["!ref"] };
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, sheet, nombreHoja(hoja));
  return new Uint8Array(XLSX.write(libro, { type: "array", bookType: "xlsx", cellDates: true }) as ArrayBuffer);
}

/** `ecomfive-enviado-2026-10-28.xlsx` (solo letras, números y guiones). */
export function nombreArchivoExcel(clave: string, ahora: Date): string {
  const limpia = clave.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "datos";
  return `ecomfive-${limpia}-${ahora.toISOString().slice(0, 10)}.xlsx`;
}
