// Comentarios en cualquier cifra (mejora 92, estilo ClickUp; migración 0937: `fin_comentarios`). Un hilo se ancla a
// (página, período, clave de la cifra): la clave de una celda de tabla es «<fila>|<columna>» y la de un indicador, su
// nombre. Lógica pura (validación del ancla y del texto, claves); la carga está en `cargar-comentarios.ts` y las acciones
// en `comentarios-actions.ts`. Prueba en `comentarios.test.ts`.

/** Las páginas que tienen comentarios y el módulo que hay que poder abrir para leerlos y escribirlos. */
export const PAGINAS_COMENTARIOS = {
  "estado-resultados": { modulo: "estado-resultados", ruta: "/estado-resultados", titulo: "Estado de resultados" },
  "panel-financiero": { modulo: "panel-financiero", ruta: "/panel-financiero", titulo: "Panel financiero" },
} as const;
export type PaginaComentarios = keyof typeof PAGINAS_COMENTARIOS;

export const esPaginaComentarios = (v: unknown): v is PaginaComentarios => typeof v === "string" && Object.hasOwn(PAGINAS_COMENTARIOS, v);

export interface Ancla {
  pagina: PaginaComentarios;
  periodo: string;
  clave: string;
}

export const MAX_TEXTO_COMENTARIO = 2000;

/** Revisa un ancla que llega del navegador. */
export function validarAncla(v: unknown): Ancla | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!esPaginaComentarios(o.pagina)) return null;
  const periodo = typeof o.periodo === "string" ? o.periodo.trim() : "";
  if (!/^[a-z0-9-]{0,20}$/i.test(periodo)) return null;
  const clave = typeof o.clave === "string" ? o.clave.trim() : "";
  if (!clave || clave.length > 200 || /[\u0000-\u001f]/.test(clave)) return null;
  return { pagina: o.pagina, periodo, clave };
}

/** El texto de un comentario, limpio, o null si está vacío o es demasiado largo. */
export function limpiarTexto(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f]/g, "").trim();
  return t && t.length <= MAX_TEXTO_COMENTARIO ? t : null;
}

/** La clave de una celda de tabla: la fila y la columna (un mes «2026-03-01» o «total»). */
export const claveCelda = (fila: string, columna: string) => `${fila}|${columna}`;

/** Las claves con hilo (y cuántos comentarios) a partir de las filas guardadas. */
export function contarHilos(filas: { clave: string }[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of filas) out[f.clave] = (out[f.clave] ?? 0) + 1;
  return out;
}

/** A dónde lleva el aviso de una mención: la página con su período. */
export function enlaceAncla(a: Ancla): string {
  const base = PAGINAS_COMENTARIOS[a.pagina].ruta;
  return a.periodo ? `${base}?periodo=${encodeURIComponent(a.periodo)}` : base;
}

/** El nombre legible de la cifra: «Ventas · mar 26» a partir de la clave de una celda (para el aviso). */
export function nombreCifra(clave: string, etiquetas: Record<string, string> = {}): string {
  const [fila, columna] = clave.split("|");
  const nombreFila = etiquetas[fila] ?? fila.replace(/^[a-z_]+-/, "").replace(/-/g, " ");
  if (!columna) return nombreFila;
  const m = columna.match(/^(\d{4})-(\d{2})/);
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return `${nombreFila} · ${m ? `${MESES[Number(m[2]) - 1]} ${m[1].slice(2)}` : columna === "total" ? "Total" : columna}`;
}
