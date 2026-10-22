// Gestión de IDs Dropi sin estados manuales (pedido de Alcides, 21 oct 2026): «En Dropi» y el Tipo salen de lo que reporta Dropi
// (la carga de Ventas Dropi), y en lugar del flujo de trabajo (Producto nuevo, Revisar precio, Verificar con dropshipper, Validar
// bajar precio, Al día) el sistema calcula qué atención necesita cada publicación. Sin base ni React, con prueba.

/** Cómo está en Dropi: activo o archivado según Dropi; no aparece (tiene ID pero Dropi no lo reporta: en espera de
 * aprobación si es nuevo, o eliminado); sin ID; o sin datos (el país no tiene ventas de Dropi cargadas). */
export type EnDropi = "activo" | "archivado" | "no_aparece" | "sin_id" | "sin_datos";

export const EN_DROPI: { valor: EnDropi; etiqueta: string; color: string }[] = [
  { valor: "activo", etiqueta: "Activo en Dropi", color: "#30a46c" },
  { valor: "archivado", etiqueta: "Archivado en Dropi", color: "#8d8d8d" },
  { valor: "no_aparece", etiqueta: "No aparece en Dropi", color: "#f76808" },
  { valor: "sin_id", etiqueta: "Sin ID de Dropi", color: "#e5484d" },
  { valor: "sin_datos", etiqueta: "Sin datos de Dropi", color: "#b4b4b4" },
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
export type Accion = "revisar_precio" | "bajar_precio" | "verificar_dropshipper";

export const ACCIONES: { valor: Accion | "al_dia"; etiqueta: string; color: string; detalle: string }[] = [
  { valor: "revisar_precio", etiqueta: "Revisar precio y venta", color: "#d9a200", detalle: "Margen bruto bajo o ventas a menos de la mitad que el mes anterior" },
  { valor: "bajar_precio", etiqueta: "Competidor más barato", color: "#f76808", detalle: "Alguien vende lo mismo más barato y tiene stock" },
  { valor: "verificar_dropshipper", etiqueta: "Verificar con dropshipper", color: "#e5484d", detalle: "Privatizado a un dropshipper y sin ventas en 30 días" },
  { valor: "al_dia", etiqueta: "Al día", color: "#30a46c", detalle: "Nada que revisar" },
];

export const DIAS_NUEVO = 30;
export const MARGEN_MINIMO = 0.3;
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
): Accion[] {
  if (p.archivada) return [];
  const out: Accion[] = [];
  const desde = p.fechaPublicacion ?? p.primeraVenta;
  const nuevo = !!desde && dias(desde, hoy) < DIAS_NUEVO;
  // «Producto nuevo» ya no es una acción (no interesa como tarjeta), pero uno recién publicado todavía no se verifica.
  const margenBajo = p.margen !== null && p.margen < MARGEN_MINIMO;
  const cayo = p.netas30 !== null && p.netas30Antes !== null && p.netas30Antes >= MIN_VENTAS_ANTES && p.netas30 < p.netas30Antes * CAIDA;
  if (margenBajo || cayo) out.push("revisar_precio");
  if (p.competidorMasBarato) out.push("bajar_precio");
  if (!nuevo && p.privatizadaA && p.netas30 !== null && p.netas30 <= 0) out.push("verificar_dropshipper");
  return out;
}
