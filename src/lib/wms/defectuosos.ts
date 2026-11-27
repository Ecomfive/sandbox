// Inventario › Defectuosos (27 nov 2026, pedido de Hernán): la lista de lo que está dañado en cada bodega, con el día en que se marcó, y el traslado de esas unidades a otra bodega (lo hace
// la persona a cargo del inventario, Dinora). Lógica pura, con prueba.

/** Un movimiento del libro que tocó la cubeta «dañado» (positivo = entró a dañado). */
export interface MovimientoDanado {
  skuId: string;
  bodegaId: string;
  danado: number;
  creadoEn: string;
  motivo: string | null;
  referencia: string | null;
  usuarioId: string | null;
}

/** Lo último que llevó unidades a dañado en un producto y una bodega: cuándo, por qué y quién. */
export interface MarcaDanado {
  fecha: string;
  motivo: string | null;
  referencia: string | null;
  usuarioId: string | null;
  /** La primera vez que entró algo a dañado en esa bodega (de lo que se ve en el libro). */
  primera: string;
}

export const claveDanado = (skuId: string, bodegaId: string) => `${skuId}|${bodegaId}`;

/** De cada producto y bodega, la última vez (y la primera) que entraron unidades a dañado. */
export function marcasDeDanado(movimientos: readonly MovimientoDanado[]): Map<string, MarcaDanado> {
  const salida = new Map<string, MarcaDanado>();
  for (const m of movimientos) {
    if (!(m.danado > 0)) continue;
    const k = claveDanado(m.skuId, m.bodegaId);
    const prev = salida.get(k);
    if (!prev) {
      salida.set(k, { fecha: m.creadoEn, motivo: m.motivo, referencia: m.referencia, usuarioId: m.usuarioId, primera: m.creadoEn });
      continue;
    }
    if (m.creadoEn > prev.fecha) salida.set(k, { ...prev, fecha: m.creadoEn, motivo: m.motivo, referencia: m.referencia, usuarioId: m.usuarioId });
    if (m.creadoEn < prev.primera) salida.set(k, { ...salida.get(k)!, primera: m.creadoEn });
  }
  return salida;
}

/** Días enteros entre una fecha y hoy (AAAA-MM-DD, hora de Panamá). */
export function diasDesde(fechaIso: string, hoy: string): number {
  const d = new Date(fechaIso).toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  return Math.max(0, Math.round((Date.parse(`${hoy}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000));
}

export const MAX_MOTIVO_TRASLADO = 300;

/** Revisa un traslado de unidades dañadas: otra bodega, una cantidad entera de 1 hasta lo dañado, y un motivo corto (opcional). */
export function revisarTrasladoDanado(d: { desde: string; hacia: unknown; cantidad: unknown; danado: number; motivo?: unknown }): { hacia: string; cantidad: number; motivo: string | null } | { error: string } {
  const hacia = typeof d.hacia === "string" ? d.hacia : "";
  if (!hacia) return { error: "Elige a qué bodega van." };
  if (hacia === d.desde) return { error: "Elige otra bodega: es la misma de donde salen." };
  const n = typeof d.cantidad === "number" ? d.cantidad : typeof d.cantidad === "string" && d.cantidad.trim() ? Number(d.cantidad) : NaN;
  if (!Number.isInteger(n) || n <= 0) return { error: "Escribe cuántas unidades van (un número entero)." };
  if (n > d.danado) return { error: `En esa bodega solo hay ${d.danado.toLocaleString("es-PA")} ${d.danado === 1 ? "unidad dañada" : "unidades dañadas"}.` };
  const motivo = typeof d.motivo === "string" ? d.motivo.replace(/\s+/g, " ").trim().slice(0, MAX_MOTIVO_TRASLADO) : "";
  return { hacia, cantidad: n, motivo: motivo || null };
}
