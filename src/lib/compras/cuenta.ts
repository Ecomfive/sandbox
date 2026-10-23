// Qué compras cuentan al sumar lo comprado de un producto (unidades, costo, cuántas compras). **Regla del sistema (23 oct 2026, pedido
// de Hernán): una compra descartada o anulada no suma**: no se pidió, así que no son unidades compradas ni dinero invertido. Sigue
// visible en el histórico (con su etapa «Descartado», atenuada), pero ningún total la cuenta. Toda suma nueva de compras por producto
// pasa por `compraCuenta`; las que ya existían (`por-categoria`, `unidades-mes`, `en-camino`) la aplican con su propia condición.

/** Las etapas de una compra que nunca se suman. */
export const ETAPAS_QUE_NO_SUMAN: readonly string[] = ["descartado"];

/** Si una compra suma en los totales de un producto: ni descartada ni anulada (`anulada` = hay fecha o marca de anulación). */
export function compraCuenta(c: { etapa: string; anulada?: unknown }): boolean {
  return !ETAPAS_QUE_NO_SUMAN.includes(c.etapa) && !c.anulada;
}
