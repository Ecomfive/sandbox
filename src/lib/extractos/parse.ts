import * as XLSX from "xlsx";

export type FilaCruda = string[];

export interface ExtractoParseado {
  headers: string[];
  filas: FilaCruda[];
}

/** Lee un CSV o XLSX (primera hoja) y separa encabezado de filas de datos. */
export function parseExtracto(buffer: ArrayBuffer): ExtractoParseado {
  const workbook = XLSX.read(buffer, { type: "array" });
  const hoja = workbook.Sheets[workbook.SheetNames[0]];
  const filas = XLSX.utils.sheet_to_json<FilaCruda>(hoja, {
    header: 1,
    raw: false,
    defval: "",
  });
  const [headers, ...resto] = filas;
  return {
    headers: (headers ?? []).map(String),
    filas: resto.filter((fila) => fila.some((celda) => celda !== "")),
  };
}

export interface MapeoColumnas {
  fecha: number;
  monto: number;
  descripcion?: number;
  /** Índice de columna con el tipo (depósito/retiro). Si se omite, se infiere del signo del monto. */
  tipo?: number;
}

export interface MovimientoBancarioParseado {
  fecha: string; // ISO yyyy-mm-dd
  monto: number;
  descripcion: string | null;
  tipo: "deposito" | "retiro";
}

export function mapearMovimientos(
  filas: FilaCruda[],
  mapeo: MapeoColumnas
): MovimientoBancarioParseado[] {
  return filas
    .filter((fila) => fila[mapeo.fecha] && fila[mapeo.monto])
    .map((fila) => {
      const montoConSigno = parseMonto(fila[mapeo.monto]);
      const tipo =
        mapeo.tipo !== undefined && fila[mapeo.tipo]
          ? normalizarTipo(fila[mapeo.tipo])
          : montoConSigno < 0
            ? "retiro"
            : "deposito";
      return {
        fecha: parseFecha(fila[mapeo.fecha]),
        monto: Math.abs(montoConSigno),
        descripcion:
          mapeo.descripcion !== undefined ? (fila[mapeo.descripcion] ?? null) : null,
        tipo,
      };
    });
}

/** Soporta "1,234.56" y "1.234,56" detectando cuál separador aparece último. */
function parseMonto(valor: string): number {
  let limpio = valor.replace(/[^0-9.,-]/g, "");
  const ultimaComa = limpio.lastIndexOf(",");
  const ultimoPunto = limpio.lastIndexOf(".");
  if (ultimaComa > ultimoPunto) {
    limpio = limpio.replace(/\./g, "").replace(",", ".");
  } else {
    limpio = limpio.replace(/,/g, "");
  }
  return Number(limpio) || 0;
}

function normalizarTipo(valor: string): "deposito" | "retiro" {
  const v = valor.trim().toLowerCase();
  if (v.startsWith("dep") || v.startsWith("cred") || v.startsWith("abono")) {
    return "deposito";
  }
  return "retiro";
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
