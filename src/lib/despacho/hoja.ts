// Envíos Delivery › Hoja del día (16 nov 2026, pedido de Hernán): los pedidos que Despacho cargó para un día, por repartidor, con las columnas que
// muestra Monday en el tablero de cada repartidor y nada más, para verla, imprimirla o bajarla en Excel (respaldo si se cae la conexión).

import { ETIQUETAS, sumasGrupo } from "./etiquetas";

/** Las columnas de la hoja, en el orden del tablero de cada repartidor en Monday. */
export const COLUMNAS_HOJA = [
  "Pedido",
  "Tienda",
  "Últ. actualización",
  "Delivery",
  "Estado",
  "Edo. pago",
  "Forma de pago",
  "$ Por cobrar",
  "$ Cobrado",
  "Comprobante",
  "Comentario",
  "Coste envío",
  "Cambio / retiro / turno",
] as const;

export interface FilaHoja {
  itemId: string;
  numero: string | null;
  tienda: string | null;
  courier: string | null;
  estado: string | null;
  edoPago: string | null;
  formaPago: string | null;
  porCobrar: number | null;
  cobrado: number | null;
  comprobantes: number;
  comentario: string | null;
  costeEnvio: number | null;
  turno: string | null;
  posicion: number;
  actualizado: string | null;
}

export const SIN_REPARTIDOR = "Sin repartidor";

/** Los pedidos del día por repartidor, en el orden de la lista de Monday (los demás después, y al final los que no tienen), con sus sumas. */
export function gruposHoja<T extends FilaHoja>(filas: T[]) {
  const orden = ETIQUETAS.courier.opciones.map((o) => o.nombre);
  const nombres = [...new Set(filas.map((f) => f.courier ?? SIN_REPARTIDOR))].sort((a, b) => {
    const ia = a === SIN_REPARTIDOR ? 1e6 : orden.indexOf(a) === -1 ? 1e3 : orden.indexOf(a);
    const ib = b === SIN_REPARTIDOR ? 1e6 : orden.indexOf(b) === -1 ? 1e3 : orden.indexOf(b);
    return ia - ib || a.localeCompare(b);
  });
  return nombres.map((nombre) => {
    const lista = filas
      .filter((f) => (f.courier ?? SIN_REPARTIDOR) === nombre)
      .sort((a, b) => a.posicion - b.posicion || (a.numero ?? "").localeCompare(b.numero ?? "", "es", { numeric: true }));
    return { nombre, filas: lista, sumas: sumasGrupo(lista) };
  });
}

/** Un día AAAA-MM-DD como «martes 17/11/2026». */
export function diaLargo(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const semana = d.toLocaleDateString("es-PA", { weekday: "long", timeZone: "UTC" });
  return `${semana} ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/** La fila de la hoja para el Excel, en el orden de `COLUMNAS_HOJA` (la hora de la última actualización, en Panamá). */
export function filaExcel(f: FilaHoja): (string | number | null)[] {
  const hora = f.actualizado ? new Date(f.actualizado).toLocaleString("es-PA", { timeZone: "America/Panama", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : null;
  return [f.numero, f.tienda, hora, f.courier, f.estado, f.edoPago, f.formaPago, f.porCobrar, f.cobrado, f.comprobantes ? `Sí (${f.comprobantes})` : null, f.comentario, f.costeEnvio, f.turno];
}
