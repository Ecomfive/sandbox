import type { FilaCruda } from "@/lib/extractos/parse";

export interface MapeoColumnasInventario {
  sku: number;
  cantidad: number;
  tipo?: number; // si se omite, se usa `tipoFijo`
  nombre?: number;
  fecha?: number; // si se omite, se usa la fecha de carga
  referencia?: number;
}

export interface MovimientoInventarioParseado {
  sku: string;
  nombre: string | null;
  cantidad: number;
  tipo: "entrada" | "salida";
  fecha: string | null; // ISO yyyy-mm-dd, null = usar fecha de carga
  referencia: string | null;
}

export function mapearMovimientosInventario(
  filas: FilaCruda[],
  mapeo: MapeoColumnasInventario,
  tipoFijo?: "entrada" | "salida"
): MovimientoInventarioParseado[] {
  return filas
    .filter((fila) => fila[mapeo.sku] && fila[mapeo.cantidad])
    .map((fila) => {
      const tipo =
        mapeo.tipo !== undefined && fila[mapeo.tipo]
          ? normalizarTipo(fila[mapeo.tipo])
          : (tipoFijo ?? "salida");
      return {
        sku: fila[mapeo.sku].trim(),
        nombre: mapeo.nombre !== undefined ? (fila[mapeo.nombre] ?? null) : null,
        cantidad: Math.abs(Number(fila[mapeo.cantidad].replace(/[^0-9.-]/g, "")) || 0),
        tipo,
        fecha:
          mapeo.fecha !== undefined && fila[mapeo.fecha] ? parseFecha(fila[mapeo.fecha]) : null,
        referencia: mapeo.referencia !== undefined ? (fila[mapeo.referencia] ?? null) : null,
      };
    })
    .filter((m) => m.cantidad > 0);
}

function normalizarTipo(valor: string): "entrada" | "salida" {
  const v = valor.trim().toLowerCase();
  if (v.startsWith("ent") || v.startsWith("in") || v.startsWith("devol")) return "entrada";
  return "salida";
}

function parseFecha(valor: string): string {
  const match = valor.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const [, d, m, y] = match;
    const year = y.length === 2 ? `20${y}` : y;
    return `${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const fecha = new Date(valor);
  if (!Number.isNaN(fecha.getTime())) {
    return fecha.toISOString().slice(0, 10);
  }
  throw new Error(`Fecha no reconocida: "${valor}"`);
}
