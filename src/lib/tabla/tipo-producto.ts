// El selector «Todos / Productos simples / Packs y combos» de las listas de productos (7 nov 2026, pedido de Hernán): cómo se lee y cómo se pone sobre el campo «Tipo» de una lista.
// Sin React, para poder probarlo.

import type { Filtro } from "./motor";

export type OpcionTipoProducto = "todos" | "simple" | "pack";

/** Cuál de las tres opciones está activa según los filtros: «simple» o «pack» solo si el campo tiene exactamente ese valor; en cualquier otro caso, «todos». */
export function opcionElegida(filtros: Filtro[], campo: string, valorSimple: string, valorPack: string): OpcionTipoProducto {
  const actual = filtros.find((f) => f.campo === campo);
  const valores = actual && actual.valor.tipo === "seleccion" ? actual.valor.valores : [];
  if (valores.length === 1 && valores[0] === valorSimple) return "simple";
  if (valores.length === 1 && valores[0] === valorPack) return "pack";
  return "todos";
}

/** Los filtros con la opción elegida: reemplaza lo que hubiera en el campo (y quita el filtro con «todos»); los filtros de otros campos no se tocan. */
export function conOpcion(filtros: Filtro[], campo: string, opcion: OpcionTipoProducto, valorSimple: string, valorPack: string): Filtro[] {
  const resto = filtros.filter((f) => f.campo !== campo);
  if (opcion === "todos") return resto;
  return [...resto, { campo, valor: { tipo: "seleccion", valores: [opcion === "simple" ? valorSimple : valorPack] } }];
}
