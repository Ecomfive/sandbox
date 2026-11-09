// Bienes de uso y su depreciación (hoja «Bienes de Uso» de GASTOS_PANAMA_<año>.xlsx). Lógica pura, sin dependencias:
// la usan la página, la importación en el navegador y el script `scripts/finanzas/importar-bienes-uso.ts`.
//
// Regla (comprobada contra la grilla «Depreciación mensual» del Excel): depreciación lineal, cuota = (importe − valor
// residual) / meses de vida; el mes de alta ya deprecia y se deprecia durante `meses_vida` meses seguidos. La baja corta
// la depreciación: el mes de la baja ya no deprecia. La misma regla está en SQL (vista `fin_bienes_uso_cuotas`).
// Prueba en `bienes-uso.test.ts`.

import { huella, leerFecha, leerMonto, type Celda } from "./libro-excel";

/** La «Tabla de Vidas Útiles» del Excel (meses). Mejoras: según el contrato de arriendo; por defecto como un inmueble. */
export const VIDA_UTIL: Record<TipoBien, number> = {
  Inmuebles: 540,
  "Muebles y Utiles": 60,
  Instalaciones: 60,
  "Equipos Computación": 60,
  Rodados: 60,
  Mejoras: 540,
};
export const TIPOS_BIEN = ["Muebles y Utiles", "Equipos Computación", "Instalaciones", "Rodados", "Inmuebles", "Mejoras"] as const;
export type TipoBien = (typeof TIPOS_BIEN)[number];

export interface Bien {
  fecha_alta: string;
  importe: number;
  meses_vida: number;
  valor_residual: number;
  fecha_baja: string | null;
}

/** «2026-10-18» → «2026-10-01». */
export const mesDe = (fecha: string): string => `${fecha.slice(0, 7)}-01`;

/** Meses entre dos períodos (AAAA-MM-01): `b` − `a`. */
export function mesesEntre(a: string, b: string): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)));
}

/** El período `n` meses después de `p`. */
export function sumarMeses(p: string, n: number): string {
  const total = Number(p.slice(0, 4)) * 12 + Number(p.slice(5, 7)) - 1 + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}-01`;
}

export const cuotaMensual = (b: Bien): number => (b.importe - b.valor_residual) / b.meses_vida;

/** El último mes que deprecia (vida útil cumplida o el mes anterior a la baja), o null si no llega a depreciar. */
export function ultimoMes(b: Bien): string | null {
  const inicio = mesDe(b.fecha_alta);
  let fin = sumarMeses(inicio, b.meses_vida - 1);
  if (b.fecha_baja) {
    const antesDeBaja = sumarMeses(mesDe(b.fecha_baja), -1);
    if (antesDeBaja < fin) fin = antesDeBaja;
  }
  return fin < inicio ? null : fin;
}

/** La depreciación del bien en un mes (AAAA-MM-01). */
export function depreciacionDelMes(b: Bien, periodo: string): number {
  const fin = ultimoMes(b);
  if (!fin || periodo < mesDe(b.fecha_alta) || periodo > fin) return 0;
  return cuotaMensual(b);
}

/** Cuántos meses depreció hasta `periodo` inclusive. */
export function mesesDepreciados(b: Bien, periodo: string): number {
  const fin = ultimoMes(b);
  if (!fin || periodo < mesDe(b.fecha_alta)) return 0;
  const hasta = periodo < fin ? periodo : fin;
  return mesesEntre(mesDe(b.fecha_alta), hasta) + 1;
}

export interface Situacion {
  cuota: number;
  acumulada: number;
  neto: number;
  mesesRestantes: number;
  /** Cargo de depreciación de `periodo`. */
  delMes: number;
  estado: "En uso" | "Depreciado" | "De baja";
}

/** La situación del bien al cierre de `periodo`: depreciación acumulada, valor neto en libros y meses que le quedan. */
export function situacion(b: Bien, periodo: string): Situacion {
  const cuota = cuotaMensual(b);
  const meses = mesesDepreciados(b, periodo);
  const acumulada = cuota * meses;
  const deBaja = b.fecha_baja !== null && mesDe(b.fecha_baja) <= periodo;
  const vidaCumplida = meses >= b.meses_vida;
  const fin = ultimoMes(b);
  const mesesRestantes = deBaja || !fin ? 0 : periodo < mesDe(b.fecha_alta) ? b.meses_vida : Math.max(0, mesesEntre(periodo, fin));
  return {
    cuota,
    acumulada,
    // Dado de baja, ya no está en el balance.
    neto: deBaja ? 0 : b.importe - acumulada,
    mesesRestantes,
    delMes: depreciacionDelMes(b, periodo),
    estado: deBaja ? "De baja" : vidaCumplida ? "Depreciado" : "En uso",
  };
}

/** La depreciación total de cada mes entre `desde` y `hasta` (inclusive), como la fila de totales de la grilla. */
export function depreciacionPorMes(bienes: Bien[], desde: string, hasta: string): Map<string, number> {
  const salida = new Map<string, number>();
  for (let p = desde; p <= hasta; p = sumarMeses(p, 1)) salida.set(p, bienes.reduce((a, b) => a + depreciacionDelMes(b, p), 0));
  return salida;
}

// ---------------------------------------------------------------------------------------------
// Lectura de la hoja del Excel
// ---------------------------------------------------------------------------------------------

export interface BienExcel {
  fila: number;
  descripcion: string;
  tipo: TipoBien;
  fecha_alta: string;
  importe: number;
  meses_vida: number;
  notas: string | null;
  /** Un importe que parece mal escrito (p. ej. «1,169» guardado como 1,169 dólares en vez de 1.169). */
  sospechoso: boolean;
  origen_clave: string;
  /** La grilla del Excel para este bien (mes → depreciación), solo para comprobar el cálculo. */
  grilla: Record<string, number>;
}

const texto = (v: Celda): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
};
const normal = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

/** El tipo del catálogo que corresponde a lo escrito («Equipos computacion» → «Equipos Computación»). */
export function tipoDeBien(v: string | null): TipoBien | null {
  if (!v) return null;
  return TIPOS_BIEN.find((t) => normal(t) === normal(v)) ?? null;
}

/** Un importe con 3 decimales y menor a 10: casi siempre es «1,169» (mil ciento sesenta y nueve) leído como decimal. */
export const importeSospechoso = (n: number): boolean => n < 10 && Math.round(n * 1000) % 10 !== 0;

/**
 * Lee la hoja «Bienes de Uso»: busca la fila de títulos (Mes de Alta, Importe, Tipo de Bien) y lee un bien por fila
 * hasta la primera sin descripción ni importe. Los meses de vida salen de la columna «Meses a Amortizar» o, si falta,
 * de la tabla de vidas útiles. Las columnas con fecha a la derecha («Depreciación mensual») se guardan como la grilla
 * del bien, para comprobar el cálculo.
 */
export function leerBienesExcel(filas: Celda[][], origen: string): { bienes: BienExcel[]; descartadas: { fila: number; motivo: string }[] } {
  const iTitulos = filas.findIndex((f) => {
    const n = f.map((c) => normal(texto(c) ?? ""));
    return n.includes("MES DE ALTA") && n.includes("IMPORTE") && n.includes("TIPO DE BIEN");
  });
  if (iTitulos < 0) throw new Error("No encontré la fila de títulos (Mes de Alta, Importe, Tipo de Bien) en la hoja.");
  const t = filas[iTitulos].map((c) => normal(texto(c) ?? ""));
  const col = (nombre: string) => t.findIndex((x) => x === nombre || x.startsWith(nombre));
  const cAlta = col("MES DE ALTA");
  const cImporte = col("IMPORTE");
  const cTipo = col("TIPO DE BIEN");
  const cMeses = col("MESES A AMORTIZAR");
  const cDesc = col("ALTAS BIENES DE USO") >= 0 ? col("ALTAS BIENES DE USO") : cImporte - 1;
  // Columnas de la grilla: fechas en la fila de títulos, a la derecha de «Dep. mensual», hasta el primer hueco.
  const grillaCols: { col: number; mes: string }[] = [];
  for (let k = cImporte + 1; k < filas[iTitulos].length; k++) {
    const v = filas[iTitulos][k];
    const f = v instanceof Date || typeof v === "number" ? leerFecha(v) : null;
    if (f) grillaCols.push({ col: k, mes: mesDe(f) });
    else if (grillaCols.length) break;
  }

  const bienes: BienExcel[] = [];
  const descartadas: { fila: number; motivo: string }[] = [];
  const vistas = new Map<string, number>();
  for (let i = iTitulos + 1; i < filas.length; i++) {
    const f = filas[i];
    const descripcion = texto(f[cDesc]);
    const importe = leerMonto(f[cImporte]);
    if (!descripcion && importe === null) {
      // La tabla termina en la primera fila vacía después de algún bien (abajo vienen las aclaraciones).
      if (bienes.length && !texto(f[cAlta])) break;
      continue;
    }
    const numero = i + 1;
    const fecha = leerFecha(f[cAlta]);
    const tipo = tipoDeBien(texto(f[cTipo]));
    if (!descripcion) {
      descartadas.push({ fila: numero, motivo: "sin descripción" });
      continue;
    }
    if (!fecha) {
      descartadas.push({ fila: numero, motivo: "sin fecha de alta" });
      continue;
    }
    if (importe === null || importe <= 0) {
      descartadas.push({ fila: numero, motivo: "sin importe" });
      continue;
    }
    if (!tipo) {
      descartadas.push({ fila: numero, motivo: "tipo de bien desconocido" });
      continue;
    }
    const meses = cMeses >= 0 ? leerMonto(f[cMeses]) : null;
    const meses_vida = meses && meses > 0 && meses <= 600 ? Math.round(meses) : VIDA_UTIL[tipo];
    const marca = texto(f[0]);
    const contenido = [origen, fecha, descripcion, importe.toFixed(4), tipo].join("|");
    const ordinal = (vistas.get(contenido) ?? 0) + 1;
    vistas.set(contenido, ordinal);
    const grilla: Record<string, number> = {};
    for (const g of grillaCols) {
      const v = leerMonto(f[g.col]);
      if (v) grilla[g.mes] = v;
    }
    bienes.push({
      fila: numero,
      descripcion: descripcion.slice(0, 300),
      tipo,
      fecha_alta: fecha,
      importe,
      meses_vida,
      notas: marca === "(*)" ? "Marcado (*) en el Excel: adquirido por CL a nombre de PAN" : null,
      sospechoso: importeSospechoso(importe),
      origen_clave: `${huella(contenido)}#${ordinal}`,
      grilla,
    });
  }
  return { bienes, descartadas };
}

/** Compara el cálculo con la grilla del Excel en los meses que la grilla cubre. Devuelve las celdas que no coinciden. */
export function compararConGrilla(
  bienes: BienExcel[],
  meses: string[],
  tolerancia = 0.005,
): { celdas: number; distintas: { fila: number; mes: string; excel: number; portal: number }[] } {
  const distintas: { fila: number; mes: string; excel: number; portal: number }[] = [];
  let celdas = 0;
  for (const b of bienes) {
    const bien: Bien = { ...b, valor_residual: 0, fecha_baja: null };
    for (const mes of meses) {
      const excel = b.grilla[mes] ?? 0;
      const portal = depreciacionDelMes(bien, mes);
      celdas++;
      if (Math.abs(excel - portal) > tolerancia) distintas.push({ fila: b.fila, mes, excel, portal });
    }
  }
  return { celdas, distintas };
}

/** Revisa un bien que llega del navegador (importación): no se confía en nada de lo que mandó. */
export function validarBienExcel(v: unknown): Omit<BienExcel, "grilla" | "fila" | "sospechoso"> | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  const descripcion = typeof b.descripcion === "string" ? b.descripcion.trim().slice(0, 300) : "";
  const tipo = tipoDeBien(typeof b.tipo === "string" ? b.tipo : null);
  const fecha = typeof b.fecha_alta === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.fecha_alta) ? b.fecha_alta : null;
  const importe = Number(b.importe);
  const meses = Number(b.meses_vida);
  const clave = typeof b.origen_clave === "string" && /^[0-9a-f]{24}#\d{1,5}$/.test(b.origen_clave) ? b.origen_clave : null;
  if (!descripcion || !tipo || !fecha || !clave) return null;
  if (!Number.isFinite(importe) || importe <= 0 || importe > 100_000_000) return null;
  if (!Number.isInteger(meses) || meses < 1 || meses > 600) return null;
  const notas = typeof b.notas === "string" ? b.notas.slice(0, 300) : null;
  return { descripcion, tipo, fecha_alta: fecha, importe: Math.round(importe * 10_000) / 10_000, meses_vida: meses, notas, origen_clave: clave };
}
