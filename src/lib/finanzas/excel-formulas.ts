// Exportar reportes a Excel con fórmulas, no solo valores (mejora 93). Una «planilla financiera» son filas de conceptos
// por columnas de meses: el detalle va como número; las secciones, resultados y totales como fórmulas (SUM o la suma con
// signo de otras filas), el total de cada fila como SUM de sus meses y los márgenes como cociente. Cada fórmula se
// comprueba contra el valor que calculó el portal antes de escribirla: si no da lo mismo (un caso que la fórmula no
// representa), la celda queda con el valor. Formato de número y encabezados congelados (SheetJS no escribe el panel
// congelado: se agrega al XML de la hoja). Lógica pura con prueba en `excel-formulas.test.ts`.

import * as XLSX from "xlsx";

export type PesoFila = "detalle" | "seccion" | "resultado" | "porcentaje" | "titulo";

export interface FilaPlanilla {
  clave: string;
  etiqueta: string;
  peso: PesoFila;
  /** Un valor por columna (mes). */
  valores: (number | null)[];
  /** El total de la fila, si no es la suma de los meses (un saldo: caja inicial del primer mes). */
  total?: number | null;
  /** Para un resultado: las filas (por clave) que lo forman y con qué signo. */
  suma?: { clave: string; signo: 1 | -1 }[];
  /** Para un porcentaje: numerador y denominador (por clave). */
  cociente?: { numerador: string; denominador: string };
  /** Para una sección: suma las filas de detalle que la siguen (hasta la próxima fila que no es detalle). */
  sumaDetalle?: boolean;
  /** Signo de esta fila al sumarla en su sección (una salida dentro de un bloque de flujo resta). */
  signoEnSeccion?: 1 | -1;
  /** Para un saldo: el valor de esta columna sale de otra fila de la columna anterior (caja inicial = caja final previa). */
  arrastre?: string;
  /** Para un saldo: el total es el del primer mes (caja inicial) o el del último (caja final). */
  saldo?: "primero" | "ultimo";
}

export interface Planilla {
  nombreHoja: string;
  titulo: string;
  columnas: string[];
  filas: FilaPlanilla[];
  etiquetaTotal?: string;
  formatoDinero?: string;
}

export const FORMATO_DINERO = "#,##0.00;[Red]-#,##0.00";
export const FORMATO_PCT = "0.0%";
const TOLERANCIA = 0.011;

const r2 = (v: number) => Math.round(v * 100) / 100;
const col = (c: number) => XLSX.utils.encode_col(c);

/** Las fórmulas de una planilla: por cada fila y columna (0 = primer mes; n = total), la fórmula o null. */
export interface CeldaPlanilla {
  valor: number | null;
  formula?: string;
}

/**
 * Arma las celdas de una planilla: las filas de datos empiezan en `filaInicio` (base 0) y la columna A es el concepto.
 * Exportada para la prueba.
 */
export function celdasPlanilla(p: Planilla, filaInicio = 3): CeldaPlanilla[][] {
  const n = p.columnas.length;
  const filaDe = new Map(p.filas.map((f, i) => [f.clave, i]));
  const ref = (i: number, c: number) => `${col(c + 1)}${filaInicio + i + 1}`;
  const valor = (i: number, c: number): number => (c < n ? (p.filas[i].valores[c] ?? 0) : (totalDe(i) ?? 0));
  const totalDe = (i: number): number | null => {
    const f = p.filas[i];
    if (f.total !== undefined) return f.total;
    if (f.peso === "porcentaje") return null;
    return r2(f.valores.reduce<number>((a, v) => a + (v ?? 0), 0));
  };
  const cerca = (a: number, b: number) => Math.abs(a - b) <= TOLERANCIA * Math.max(1, (Math.abs(b) / 1e6) | 0);

  return p.filas.map((f, i) => {
    const filaCeldas: CeldaPlanilla[] = [];
    // Las filas de detalle de una sección.
    const detalle: number[] = [];
    if (f.sumaDetalle) for (let j = i + 1; j < p.filas.length && p.filas[j].peso === "detalle"; j++) detalle.push(j);
    for (let c = 0; c <= n; c++) {
      const esTotal = c === n;
      const v = esTotal ? totalDe(i) : f.valores[c];
      const celda: CeldaPlanilla = { valor: v === null || v === undefined ? null : f.peso === "porcentaje" ? v : r2(v) };
      let formula: string | undefined;
      let calculado: number | null = null;
      if (f.peso === "porcentaje" && f.cociente) {
        const a = filaDe.get(f.cociente.numerador);
        const b = filaDe.get(f.cociente.denominador);
        if (a !== undefined && b !== undefined) {
          const den = valor(b, c);
          formula = `IF(${ref(b, c)}=0,"",${ref(a, c)}/${ref(b, c)})`;
          calculado = den === 0 ? null : valor(a, c) / den;
          if (celda.valor === null && den !== 0) celda.valor = calculado;
        }
      } else if (esTotal && f.total === undefined && f.peso !== "porcentaje" && n > 0) {
        formula = `SUM(${ref(i, 0)}:${ref(i, n - 1)})`;
        calculado = r2(f.valores.reduce<number>((a, x) => a + (x ?? 0), 0));
      } else if (esTotal && f.saldo && n > 0) {
        // Un saldo: el total de la caja inicial es el primer mes; el de la final, el último.
        const primero = f.saldo === "primero";
        formula = primero ? ref(i, 0) : ref(i, n - 1);
        calculado = r2(primero ? (f.valores[0] ?? 0) : (f.valores[n - 1] ?? 0));
      } else if (!esTotal && f.arrastre && c > 0) {
        const j = filaDe.get(f.arrastre);
        if (j !== undefined) {
          formula = ref(j, c - 1);
          calculado = valor(j, c - 1);
        }
      } else if (!esTotal && f.sumaDetalle && detalle.length) {
        const signos = detalle.map((j) => p.filas[j].signoEnSeccion ?? 1);
        if (signos.every((s) => s === 1)) formula = `SUM(${ref(detalle[0], c)}:${ref(detalle[detalle.length - 1], c)})`;
        else formula = detalle.map((j, k) => `${signos[k] === 1 ? (k ? "+" : "") : "-"}${ref(j, c)}`).join("");
        calculado = r2(detalle.reduce((a, j) => a + (p.filas[j].signoEnSeccion ?? 1) * valor(j, c), 0));
      } else if (!esTotal && f.suma?.length) {
        const partes = f.suma.map((s) => ({ ...s, i: filaDe.get(s.clave) })).filter((s): s is { clave: string; signo: 1 | -1; i: number } => s.i !== undefined);
        if (partes.length === f.suma.length) {
          formula = partes.map((s, k) => `${s.signo === 1 ? (k ? "+" : "") : "-"}${ref(s.i, c)}`).join("");
          calculado = r2(partes.reduce((a, s) => a + s.signo * valor(s.i, c), 0));
        }
      }
      if (formula !== undefined) {
        const esperado = celda.valor;
        const coincide = f.peso === "porcentaje" ? true : esperado === null ? calculado === 0 || calculado === null : calculado !== null && cerca(calculado, esperado);
        if (coincide) celda.formula = formula;
      }
      filaCeldas.push(celda);
    }
    return filaCeldas;
  });
}

/** La hoja de una planilla (título, fila vacía, encabezado y filas), con fórmulas, formato y anchos. */
export function hojaPlanilla(p: Planilla): XLSX.WorkSheet {
  const n = p.columnas.length;
  const encabezado = ["Concepto", ...p.columnas, p.etiquetaTotal ?? "Total"];
  const ws = XLSX.utils.aoa_to_sheet([[p.titulo], [], encabezado]);
  const celdas = celdasPlanilla(p, 3);
  p.filas.forEach((f, i) => {
    const r = 3 + i;
    ws[XLSX.utils.encode_cell({ r, c: 0 })] = { t: "s", v: (f.peso === "detalle" ? "    " : "") + f.etiqueta };
    celdas[i].forEach((x, c) => {
      const dir = XLSX.utils.encode_cell({ r, c: c + 1 });
      const z = f.peso === "porcentaje" ? FORMATO_PCT : (p.formatoDinero ?? FORMATO_DINERO);
      if (x.formula) ws[dir] = { t: "n", v: x.valor ?? 0, f: x.formula, z };
      else if (x.valor !== null) ws[dir] = { t: "n", v: x.valor, z };
    });
  });
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(2, 2 + p.filas.length), c: n + 1 } });
  ws["!cols"] = [{ wch: 40 }, ...encabezado.slice(1).map(() => ({ wch: 14 }))];
  return ws;
}

/**
 * El libro en bytes, con el encabezado congelado en cada hoja (`congelar`: filas de arriba y columnas de la izquierda que
 * quedan fijas; por defecto 3 filas —título, vacía y encabezado— y la columna de conceptos).
 */
export function escribirLibro(hojas: { nombre: string; hoja: XLSX.WorkSheet; congelar?: { filas: number; columnas: number } }[]): Buffer {
  const wb = XLSX.utils.book_new();
  for (const h of hojas) XLSX.utils.book_append_sheet(wb, h.hoja, h.nombre.slice(0, 31));
  const crudo = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return congelarEncabezados(
    crudo,
    hojas.map((h) => h.congelar ?? { filas: 3, columnas: 1 }),
  );
}

/** El XML de `<sheetView>` con el panel congelado. */
export function vistaCongelada(filas: number, columnas: number): string {
  if (filas <= 0 && columnas <= 0) return `<sheetViews><sheetView workbookViewId="0"/></sheetViews>`;
  const celda = `${col(Math.max(0, columnas))}${Math.max(0, filas) + 1}`;
  const panel = filas > 0 && columnas > 0 ? "bottomRight" : filas > 0 ? "bottomLeft" : "topRight";
  const attrs = [columnas > 0 ? `xSplit="${columnas}"` : "", filas > 0 ? `ySplit="${filas}"` : "", `topLeftCell="${celda}"`, `activePane="${panel}"`, `state="frozen"`].filter(Boolean).join(" ");
  return `<sheetViews><sheetView workbookViewId="0"><pane ${attrs}/><selection pane="${panel}" activeCell="${celda}" sqref="${celda}"/></sheetView></sheetViews>`;
}

/** Agrega el panel congelado al XML de cada hoja de un .xlsx ya escrito (la hoja i-ésima usa `congelar[i]`). */
export function congelarEncabezados(xlsx: Buffer, congelar: { filas: number; columnas: number }[]): Buffer {
  const CFB = XLSX.CFB as unknown as {
    read: (d: Buffer, o: { type: "buffer" }) => { FullPaths: string[]; FileIndex: { content: Uint8Array | number[] }[] };
    write: (c: unknown, o: { fileType: "zip"; type: "buffer"; compression?: boolean }) => Buffer;
  };
  const zip = CFB.read(xlsx, { type: "buffer" });
  zip.FullPaths.forEach((ruta, k) => {
    const m = ruta.match(/xl\/worksheets\/sheet(\d+)\.xml$/);
    if (!m) return;
    const c = congelar[Number(m[1]) - 1];
    if (!c) return;
    const entrada = zip.FileIndex[k];
    const xml = Buffer.from(entrada.content as Uint8Array).toString("utf8");
    const vista = vistaCongelada(c.filas, c.columnas);
    const nuevo = /<sheetViews>[\s\S]*?<\/sheetViews>/.test(xml)
      ? xml.replace(/<sheetViews>[\s\S]*?<\/sheetViews>/, vista)
      : xml.replace(/(<sheetFormatPr|<cols>|<sheetData)/, `${vista}$1`);
    entrada.content = Buffer.from(nuevo, "utf8");
  });
  return CFB.write(zip, { fileType: "zip", type: "buffer", compression: true });
}
