// El buscador de la ayuda: busca en lo que el servidor armó para esa persona (`construirIndice`) sin pedir nada más. Lógica
// pura, sirve en el navegador.

export type TipoEntrada = "termino" | "guia" | "paso" | "curso" | "leccion" | "manual";

export interface EntradaIndice {
  tipo: TipoEntrada;
  titulo: string;
  texto: string;
  href: string;
  modulo?: string;
}

export const ETIQUETA_TIPO: Record<TipoEntrada, string> = {
  termino: "Glosario",
  guia: "Guía",
  paso: "Guía",
  curso: "Curso",
  leccion: "Curso",
  manual: "Manual",
};

const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Las entradas que coinciden con lo escrito (todas las palabras), las mejores primero: el título pesa más que el texto, y una
 * guía, término o curso más que un paso o una lección.
 */
export function buscarEnIndice(indice: EntradaIndice[], consulta: string, limite = 12): EntradaIndice[] {
  const palabras = normal(consulta).split(/\s+/).filter((p) => p.length > 1);
  if (palabras.length === 0) return [];
  const PESO: Record<TipoEntrada, number> = { termino: 3, guia: 3, curso: 2, manual: 2, paso: 1, leccion: 1 };
  return indice
    .map((e) => {
      const titulo = normal(e.titulo);
      const texto = normal(e.texto);
      if (!palabras.every((p) => titulo.includes(p) || texto.includes(p))) return null;
      const puntos = palabras.reduce((t, p) => t + (titulo.includes(p) ? 5 : 1), 0) + PESO[e.tipo];
      return { e, puntos };
    })
    .filter((x): x is { e: EntradaIndice; puntos: number } => x !== null)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, limite)
    .map((x) => x.e);
}

/** Un trozo del texto alrededor de la primera palabra encontrada, para mostrar debajo del título. */
export function extracto(texto: string, consulta: string, largo = 110): string {
  const palabra = normal(consulta).split(/\s+/).find((p) => p.length > 1) ?? "";
  const i = palabra ? normal(texto).indexOf(palabra) : -1;
  const desde = Math.max(0, i - 30);
  const trozo = texto.slice(desde, desde + largo).trim();
  return `${desde > 0 ? "…" : ""}${trozo}${desde + largo < texto.length ? "…" : ""}`;
}
