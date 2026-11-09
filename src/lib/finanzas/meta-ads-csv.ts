// Importador del CSV de exportación de Meta Ads Manager (Rentabilidad › Marketing). Lógica pura: el navegador lo usa para
// la vista previa y el servidor lo vuelve a correr sobre el archivo (nunca confía en lo que mandó el navegador).
//
// Columnas que se reconocen (español o inglés, sin importar mayúsculas ni acentos):
//   campaña («Nombre de la campaña», «Campaign name»), conjunto («Nombre del conjunto de anuncios», «Ad set name»),
//   gasto («Importe gastado (USD)», «Amount spent (USD)»), compras («Compras», «Purchases», «Compras en el sitio web»…),
//   fecha («Día», «Day», «Inicio del informe», «Reporting starts») y fin («Fin del informe», «Reporting ends»).
// Las filas del mismo día, campaña y conjunto (una exportación por anuncio) se suman.

/** Debajo del límite de 1 MB de las acciones del servidor de Next (con el resto del formulario). */
export const MAX_BYTES_META = 950 * 1024;
export const TEXTO_MAX_META = "950 KB";
export const MAX_FILAS_META = 20_000;

export interface FilaMeta {
  fecha: string;
  fechaFin: string | null;
  campana: string;
  conjunto: string;
  gasto: number;
  compras: number;
}

export interface LecturaMeta {
  filas: FilaMeta[];
  errores: { fila: number; motivo: string }[];
  moneda: string | null;
  /** Columnas que faltan (sin campaña, gasto o fecha no se puede importar). */
  faltan: string[];
  /** Filas leídas antes de sumar. */
  leidas: number;
}

export const normalizarEncabezado = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Separa un CSV respetando comillas. Detecta el separador (coma, punto y coma o tabulador) por la primera línea. */
export function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^﻿/, "");
  const primera = limpio.slice(0, limpio.search(/\r?\n/) === -1 ? limpio.length : limpio.search(/\r?\n/));
  const cuenta = (c: string) => primera.split(c).length - 1;
  const sep = [",", ";", "\t"].reduce((a, c) => (cuenta(c) > cuenta(a) ? c : a), ",");
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i];
    if (comillas) {
      if (ch === '"') {
        if (limpio[i + 1] === '"') {
          celda += '"';
          i++;
        } else comillas = false;
      } else celda += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) {
      fila.push(celda);
      celda = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += ch;
  }
  if (celda !== "" || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas.filter((f) => f.some((c) => c.trim() !== ""));
}

/** «1,234.56», «1.234,56», «12,5», «$ 10» → número; vacío → 0; otra cosa → null. */
export function leerNumero(v: string): number | null {
  const s = v.replace(/[^\d,.\-]/g, "");
  if (!s) return v.trim() === "" || v.trim() === "-" ? 0 : null;
  const coma = s.lastIndexOf(",");
  const punto = s.lastIndexOf(".");
  let normal = s;
  if (coma > -1 && punto > -1) normal = coma > punto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (coma > -1) normal = /,\d{3}$/.test(s) && s.split(",").length > 1 && !/,\d{1,2}$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** «2026-09-03», «2026/09/03» o «03/09/2026» (día primero) → «2026-09-03»; si no, null. */
export function leerFecha(v: string): string | null {
  const t = v.trim();
  let a: number, m: number, d: number;
  let r = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (r) [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else {
    r = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (!r) return null;
    [d, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])];
  }
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d || a < 2015 || a > 2100) return null;
  return f.toISOString().slice(0, 10);
}

type Columna = "campana" | "conjunto" | "gasto" | "compras" | "fecha" | "fechaFin";

const NOMBRES: Record<Columna, (h: string) => boolean> = {
  campana: (h) => ["nombre de la campana", "campaign name", "campana", "campaign"].includes(h),
  conjunto: (h) => ["nombre del conjunto de anuncios", "ad set name", "conjunto de anuncios", "ad set"].includes(h),
  gasto: (h) => h.startsWith("importe gastado") || h.startsWith("amount spent") || h.startsWith("gasto"),
  compras: (h) =>
    ["compras", "purchases", "compras en el sitio web", "website purchases", "compras en meta", "compras en el sitio web de meta"].includes(h) ||
    h.startsWith("compras (") ||
    h.startsWith("purchases ("),
  fecha: (h) => ["dia", "day", "fecha", "inicio del informe", "reporting starts", "date"].includes(h),
  fechaFin: (h) => ["fin del informe", "reporting ends"].includes(h),
};

const ETIQUETA: Record<"campana" | "gasto" | "fecha", string> = { campana: "Nombre de la campaña", gasto: "Importe gastado", fecha: "Día o Inicio del informe" };

const texto = (v: string | undefined, max: number) => (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Lee el CSV de Meta: filas válidas (sumadas por día + campaña + conjunto), errores por fila y la moneda del gasto. */
export function leerCsvMeta(contenido: string): LecturaMeta {
  const tabla = leerCsv(contenido);
  const vacio: LecturaMeta = { filas: [], errores: [], moneda: null, faltan: [], leidas: 0 };
  if (!tabla.length) return { ...vacio, faltan: Object.values(ETIQUETA) };
  const enc = tabla[0].map(normalizarEncabezado);
  const idx = Object.fromEntries(
    (Object.keys(NOMBRES) as Columna[]).map((c) => [c, enc.findIndex((h) => NOMBRES[c](h))]),
  ) as Record<Columna, number>;
  const faltan = (Object.keys(ETIQUETA) as (keyof typeof ETIQUETA)[]).filter((c) => idx[c] < 0).map((c) => ETIQUETA[c]);
  if (faltan.length) return { ...vacio, faltan };
  const moneda = tabla[0][idx.gasto].match(/\(([A-Za-z]{3})\)/)?.[1]?.toUpperCase() ?? null;
  const errores: LecturaMeta["errores"] = [];
  const porClave = new Map<string, FilaMeta>();
  let leidas = 0;
  for (let i = 1; i < tabla.length && leidas < MAX_FILAS_META; i++) {
    const f = tabla[i];
    const campana = texto(f[idx.campana], 300);
    // Filas de total o vacías: Meta agrega una de resumen sin campaña.
    if (!campana || /^(total|resultados totales|total results)/i.test(campana)) continue;
    leidas++;
    const fila = i + 1;
    const fecha = leerFecha(f[idx.fecha] ?? "");
    if (!fecha) {
      errores.push({ fila, motivo: `Fecha no válida: «${texto(f[idx.fecha], 20)}».` });
      continue;
    }
    const gasto = leerNumero(f[idx.gasto] ?? "");
    if (gasto === null || gasto < 0 || gasto > 10_000_000) {
      errores.push({ fila, motivo: `Gasto no válido: «${texto(f[idx.gasto], 20)}».` });
      continue;
    }
    const compras = idx.compras >= 0 ? leerNumero(f[idx.compras] ?? "") : 0;
    if (compras === null || compras < 0) {
      errores.push({ fila, motivo: `Compras no válidas: «${texto(f[idx.compras], 20)}».` });
      continue;
    }
    const conjunto = idx.conjunto >= 0 ? texto(f[idx.conjunto], 300) : "";
    const fechaFin = idx.fechaFin >= 0 ? leerFecha(f[idx.fechaFin] ?? "") : null;
    const clave = claveFilaMeta({ fecha, campana, conjunto });
    const previa = porClave.get(clave);
    if (previa) {
      previa.gasto += gasto;
      previa.compras += compras;
    } else porClave.set(clave, { fecha, fechaFin: fechaFin && fechaFin >= fecha ? fechaFin : null, campana, conjunto, gasto, compras });
  }
  const filas = [...porClave.values()].map((f) => ({ ...f, gasto: Math.round(f.gasto * 100) / 100, compras: Math.round(f.compras * 100) / 100 }));
  return { filas, errores, moneda, faltan: [], leidas };
}

/** La llave de una fila (día + campaña + conjunto, sin mayúsculas ni espacios de más): la misma fila de otra exportación. */
export function claveFilaMeta(f: Pick<FilaMeta, "fecha" | "campana" | "conjunto">): string {
  return [f.fecha, normalizarEncabezado(f.campana), normalizarEncabezado(f.conjunto)].join("|");
}
