// CSV de lo que se ve en una tabla (las filas que dejan los filtros, en el orden en que se ven). Todo sale
// de la definición de la tabla (`DefTabla`), así que cualquier tabla con barra de herramientas lo tiene.
// Sin React, para poder probarlo.

import { SIN_VALOR, opcionesDeSeleccion, type CampoDef, type DefTabla } from "./motor";

export type CeldaCsv = string | number | null | undefined;

/**
 * Una celda lista para el CSV. Un texto que empieza por = + - @ se escribe con una comilla delante: en Excel
 * y Hojas de cálculo lo contrario ejecutaría el texto como fórmula (datos de Dropi o notas escritas a mano).
 */
export function celdaCsv(valor: CeldaCsv): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") return Number.isFinite(valor) ? String(valor) : "";
  // Un número escrito como texto («-12.50») no es una fórmula: se deja tal cual para que Excel lo lea como número.
  // Se mira tras los espacios del inicio (algunos programas los recortan al abrir) y con los signos de ancho completo.
  const inicio = valor.replace(/^[\s​\u0000]+/, "");
  const texto = (/^[=+\-@＝＋－＠]/.test(inicio) || /^[\t\r\n]/.test(valor)) && !/^-?\d+(\.\d+)?$/.test(valor) ? `'${valor}` : valor;
  // También `;` y tabulador: un Excel en español separa por `;`, y sin comillas «x;=1+1» abriría una celda con fórmula.
  return /[",;\t\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function valorDeCampo<F>(campo: CampoDef<F>, fila: F, etiquetas: Map<string, string> | undefined): CeldaCsv {
  switch (campo.tipo) {
    case "seleccion":
      // «Sin valor» sale vacío; el resto, con el nombre que se ve en pantalla (no el código interno).
      return campo
        .valores(fila)
        .filter((valor) => valor !== SIN_VALOR)
        .map((valor) => etiquetas?.get(valor) ?? valor)
        .join("; ");
    case "fecha":
    case "numero":
    case "texto":
      return campo.valor(fila);
  }
}

/** Una columna de lo que se descarga (CSV o PDF): su nombre, su tipo y cómo se lee de una fila. */
export interface ColumnaDescarga<F> {
  etiqueta: string;
  tipo: "texto" | "numero" | "fecha" | "seleccion";
  valor: (fila: F) => CeldaCsv;
}

/** Las columnas que se descargan: primero las de `csvAntes` de la tabla y luego cada campo (sin los `sinCsv`). */
export function columnasDeDescarga<F>(def: DefTabla<F>, filas: F[]): ColumnaDescarga<F>[] {
  const antes = def.csvAntes ?? [];
  const campos = def.campos.filter((c) => !c.sinCsv);
  const etiquetas = new Map<string, Map<string, string>>();
  for (const campo of campos) {
    if (campo.tipo === "seleccion") {
      etiquetas.set(campo.id, new Map(opcionesDeSeleccion(def, filas, campo.id).map((o) => [o.valor, o.etiqueta])));
    }
  }
  return [
    ...antes.map((a) => ({ etiqueta: a.etiqueta, tipo: "texto" as const, valor: (f: F) => a.valor(f) })),
    ...campos.map((c) => ({ etiqueta: c.etiqueta, tipo: c.tipo, valor: (f: F) => valorDeCampo(c, f, etiquetas.get(c.id)) })),
  ];
}

/** Encabezado y una línea por fila: primero las columnas de `csvAntes` de la tabla y luego cada campo. */
export function filasACsv<F>(def: DefTabla<F>, filas: F[]): string {
  const columnas = columnasDeDescarga(def, filas);
  const lineas = [columnas.map((c) => c.etiqueta).map(celdaCsv).join(",")];
  for (const fila of filas) lineas.push(columnas.map((c) => celdaCsv(c.valor(fila))).join(","));
  return lineas.join("\r\n");
}

/** «gastos-2026-09-20.csv»: la clave de la tabla y el día. */
export function nombreArchivoCsv(clave: string, fecha: Date): string {
  return `${clave}-${fecha.toISOString().slice(0, 10)}.csv`;
}
