import * as XLSX from "xlsx";
import { generadoTexto, lineasFicha, numeroRetiro, type FichaRetiro } from "./ficha";

const FORMATO_MONTO = "#,##0.00";

/** Excel con la ficha en dos columnas (campo y valor); los montos son números para poder sumarlos o compararlos. */
export function fichaAXlsx(ficha: FichaRetiro): Uint8Array {
  const filas: (string | number | XLSX.CellObject)[][] = [
    ["Ecomfive - Ficha de retiro"],
    [numeroRetiro(ficha.correlativo)],
    [],
    ["Campo", "Valor"],
    ...lineasFicha(ficha).map((l): (string | XLSX.CellObject)[] => [
      l.campo,
      typeof l.valor === "number" ? { t: "n", v: l.valor, z: FORMATO_MONTO } : l.valor,
    ]),
    [],
    ["Generado el", generadoTexto(ficha)],
    ["Generado por", ficha.generadoPor],
  ];

  const hoja = XLSX.utils.aoa_to_sheet(filas);
  hoja["!cols"] = [{ wch: 24 }, { wch: 52 }];
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Ficha");
  return new Uint8Array(XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer);
}
