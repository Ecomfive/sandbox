import { moduloDeHref, type NavItem } from "./nav-data";
import type { PendientesHoy } from "./pendientes-hoy";

/** Pendientes por página del menú: la clave es el href, solo con las que tienen algo por atender. */
export type ContadoresMenu = Record<string, number>;

export interface PendientesMenu {
  contadores: ContadoresMenu;
  /** Suma para el «Centro de notificaciones»; 0 si la persona no tiene ese módulo. */
  total: number;
}

export const SIN_PENDIENTES: PendientesMenu = { contadores: {}, total: 0 };

/** Páginas del menú que muestran un contador; el resto no cuenta nada. */
const PAGINAS_CON_CONTADOR = ["/alertas", "/pedidos-dropi", "/retiros"];

/** ¿Hay algo que consultar para esta persona? Sin ninguno de estos módulos no se gasta ni una consulta. */
export function necesitaPendientes(modulos: string[]): boolean {
  return (
    modulos.includes("notificaciones") || PAGINAS_CON_CONTADOR.some((href) => modulos.includes(moduloDeHref(href)))
  );
}

/**
 * Reparte los pendientes del día entre las páginas donde se resuelven: las alertas en «Alertas de
 * inventario», los pedidos con novedad en «Pedidos Dropi», y los saldos sin registrar y los retiros
 * de Dropi sin vincular en «Conciliación de Retiros». Solo se cuentan las páginas que la persona puede ver.
 */
export function calcularPendientesMenu(pendientes: PendientesHoy, modulos: string[]): PendientesMenu {
  const porPagina: ContadoresMenu = {
    "/alertas": pendientes.alertasInventario,
    "/pedidos-dropi": pendientes.pedidosConNovedad,
    "/retiros": pendientes.saldosSinRegistrar + pendientes.retirosDropiSinVincular,
  };
  const contadores: ContadoresMenu = {};
  for (const [href, cantidad] of Object.entries(porPagina)) {
    if (cantidad > 0 && modulos.includes(moduloDeHref(href))) contadores[href] = cantidad;
  }
  const total = modulos.includes("notificaciones")
    ? pendientes.alertasInventario +
      pendientes.pedidosConNovedad +
      pendientes.saldosSinRegistrar +
      pendientes.retirosDropiSinVincular
    : 0;
  return { contadores, total };
}

/** Lo que suman las páginas de un grupo o sección (lo que se muestra cuando está cerrado). */
export function sumaDeItems(items: NavItem[], contadores: ContadoresMenu): number {
  return items.reduce((suma, item) => suma + (item.href ? (contadores[item.href] ?? 0) : 0), 0);
}

/** «99+» para no ensanchar la pastilla. */
export function textoContador(cantidad: number): string {
  return cantidad > 99 ? "99+" : String(cantidad);
}

/** Lo que dice un lector de pantalla y el tooltip: «1 pendiente», «3 pendientes». */
export function textoPendientes(cantidad: number): string {
  return cantidad === 1 ? "1 pendiente" : `${cantidad} pendientes`;
}
