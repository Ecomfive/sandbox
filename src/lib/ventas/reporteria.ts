// Reportería de pedidos (17 nov 2026, pedido de Hernán; prototipo https://claude.ai/artifact/TNhc38acs7JZzNcsLSgUze): la Matriz de administración
// dentro del sistema. Lógica pura (sin Supabase): las columnas que se editan a mano, cómo se lee el estado, el resumen por estado y lo que pasa a
// Ventas por tienda. Prueba en `reporteria.test.ts`.

import type { EstadoEntrega } from "./matriz";

/** Una fila de la Reportería: una línea de producto de un pedido (como la Matriz). Las columnas del pedido se repiten en cada línea. */
export interface FilaReporteria {
  /** `ordenId:linea`. */
  id: string;
  ordenId: string;
  /** 1 = la principal; las demás son otro producto del mismo pedido (lo que en la Matriz dice «DUPLICADO»). */
  linea: number;
  tiendaId: string;
  tienda: string;
  fecha: string;
  numero: string;
  origen: string | null;
  estadoShopify: string | null;
  etiquetas: string | null;
  preparacion: string | null;
  notas: string | null;
  cliente: string | null;
  telefono: string | null;
  provincia: string | null;
  corregimiento: string | null;
  direccion: string | null;
  zona: string | null;
  producto: string | null;
  sku: string | null;
  cantidad: number | null;
  /** El total del pedido: solo en la línea principal (en las demás, null). */
  venta: number | null;
  estado: EstadoEntrega;
  estadoMatriz: string | null;
  verificado: string | null;
  courier: string | null;
  fechaEnvio: string | null;
  resultado: string | null;
  motivo: string | null;
  delivery: string | null;
  formaPago: string | null;
  mesCobro: string | null;
  pagadoDelivery: number | null;
  /** El costo de la hoja de Costos de producto (0992); si el producto no está en ella, el «COSTO PRODUCTO» de la Matriz; si no, el de Compras (`costoFuente` lo dice). */
  costo: number | null;
  costoFuente: "hoja" | "matriz" | "compras" | null;
  montoEnvio: number | null;
  montoEnvioSe: number | null;
  devueltosSe: string | null;
  fechaDevolucion: string | null;
  cambioMonto: number | null;
  cambioFormaPago: string | null;
  cambioEnvio: number | null;
  facturado: boolean;
  factura: string | null;
  bloque: string | null;
  /** Las columnas de este pedido que alguien editó a mano en el sistema. */
  editadas: string[];
}

/** Lo que se edita a mano en la Reportería: la columna de la fila, la de `ven_ordenes` y cómo se escribe. */
export interface CampoEditable {
  clave: keyof FilaReporteria;
  columna: string;
  etiqueta: string;
  tipo: "texto" | "monto" | "si_no";
  opciones?: string[];
  max?: number;
}

export const EDITABLES: CampoEditable[] = [
  { clave: "preparacion", columna: "preparacion", etiqueta: "Preparación", tipo: "texto", opciones: ["PREPARADO", "EN PREPARACIÓN", "FALTA PRODUCTO"], max: 80 },
  { clave: "verificado", columna: "verificado", etiqueta: "Verificado", tipo: "texto", opciones: ["OK", "NO GESTIONADO", "CANCELADO", "ENVIO PRIORITARIO", "ENTREGADO"], max: 60 },
  { clave: "motivo", columna: "motivo_cancelacion", etiqueta: "Motivo de cancelación", tipo: "texto", opciones: ["RECHAZADO", "CANCELADO", "NO GESTIONADO", "NO CONTESTA", "DIRECCIÓN ERRADA"], max: 200 },
  { clave: "delivery", columna: "delivery", etiqueta: "Delivery", tipo: "texto", max: 80 },
  { clave: "formaPago", columna: "forma_pago_texto", etiqueta: "Forma de pago", tipo: "texto", opciones: ["EFECTIVO", "YAPPY", "TRANSFERENCIA", "STRIPE", "CANCELADO", "NO GESTIONADO"], max: 80 },
  { clave: "mesCobro", columna: "mes_gestion", etiqueta: "Mes de cobro", tipo: "texto", opciones: ["ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"], max: 60 },
  { clave: "pagadoDelivery", columna: "monto_pagado_delivery", etiqueta: "Monto pagado al delivery", tipo: "monto" },
  { clave: "montoEnvio", columna: "monto_envio", etiqueta: "Monto envío", tipo: "monto" },
  { clave: "montoEnvioSe", columna: "monto_envio_se", etiqueta: "Monto envío SE", tipo: "monto" },
  { clave: "fechaDevolucion", columna: "fecha_devolucion_texto", etiqueta: "Fecha devolución / cambio", tipo: "texto", max: 80 },
  { clave: "cambioMonto", columna: "cambio_monto", etiqueta: "Monto de cambio", tipo: "monto" },
  { clave: "cambioFormaPago", columna: "cambio_forma_pago", etiqueta: "Forma de pago del cambio", tipo: "texto", opciones: ["EFECTIVO", "YAPPY", "TRANSFERENCIA"], max: 60 },
  { clave: "cambioEnvio", columna: "cambio_envio", etiqueta: "Envío de cambio", tipo: "monto" },
  { clave: "facturado", columna: "facturado", etiqueta: "Facturado con ITBMS", tipo: "si_no" },
  { clave: "factura", columna: "factura_numero", etiqueta: "N° factura", tipo: "texto", max: 40 },
  { clave: "bloque", columna: "bloque_facturado", etiqueta: "Bloque facturado", tipo: "texto", max: 60 },
];

export const editablePorColumna = (columna: string) => EDITABLES.find((e) => e.columna === columna) ?? null;

/** Revisa un valor escrito a mano: el texto limpio (o null para vaciar), el monto con dos decimales o sí/no. */
export function valorEditado(campo: CampoEditable, valor: unknown): { ok: true; valor: string | number | boolean | null } | { ok: false; error: string } {
  if (campo.tipo === "si_no") return valor === true || valor === false ? { ok: true, valor } : { ok: false, error: "Valor no válido." };
  const t = typeof valor === "number" ? String(valor) : typeof valor === "string" ? valor.trim() : valor === null ? "" : null;
  if (t === null) return { ok: false, error: "Valor no válido." };
  if (t === "") return { ok: true, valor: null };
  if (campo.tipo === "monto") {
    const n = Number(t.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0 || n > 100_000) return { ok: false, error: "Escribe un monto entre 0 y 100,000." };
    return { ok: true, valor: Math.round(n * 100) / 100 };
  }
  return { ok: true, valor: t.replace(/\s+/g, " ").slice(0, campo.max ?? 120) };
}

/** Cómo se dice el estado del sistema en la Reportería (como la columna «ENTREGADO / ANULADO / DEVOLUCIÓN»). */
export const ESTADO_REPORTERIA: Record<EstadoEntrega, string> = {
  entregada: "Entregado",
  devuelta: "Devolución",
  cancelada: "Anulado",
  en_transito: "En camino",
  pendiente: "Por gestionar",
  no_gestionada: "No gestionado",
};

/**
 * Si el estado del sistema y el que anotó la Matriz dicen cosas distintas (para que administración lo revise). «Anulado» en la Matriz vale tanto
 * para lo cancelado como para lo que nunca se gestionó (no salió): eso no es una diferencia.
 */
export function difiereDeMatriz(estado: EstadoEntrega, estadoMatriz: string | null): boolean {
  const m = (estadoMatriz ?? "").trim().toUpperCase();
  if (!m) return false;
  if (m.startsWith("ENTREG")) return estado !== "entregada";
  if (m.startsWith("DEVOL")) return estado !== "devuelta";
  if (m.startsWith("ANUL") || m.startsWith("CANCEL")) return estado !== "cancelada" && estado !== "no_gestionada";
  return false;
}

export interface ResumenReporteria {
  pedidos: number;
  entregados: number;
  devoluciones: number;
  anulados: number;
  sinEstado: number;
  porVerificar: number;
  sinMesCobro: number;
  sinFacturar: number;
  difieren: number;
}

/** Los conteos de arriba, por pedido (no por línea). */
export function resumirReporteria(filas: FilaReporteria[]): ResumenReporteria {
  const r: ResumenReporteria = { pedidos: 0, entregados: 0, devoluciones: 0, anulados: 0, sinEstado: 0, porVerificar: 0, sinMesCobro: 0, sinFacturar: 0, difieren: 0 };
  const vistos = new Set<string>();
  for (const f of filas) {
    if (vistos.has(f.ordenId)) continue;
    vistos.add(f.ordenId);
    r.pedidos++;
    if (f.estado === "entregada") {
      r.entregados++;
      if ((f.verificado ?? "").trim().toUpperCase() !== "OK") r.porVerificar++;
      if (!f.mesCobro) r.sinMesCobro++;
      if (!f.facturado) r.sinFacturar++;
    } else if (f.estado === "devuelta") r.devoluciones++;
    else if (f.estado === "cancelada") r.anulados++;
    else r.sinEstado++;
    if (difiereDeMatriz(f.estado, f.estadoMatriz)) r.difieren++;
  }
  return r;
}

/** Los filtros rápidos de las tarjetas de arriba (por pedido). */
export const FILTROS_RAPIDOS: Record<string, (f: FilaReporteria) => boolean> = {
  entregados: (f) => f.estado === "entregada",
  devoluciones: (f) => f.estado === "devuelta",
  anulados: (f) => f.estado === "cancelada",
  sinEstado: (f) => !["entregada", "devuelta", "cancelada"].includes(f.estado),
  porVerificar: (f) => f.estado === "entregada" && (f.verificado ?? "").trim().toUpperCase() !== "OK",
  sinMesCobro: (f) => f.estado === "entregada" && !f.mesCobro,
  sinFacturar: (f) => f.estado === "entregada" && !f.facturado,
  difieren: (f) => difiereDeMatriz(f.estado, f.estadoMatriz),
};

export interface FilaFinanzas {
  tiendaId: string;
  tienda: string;
  pedidos: number;
  entregados: number;
  ventas: number;
  costo: number;
  envio: number;
  margen: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Lo que pasa a Ventas por tienda (Finanzas), por tienda: pedidos, entregados, ventas y costo de lo entregado, envío de todos los que salieron y el
 * margen. Es la misma regla de `ven_resumen_mensual` (costo solo de lo entregado; el envío se paga aunque vuelva).
 */
export function resumirParaFinanzas(filas: FilaReporteria[]): FilaFinanzas[] {
  const por = new Map<string, FilaFinanzas & { _ordenes: Set<string>; _entregadas: Set<string> }>();
  for (const f of filas) {
    const x = por.get(f.tiendaId) ?? { tiendaId: f.tiendaId, tienda: f.tienda, pedidos: 0, entregados: 0, ventas: 0, costo: 0, envio: 0, margen: 0, _ordenes: new Set(), _entregadas: new Set() };
    if (!x._ordenes.has(f.ordenId)) {
      x._ordenes.add(f.ordenId);
      x.envio += (f.montoEnvio ?? 0) + (f.montoEnvioSe ?? 0);
    }
    if (f.estado === "entregada") {
      x._entregadas.add(f.ordenId);
      x.ventas += f.venta ?? 0;
      x.costo += f.costo ?? 0;
    }
    por.set(f.tiendaId, x);
  }
  return [...por.values()]
    .map(({ _ordenes, _entregadas, ...x }) => ({ ...x, pedidos: _ordenes.size, entregados: _entregadas.size, ventas: r2(x.ventas), costo: r2(x.costo), envio: r2(x.envio), margen: r2(x.ventas - x.costo - x.envio) }))
    .sort((a, b) => b.pedidos - a.pedidos);
}

/**
 * Las filas en forma compacta para mandarlas al navegador (17 nov 2026): los nombres de los campos una sola vez y después solo los valores. Un mes de
 * todas las tiendas pasaba de 10 MB con los nombres repetidos en cada fila.
 */
export interface FilasCompactas {
  campos: (keyof FilaReporteria)[];
  valores: unknown[][];
}

export function compactarFilas(filas: FilaReporteria[]): FilasCompactas {
  const campos = (filas[0] ? Object.keys(filas[0]) : []) as (keyof FilaReporteria)[];
  return { campos, valores: filas.map((f) => campos.map((c) => f[c])) };
}

export function expandirFilas({ campos, valores }: FilasCompactas): FilaReporteria[] {
  return valores.map((v) => Object.fromEntries(campos.map((c, i) => [c, v[i]])) as unknown as FilaReporteria);
}
