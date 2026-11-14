// El asistente del sistema (14 nov 2026, pedido de Hernán: «que el equipo le pregunte a la IA cualquier cosa del sistema»): la búsqueda en el Centro de
// ayuda que usa su herramienta `buscar_ayuda`. A diferencia del buscador de la ayuda (todas las palabras), aquí cuenta cada palabra que coincida, porque
// la IA busca con varias palabras sueltas; el título pesa más. Busca solo en lo que esa persona puede ver (`construirIndice`). Lógica pura, con prueba.

import type { EntradaIndice } from "@/lib/ayuda/indice";

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Palabras que no ayudan a buscar. */
const VACIAS = new Set(["como", "para", "que", "con", "los", "las", "del", "una", "uno", "por", "cual", "donde", "cuando", "esta", "este", "hay", "hago", "puedo", "sistema"]);

export interface ResultadoAyuda {
  titulo: string;
  texto: string;
  enlace: string;
  tipo: EntradaIndice["tipo"];
}

/** Las entradas que más se parecen a la consulta, con su texto (hasta `largo` caracteres) y su enlace. */
export function buscarParaAsistente(indice: readonly EntradaIndice[], consulta: string, limite = 6, largo = 1500): ResultadoAyuda[] {
  const palabras = [...new Set(normal(consulta).split(/[^a-z0-9ñ]+/).filter((p) => p.length > 2 && !VACIAS.has(p)))];
  if (!palabras.length) return [];
  const PESO = { termino: 2, guia: 2, curso: 1, manual: 1, paso: 1, leccion: 0 } as const;
  return indice
    .map((e) => {
      const titulo = normal(e.titulo);
      const texto = normal(e.texto);
      let puntos = 0;
      let encontradas = 0;
      for (const p of palabras) {
        const enTitulo = titulo.includes(p);
        const enTexto = texto.includes(p);
        if (enTitulo || enTexto) encontradas++;
        puntos += (enTitulo ? 4 : 0) + (enTexto ? 1 : 0);
      }
      if (!encontradas) return null;
      // Más palabras distintas encontradas cuenta más que repetir una sola.
      return { e, puntos: puntos + encontradas * 3 + PESO[e.tipo] };
    })
    .filter((x): x is { e: EntradaIndice; puntos: number } => x !== null)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, limite)
    .map(({ e }) => ({ titulo: e.titulo, texto: e.texto.length > largo ? `${e.texto.slice(0, largo)}…` : e.texto, enlace: e.href, tipo: e.tipo }));
}
