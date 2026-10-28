// Cuánto tardó una compra de un producto desde que se pidió hasta que llegó (28 oct 2026, pedido de Hernán: «así podremos saber los
// tiempos»). Las fechas se comparan como días (AAAA-MM-DD), sin hora ni zona horaria. Sin base ni React.

const dia = (fecha: string) => Date.parse(`${fecha.slice(0, 10)}T00:00:00Z`);

/** Días entre el pedido y la llegada; null si todavía no llegó o las fechas no sirven. */
export function diasPedidoLlegada(pedido: string | null, llegada: string | null): number | null {
  if (!pedido || !llegada) return null;
  const d = Math.round((dia(llegada) - dia(pedido)) / 864e5);
  return Number.isFinite(d) && d >= 0 ? d : null;
}

/** El promedio de días (redondeado) de las compras que ya llegaron; null si ninguna llegó. */
export function promedioDias(dias: (number | null)[]): number | null {
  const conDato = dias.filter((d): d is number => d !== null);
  return conDato.length ? Math.round(conDato.reduce((t, d) => t + d, 0) / conDato.length) : null;
}
