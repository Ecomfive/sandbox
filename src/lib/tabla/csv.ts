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
  const texto = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
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

/** Encabezado y una línea por fila: primero las columnas de `csvAntes` de la tabla y luego cada campo. */
export function filasACsv<F>(def: DefTabla<F>, filas: F[]): string {
  const antes = def.csvAntes ?? [];
  const etiquetas = new Map<string, Map<string, string>>();
  for (const campo of def.campos) {
    if (campo.tipo === "seleccion") {
      etiquetas.set(campo.id, new Map(opcionesDeSeleccion(def, filas, campo.id).map((o) => [o.valor, o.etiqueta])));
    }
  }
  const lineas = [[...antes.map((a) => a.etiqueta), ...def.campos.map((c) => c.etiqueta)].map(celdaCsv).join(",")];
  for (const fila of filas) {
    const celdas = [...antes.map((a) => a.valor(fila)), ...def.campos.map((c) => valorDeCampo(c, fila, etiquetas.get(c.id)))];
    lineas.push(celdas.map(celdaCsv).join(","));
  }
  return lineas.join("\r\n");
}

/** «gastos-2026-09-20.csv»: la clave de la tabla y el día. */
export function nombreArchivoCsv(clave: string, fecha: Date): string {
  return `${clave}-${fecha.toISOString().slice(0, 10)}.csv`;
}
