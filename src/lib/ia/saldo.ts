// Consumo de IA: lo que se gastó, cuánto queda y cuándo avisar. Ninguna de las dos APIs dice cuánto crédito queda, así que el saldo se
// **estima**: lo último que la persona registró (un saldo, o recargas) menos lo gastado desde entonces, según el consumo anotado. Sin
// base ni React, con prueba.

import type { ProveedorConsumo } from "./precios";

export interface FilaConsumo {
  proveedor: ProveedorConsumo;
  operacion: string;
  modelo: string | null;
  tokensEntrada: number;
  tokensSalida: number;
  busquedas: number;
  imagenes: number;
  costoUsd: number;
  usuarioNombre: string | null;
  ok: boolean;
  /** Cuándo (ISO con zona). */
  creadoEn: string;
}

export interface Credito {
  proveedor: ProveedorConsumo;
  /** «saldo»: lo que quedaba ese día (reemplaza lo anterior); «recarga»: lo que se agregó. */
  tipo: "saldo" | "recarga";
  montoUsd: number;
  creadoEn: string;
}

/** Se redondea a 4 decimales: una foto de Gemini cuesta 0,034 y a centavos cada suma perdía lo que no llegaba al centavo. */
const r2 = (n: number) => Math.round(n * 10000) / 10000;
const t = (iso: string) => Date.parse(iso);

export interface SaldoEstimado {
  /** Hay un saldo o una recarga registrados: sin eso no se puede estimar. */
  registrado: boolean;
  /** Lo que se estima que queda (puede quedar en negativo si se gastó más de lo anotado). */
  saldoUsd: number | null;
  /** Lo gastado desde el último saldo o desde la primera recarga. */
  gastadoUsd: number;
  /** Desde cuándo se cuenta (ISO). */
  desde: string | null;
}

/**
 * El saldo estimado de un proveedor: el último «saldo» registrado más las recargas posteriores, menos el consumo posterior. Sin ningún
 * «saldo», las recargas suman desde la primera. Sin ninguno de los dos, no hay estimación.
 */
export function saldoEstimado(proveedor: ProveedorConsumo, creditos: Credito[], consumo: FilaConsumo[]): SaldoEstimado {
  const mios = creditos.filter((c) => c.proveedor === proveedor).sort((a, b) => t(a.creadoEn) - t(b.creadoEn));
  const ultimoSaldo = [...mios].reverse().find((c) => c.tipo === "saldo");
  let desde: string | null = null;
  let base = 0;
  if (ultimoSaldo) {
    desde = ultimoSaldo.creadoEn;
    base = ultimoSaldo.montoUsd + mios.filter((c) => c.tipo === "recarga" && t(c.creadoEn) > t(ultimoSaldo.creadoEn)).reduce((s, c) => s + c.montoUsd, 0);
  } else if (mios.length) {
    desde = mios[0].creadoEn;
    base = mios.filter((c) => c.tipo === "recarga").reduce((s, c) => s + c.montoUsd, 0);
  }
  if (!desde) return { registrado: false, saldoUsd: null, gastadoUsd: 0, desde: null };
  const gastado = consumo.filter((c) => c.proveedor === proveedor && t(c.creadoEn) > t(desde)).reduce((s, c) => s + c.costoUsd, 0);
  return { registrado: true, saldoUsd: r2(base - gastado), gastadoUsd: r2(gastado), desde };
}

export type EstadoSaldo = "sin_registro" | "ok" | "por_acabarse" | "agotado";

/** Cómo está el crédito: se avisa cuando lo estimado baja del umbral que fijó el equipo. */
export function estadoSaldo(saldo: SaldoEstimado, umbralUsd: number): EstadoSaldo {
  if (!saldo.registrado || saldo.saldoUsd === null) return "sin_registro";
  if (saldo.saldoUsd <= 0) return "agotado";
  return saldo.saldoUsd <= umbralUsd ? "por_acabarse" : "ok";
}

export interface ResumenProveedor {
  proveedor: ProveedorConsumo;
  costoUsd: number;
  llamadas: number;
  errores: number;
  tokens: number;
  imagenes: number;
}

const diaPanama = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/** Lo gastado de cada proveedor desde un día («2026-10-01») hasta hoy. */
export function resumirProveedor(proveedor: ProveedorConsumo, consumo: FilaConsumo[], desdeDia: string): ResumenProveedor {
  const filas = consumo.filter((c) => c.proveedor === proveedor && diaPanama(c.creadoEn) >= desdeDia);
  return {
    proveedor,
    costoUsd: r2(filas.reduce((s, c) => s + c.costoUsd, 0)),
    llamadas: filas.length,
    errores: filas.filter((c) => !c.ok).length,
    tokens: filas.reduce((s, c) => s + c.tokensEntrada + c.tokensSalida, 0),
    imagenes: filas.reduce((s, c) => s + c.imagenes, 0),
  };
}

export interface DiaConsumo {
  dia: string;
  porProveedor: Partial<Record<ProveedorConsumo, number>>;
  total: number;
}

const sumarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** El gasto de cada uno de los últimos `dias` días hasta `hoy` (los días sin uso, en cero). */
export function gastoPorDia(consumo: FilaConsumo[], hoy: string, dias: number): DiaConsumo[] {
  const out = new Map<string, DiaConsumo>();
  for (let i = dias - 1; i >= 0; i--) {
    const dia = sumarDias(hoy, -i);
    out.set(dia, { dia, porProveedor: {}, total: 0 });
  }
  for (const c of consumo) {
    const d = out.get(diaPanama(c.creadoEn));
    if (!d) continue;
    d.porProveedor[c.proveedor] = r2((d.porProveedor[c.proveedor] ?? 0) + c.costoUsd);
    d.total = r2(d.total + c.costoUsd);
  }
  return [...out.values()];
}

export interface Desglose {
  clave: string;
  costoUsd: number;
  usos: number;
}

/** Agrupa el gasto por una clave (la operación o la persona), de más a menos gasto. */
export function desglosar(consumo: FilaConsumo[], clave: (c: FilaConsumo) => string): Desglose[] {
  const m = new Map<string, Desglose>();
  for (const c of consumo) {
    const k = clave(c);
    const d = m.get(k) ?? { clave: k, costoUsd: 0, usos: 0 };
    d.costoUsd = r2(d.costoUsd + c.costoUsd);
    d.usos += 1;
    m.set(k, d);
  }
  return [...m.values()].sort((a, b) => b.costoUsd - a.costoUsd || b.usos - a.usos);
}

/** Cómo se llama cada operación en pantalla. */
export const ETIQUETA_OPERACION: Record<string, string> = {
  analisis: "Análisis",
  titulos: "Títulos",
  texto: "Descripción y ángulos",
  fotos_plan: "Plan de fotos",
  foto: "Foto de publicación",
  estilo_imagen: "Imágenes modelo",
  landing_imagen: "Imagen de landing",
};
export const etiquetaOperacion = (o: string) => ETIQUETA_OPERACION[o] ?? o;
