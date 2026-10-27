// Gestión de IDs Dropi sin estados manuales (pedido de Alcides, 21 oct 2026): «En Dropi» y el Tipo salen de lo que reporta Dropi
// (la carga de Ventas Dropi), y en lugar del flujo de trabajo (Producto nuevo, Revisar precio, Verificar con dropshipper, Validar
// bajar precio, Al día) el sistema calcula qué atención necesita cada publicación. Los umbrales salen de la pantalla de Reglas
// (reglas.ts, migración 0127); las constantes de abajo son sus valores de siempre. Sin base ni React, con prueba.

import { REGLAS_DEFECTO, type Reglas } from "./reglas";

/** Cómo está en Dropi: activo o archivado según Dropi; no aparece (tiene ID pero Dropi no lo reporta: en espera de
 * aprobación si es nuevo, o eliminado); sin ID; o sin datos (el país no tiene ventas de Dropi cargadas). */
export type EnDropi = "activo" | "archivado" | "no_aparece" | "sin_id" | "sin_datos";

export const EN_DROPI: { valor: EnDropi; etiqueta: string; color: string }[] = [
  { valor: "activo", etiqueta: "Activo en Dropi", color: "#30a46c" },
  // Archivado en rojo (pedido de Alcides, 27 oct 2026): el gris casi no se distinguía del verde de activo.
  { valor: "archivado", etiqueta: "Archivado en Dropi", color: "#e5484d" },
  // Lo que no está conectado con Dropi lleva el punto rojo (pedido de Hernán, 27 oct 2026: antes «Sin datos» salía gris y «No aparece», naranja).
  { valor: "no_aparece", etiqueta: "No aparece en Dropi", color: "#e5484d" },
  { valor: "sin_id", etiqueta: "Sin ID de Dropi", color: "#e5484d" },
  { valor: "sin_datos", etiqueta: "Sin datos de Dropi", color: "#e5484d" },
];

export function enDropi(p: { tieneId: boolean; hayCarga: boolean; dropi: { activo: boolean } | null }): EnDropi {
  if (!p.hayCarga) return "sin_datos";
  if (!p.tieneId) return "sin_id";
  if (!p.dropi) return "no_aparece";
  return p.dropi.activo ? "activo" : "archivado";
}

/**
 * Va a «Archivados» del sistema: si Dropi lo tiene archivado. Sin datos de Dropi (otro país, sin ID o no aparece) se respeta lo
 * que se había marcado a mano, para no sacar de golpe lo que ya estaba archivado.
 */
export function estaArchivada(estado: EnDropi, manualArchivada: boolean): boolean {
  if (estado === "activo") return false;
  if (estado === "archivado") return true;
  return manualArchivada;
}

/** Lo que necesita cada publicación (puede ser más de una). Sin ninguna, está al día. */
export type Accion = "margen_bajo" | "ventas_caida" | "bajar_precio" | "verificar_dropshipper" | "republicar";

export const ACCIONES: { valor: Accion | "al_dia"; etiqueta: string; color: string; detalle: string }[] = [
  { valor: "margen_bajo", etiqueta: "Margen bajo", color: "#e5484d", detalle: "Margen bruto menor a 30 %" },
  { valor: "ventas_caida", etiqueta: "Ventas en caída", color: "#d9a200", detalle: "Este mes vende menos de la mitad que el anterior" },
  { valor: "bajar_precio", etiqueta: "Competidor más barato", color: "#f76808", detalle: "Alguien vende lo mismo más barato y tiene stock" },
  { valor: "verificar_dropshipper", etiqueta: "Verificar con dropshipper", color: "#e5484d", detalle: "Privatizado a un dropshipper y sin ventas en 30 días" },
  { valor: "republicar", etiqueta: "Republicar", color: "#0090ff", detalle: "30 días sin ninguna venta y es de nuestra bodega" },
  { valor: "al_dia", etiqueta: "Al día", color: "#30a46c", detalle: "Nada que revisar" },
];

/** El detalle de cada tarjeta con los umbrales de las reglas («Margen bruto menor a 25 %»). */
export function detalleAccion(valor: Accion | "al_dia", r: Reglas): string {
  const pct = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString("es-PA")} %`;
  if (valor === "margen_bajo") return `Margen bruto menor a ${pct(r.margen_minimo)}`;
  if (valor === "republicar") return `${r.dias_republicar} días sin ninguna venta y es de nuestra bodega (no la B280)`;
  if (valor === "ventas_caida") return `En 30 días vende menos del ${pct(r.caida_ventas)} de los 30 anteriores`;
  return ACCIONES.find((a) => a.valor === valor)?.detalle ?? "";
}

export const DIAS_NUEVO = 30;
/**
 * Margen bruto mínimo sano para un proveedor en Dropi: 30 %. Del margen bruto todavía salen las devoluciones y los rechazos (10 %
 * de lo pedido en Panamá, jul–oct 2026), las cancelaciones y los costos fijos. Por debajo de 20 % es crítico (casi seguro se
 * pierde); lo saludable es 40 % o más.
 */
export const MARGEN_MINIMO = 0.3;
export const MARGEN_CRITICO = 0.2;
/** Las ventas cayeron si este mes es menos de la mitad del anterior (y el anterior vendió algo que contar). */
export const CAIDA = 0.5;
export const MIN_VENTAS_ANTES = 10;

const dias = (desde: string, hasta: string) => Math.round((Date.parse(hasta.slice(0, 10)) - Date.parse(desde.slice(0, 10))) / 86_400_000);

export function accionesPublicacion(
  p: {
    archivada: boolean;
    fechaPublicacion: string | null;
    primeraVenta: string | null;
    margen: number | null;
    netas30: number | null;
    netas30Antes: number | null;
    privatizadaA: string | null;
    competidorMasBarato: boolean;
  },
  hoy: string,
  reglas: Reglas = REGLAS_DEFECTO,
): Accion[] {
  if (p.archivada) return [];
  const out: Accion[] = [];
  const desde = p.fechaPublicacion ?? p.primeraVenta;
  const nuevo = !!desde && dias(desde, hoy) < reglas.dias_nuevo;
  // «Producto nuevo» ya no es una acción (no interesa como tarjeta), pero uno recién publicado todavía no se verifica.
  const margenBajo = p.margen !== null && p.margen < reglas.margen_minimo;
  const cayo = p.netas30 !== null && p.netas30Antes !== null && p.netas30Antes >= reglas.min_ventas_antes && p.netas30 < p.netas30Antes * reglas.caida_ventas;
  // Separadas (21 oct 2026): el margen bajo es un problema de precio o costo; la caída de ventas, de demanda o competencia.
  if (margenBajo) out.push("margen_bajo");
  if (cayo) out.push("ventas_caida");
  if (p.competidorMasBarato) out.push("bajar_precio");
  if (!nuevo && p.privatizadaA && p.netas30 !== null && p.netas30 <= 0) out.push("verificar_dropshipper");
  return out;
}

/** La bodega de Dropi (B280, «Bodega Dropi Panama»): lo que está ahí no se puede republicar, porque la publicación es de Dropi. */
export const BODEGA_DROPI = 280;

/**
 * Republicar (pedido de Alcides, 22 oct 2026): una publicación activa en Dropi que lleva `dias_republicar` (30) sin ninguna venta
 * se manda a republicar, solo si es de nuestra bodega (no de la B280 de Dropi) y ya lleva publicada al menos esos días. Sin
 * bodega conocida o sin datos de ventas de Dropi, no se sabe: no sale.
 */
export function necesitaRepublicar(
  p: { archivada: boolean; enDropi: EnDropi; bodegaId: number | null; hayVentas: boolean; ultimaVenta: string | null; publicadaDesde: string | null; privada?: boolean; stock?: number | null; netas30?: number | null },
  hoy: string,
  reglas: Pick<Reglas, "dias_republicar"> = REGLAS_DEFECTO,
): boolean {
  // Una privada no se republica (pedido de Alcides, 25 oct 2026): es de un solo dropshipper y republicarla le cambia el ID.
  // Sin stock no se republica (25 oct 2026, pedido de Alcides): no vende porque no hay qué vender, no porque esté vieja.
  if (p.stock != null && p.stock <= 0) return false;
  if (p.privada || p.archivada || p.enDropi !== "activo" || !p.hayVentas || p.bodegaId === null || p.bodegaId === BODEGA_DROPI) return false;
  const n = reglas.dias_republicar;
  // Con la regla en 30 días, cuentan las ventas netas (un pedido cancelado, rechazado o devuelto no es venta; 25 oct 2026, PUB-0132:
  // su único pedido en 30 días se canceló). Sin netas en 30 días, sale si lleva al menos esos días publicada.
  if (n === 30 && p.netas30 != null) {
    if (p.netas30 > 0) return false;
    // Y más de N días publicada (la fecha de publicación en Dropi; si no se sabe, la de su primera venta).
    return !!p.publicadaDesde && dias(p.publicadaDesde, hoy) > n;
  }
  // Vendió hace menos de N días: no.
  if (p.ultimaVenta && dias(p.ultimaVenta, hoy) < n) return false;
  // Nunca vendió: solo si ya lleva N días publicada (si no se sabe desde cuándo, no).
  if (!p.ultimaVenta && (!p.publicadaDesde || dias(p.publicadaDesde, hoy) < n)) return false;
  return true;
}
