/** Qué significa cada cubeta del inventario: es lo que sale al pasar el cursor por el título de su columna. */
export const DESCRIPCION_CUBETA = {
  fisico: "Las unidades que hay realmente en la bodega, incluidas las dañadas, las que están en inspección y las retenidas.",
  reservado: "Unidades ya comprometidas por un pedido que aún no sale. Siguen en la bodega, pero no se pueden vender otra vez.",
  disponible: "Lo que se puede prometer hoy: el físico menos lo reservado, dañado, en inspección y retenido. Se calcula solo.",
  danado: "Unidades que están en la bodega pero no se pueden vender porque están dañadas.",
  inspeccion: "Unidades que llegaron y esperan revisión antes de poder venderse.",
  retenido: "Unidades bloqueadas por otra razón: no se pueden vender hasta liberarlas.",
  enCamino: "Unidades ya compradas que todavía no llegan a la bodega. No cuentan como físico.",
} as const;
