import { moduloDeHref } from "./nav-data";
import type { PendientesHoy } from "./pendientes-hoy";

/** Pendientes por página del menú: la clave es el href, solo con las que tienen algo por atender. */
export type ContadoresMenu = Record<string, number>;

export interface PendientesMenu {
  contadores: ContadoresMenu;
  /** Suma para el «Centro de notificaciones» (con los avisos «Para ti» sin leer). */
  total: number;
  /** Avisos personales sin leer (menciones con «@»): los ve todo el que los tenga, aunque no tenga el módulo. */
  paraTi: number;
}

export const SIN_PENDIENTES: PendientesMenu = { contadores: {}, total: 0, paraTi: 0 };

/** Suma los avisos «Para ti» sin leer al total de Avisos. */
export function conParaTi(p: PendientesMenu, paraTi: number): PendientesMenu {
  return { ...p, total: p.total + paraTi, paraTi };
}

/** Páginas del menú que muestran un contador; el resto no cuenta nada. */
const PAGINAS_CON_CONTADOR = ["/alertas", "/pedidos-dropi", "/retiros", "/inventario"];

/** ¿Hay algo que consultar para esta persona? Sin ninguno de estos módulos no se gasta ni una consulta. */
export function necesitaPendientes(modulos: string[]): boolean {
  return (
    modulos.includes("notificaciones") || PAGINAS_CON_CONTADOR.some((href) => modulos.includes(moduloDeHref(href)))
  );
}

/**
 * Reparte los pendientes del día entre las páginas donde se resuelven: las alertas en «Alertas de
 * inventario», los pedidos con novedad en «Pedidos Dropi», y los saldos sin registrar y los retiros
 * de Dropi sin vincular en «Conciliación de Retiros», y los lotes vencidos o por vencer en «Inventario». Solo se cuentan las páginas que la persona puede ver.
 */
export function calcularPendientesMenu(pendientes: PendientesHoy, modulos: string[]): PendientesMenu {
  const porPagina: ContadoresMenu = {
    "/alertas": pendientes.alertasInventario,
    "/pedidos-dropi": pendientes.pedidosConNovedad,
    "/retiros": pendientes.saldosSinRegistrar + pendientes.retirosDropiSinVincular,
    "/inventario": pendientes.lotesVencidos + pendientes.lotesPorVencer,
  };
  const contadores: ContadoresMenu = {};
  for (const [href, cantidad] of Object.entries(porPagina)) {
    if (cantidad > 0 && modulos.includes(moduloDeHref(href))) contadores[href] = cantidad;
  }
  const total = modulos.includes("notificaciones")
    ? pendientes.alertasInventario +
      pendientes.pedidosConNovedad +
      pendientes.saldosSinRegistrar +
      pendientes.retirosDropiSinVincular +
      pendientes.lotesVencidos +
      pendientes.lotesPorVencer
    : 0;
  return { contadores, total, paraTi: 0 };
}

/** «99+» para no ensanchar la pastilla. */
export function textoContador(cantidad: number): string {
  return cantidad > 99 ? "99+" : String(cantidad);
}

/** Lo que dice un lector de pantalla y el tooltip: «1 pendiente», «3 pendientes». */
export function textoPendientes(cantidad: number): string {
  return cantidad === 1 ? "1 pendiente" : `${cantidad} pendientes`;
}
