// Notas de Anuncios Meta (26 nov 2026, pedido de Hernán; migración 0370): lo que se quiere rescatar de los análisis para futuras campañas.
// Aquí van las reglas puras (sin base), para probarlas aparte.

export const MAX_NOTA = 2000;
export const MAX_ORIGEN = 600;
/** «Dejar para después» esconde la nota esta cantidad de días; después vuelve sola a las abiertas. */
export const DIAS_POSPUESTA = 7;

export type EstadoNota = "abierta" | "hecha" | "pospuesta" | "descartada";
export type CierreNota = Exclude<EstadoNota, "abierta">;

export interface NotaMeta {
  id: string;
  texto: string;
  origenClave: string | null;
  origenTexto: string | null;
  estado: EstadoNota;
  pospuestaHasta: string | null;
  creadoPorNombre: string | null;
  creadoEn: string;
  cerradoPorNombre: string | null;
  cerradoEn: string | null;
}

/** Junta espacios y corta: null si queda vacío. */
export function limpiarNota(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return t ? t.slice(0, max) : null;
}

/** La llave de una sugerencia (la misma forma que usan las decisiones). */
export const esClaveSugerencia = (v: unknown): v is string => typeof v === "string" && /^[a-z_]+:[A-Za-z0-9_.:-]{1,80}$/.test(v);

/** Revisa una nota nueva: texto obligatorio y, si viene de una sugerencia, su llave y su texto. */
export function revisarNota(entrada: { texto?: unknown; origenClave?: unknown; origenTexto?: unknown }): { texto: string; origenClave: string | null; origenTexto: string | null } | { error: string } {
  const texto = limpiarNota(entrada.texto, MAX_NOTA);
  if (!texto) return { error: "Escribe la nota." };
  if (typeof entrada.texto === "string" && entrada.texto.trim().length > MAX_NOTA) return { error: `La nota es muy larga: hasta ${MAX_NOTA.toLocaleString("es-PA")} caracteres.` };
  const origenClave = entrada.origenClave == null || entrada.origenClave === "" ? null : entrada.origenClave;
  if (origenClave !== null && !esClaveSugerencia(origenClave)) return { error: "Esa sugerencia no se reconoce." };
  return { texto, origenClave, origenTexto: origenClave ? limpiarNota(entrada.origenTexto, MAX_ORIGEN) : null };
}

export const esCierre = (v: unknown): v is CierreNota => v === "hecha" || v === "pospuesta" || v === "descartada";

/** Hasta cuándo queda escondida una nota pospuesta hoy (fecha de Panamá, AAAA-MM-DD). */
export function pospuestaHasta(hoy: string, dias = DIAS_POSPUESTA): string {
  return new Date(new Date(`${hoy}T00:00:00Z`).getTime() + dias * 86_400_000).toISOString().slice(0, 10);
}

/** Una nota está a la vista si está abierta o si ya venció su «Dejar para después». */
export const notaAbierta = (n: Pick<NotaMeta, "estado" | "pospuestaHasta">, hoy: string) => n.estado === "abierta" || (n.estado === "pospuesta" && (!n.pospuestaHasta || n.pospuestaHasta <= hoy));

/** Separa las notas en abiertas (las más nuevas arriba) y cerradas (las cerradas hace menos, arriba). */
export function separarNotas(notas: NotaMeta[], hoy: string): { abiertas: NotaMeta[]; cerradas: NotaMeta[] } {
  const abiertas = notas.filter((n) => notaAbierta(n, hoy)).sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
  const cerradas = notas.filter((n) => !notaAbierta(n, hoy)).sort((a, b) => (b.cerradoEn ?? b.creadoEn).localeCompare(a.cerradoEn ?? a.creadoEn));
  return { abiertas, cerradas };
}

/** Lo que dice una nota cerrada. */
export function etiquetaCierre(n: Pick<NotaMeta, "estado" | "pospuestaHasta">): string {
  if (n.estado === "hecha") return "Hecha";
  if (n.estado === "descartada") return "No aplica";
  if (n.estado === "pospuesta" && n.pospuestaHasta) {
    const [a, m, d] = n.pospuestaHasta.split("-");
    return `Para después (vuelve el ${d}/${m}/${a.slice(2)})`;
  }
  return "Para después";
}
