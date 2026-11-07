// Análisis de competencia › la IA con visión revisa los pares dudosos (7 nov 2026): un producto nuestro y los de la competencia que se le parecen, con sus fotos y
// sus nombres. Responde si cada uno es el mismo producto, uno parecido u otro distinto (como «Buscar por imagen», `leerVerificacion`). Sin red ni base, con prueba.

import type { EntradaTexto } from "@/lib/publicaciones/ia/openai";
import type { Veredicto } from "@/lib/imagen/buscar";

/** Cuántos de la competencia se le muestran a la IA con cada producto nuestro (más sube el costo y la confunde). */
export const MAX_POR_PEDIDO = 8;

export function pedidoCompararCompetencia(nuestro: { nombre: string; foto: string }, otros: { nombre: string; foto: string }[]): EntradaTexto {
  const lista = otros.map((o, i) => `${i + 1}. ${o.nombre}`).join("\n");
  return {
    instrucciones:
      "Eres un revisor de catálogo de productos de dropshipping. Te muestro nuestro producto (la primera imagen) y productos de la competencia (las demás, en el orden de la lista). " +
      "Decides si cada uno es EL MISMO PRODUCTO que el nuestro: misma marca o fabricante, misma fórmula o modelo y misma presentación (cantidad, tamaño, cápsulas, ml). " +
      "Si es la misma clase de producto pero cambia la marca, la fórmula, el modelo o el tamaño, es PARECIDO. Si es otra cosa, es DISTINTO. " +
      "Nunca digas MISMO si no ves el mismo envase, etiqueta o diseño en las dos fotos, o si los nombres dicen tamaños o cantidades distintas. Respondes SOLO un JSON, sin texto antes ni después.",
    texto:
      `Nuestro producto: ${nuestro.nombre}\n\nDe la competencia (el n.º es el orden de sus fotos, después de la nuestra):\n${lista}\n\n` +
      'Responde: {"resultados":[{"n":1,"veredicto":"mismo|parecido|distinto","motivo":"una frase corta: en qué coinciden o en qué se distinguen"}]} con todos.',
    imagenes: [nuestro.foto, ...otros.map((o) => o.foto)],
  };
}

/** El veredicto guardado de un par se busca por esta clave. */
export const claveVerificacion = (productoId: string, nuestroId: string) => `${productoId}|${nuestroId}`;

export type { Veredicto };
