// Por qué un botón de la fila de Gestión de IDs Dropi está apagado (pedido de Alcides, 27 oct 2026): los botones no se esconden, se apagan
// y, al pasar el cursor, dicen el porqué en pocas palabras. `null` = se puede usar. Sin base ni React, con prueba.

import { BODEGA_DROPI } from "./automatico";

export interface EstadoBotones {
  dropiId: string;
  archivada: boolean;
  sinPublicar: boolean;
  apagadoPendiente: boolean;
  duplicada: boolean;
  /** Pausada por falta de stock (migración 0165). */
  pausada: boolean;
  /** Dropi la tiene archivada. */
  archivadaEnDropi: boolean;
  tipo: "publico" | "privado" | null;
  bodegaId: number | null;
  /** Unidades en Dropi (público) y reservadas a privados; null sin lectura. */
  stock: number | null;
  privado: number | null;
  /** Tiene stock en alguna bodega de ECOMFIVE (para privatizar). */
  stockPropio: boolean;
  /** Está en liquidación (migración 0174). */
  liquidacion: boolean;
}

/** Lo que impide casi todo, en el orden en que se le dice a la persona. */
function comun(e: EstadoBotones): string | null {
  if (e.duplicada) return "Es duplicada de otra publicación";
  if (e.sinPublicar) return "Todavía no está en Dropi";
  if (!e.dropiId.trim()) return "Sin ID de Dropi";
  return null;
}

const B280 = "Su stock es de la bodega de Dropi (B280)";

export function motivoRepublicar(e: EstadoBotones): string | null {
  return comun(e) ?? (e.archivada ? "Está archivada" : e.apagadoPendiente ? "Tiene un apagado pendiente" : e.tipo === "privado" ? "Una privada no se republica" : e.bodegaId === BODEGA_DROPI ? B280 : null);
}

export function motivoPrivatizar(e: EstadoBotones): string | null {
  return (
    comun(e) ??
    (e.archivada || e.archivadaEnDropi ? "Está archivada" : e.tipo === "privado" ? "Ya es privada" : !e.stockPropio ? "Sin stock en una bodega de ECOMFIVE" : null)
  );
}

/** Con un apagado pendiente el botón se usa para deshacerlo. */
export function motivoApagar(e: EstadoBotones): string | null {
  if (e.apagadoPendiente) return null;
  return comun(e) ?? (e.archivadaEnDropi || e.archivada ? "Está archivada" : e.bodegaId === BODEGA_DROPI ? B280 : null);
}

/** Una pausada usa el botón para reactivarse. */
export function motivoPausar(e: EstadoBotones): string | null {
  if (e.pausada && !e.duplicada) return null;
  const c = comun(e);
  if (c) return c;
  if (e.archivada) return "Está archivada";
  if (e.apagadoPendiente) return "Tiene un apagado pendiente";
  if (e.stock === null) return "Sin dato de stock en Dropi";
  if (e.stock > 0 || (e.privado ?? 0) > 0) return "Todavía tiene stock";
  return null;
}

/** Archivar (o sacar de Archivados) se puede casi siempre. */
export function motivoArchivar(e: EstadoBotones): string | null {
  if (e.duplicada) return "Es duplicada: se queda en Archivados";
  if (e.pausada) return "Está pausada: se reactiva con el botón de pausa";
  if (e.apagadoPendiente) return "Tiene un apagado pendiente";
  return null;
}

/** Poner en liquidación (o sacarla) es solo del sistema: no hace falta ID de Dropi. Una en liquidación siempre se puede sacar. */
export function motivoLiquidacion(e: EstadoBotones): string | null {
  if (e.liquidacion) return null;
  if (e.duplicada) return "Es duplicada de otra publicación";
  if (e.archivada) return "Está archivada";
  return null;
}
