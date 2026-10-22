// Conocimiento base de las fotos de una publicación (22 oct 2026): qué fotos necesita un comprador para entender el producto, en qué
// orden y cómo debe verse cada una. Sale de una investigación (guías de Amazon, Mercado Libre, Alibaba, GS1, Baymard y Google; ver
// FOTOS-PRODUCTO-INVESTIGACION.md) y es el punto de partida de la IA: lo que el equipo suba en Reglas › Imágenes modelo se suma a esto, no lo
// reemplaza. Sin base ni red, con prueba.

import { esSuplemento } from "../optimizacion";

/** Los tipos de foto que puede planear la IA. `guia` es la frase corta que acompaña al tipo en cada pedido. */
export const TIPOS_FOTO = [
  { valor: "principal", etiqueta: "Principal", guia: "el producto solo, completo y centrado, sobre fondo claro liso y bien iluminado" },
  { valor: "ingredientes", etiqueta: "Ingredientes", guia: "el producto junto a sus ingredientes reales en su forma natural, cada uno con su nombre escrito" },
  { valor: "beneficios", etiqueta: "Beneficios", guia: "el producto con sus beneficios más importantes escritos como etiquetas cortas con un ícono" },
  { valor: "uso", etiqueta: "En uso", guia: "una persona parecida al comprador usando el producto en su ambiente real" },
  { valor: "como_usar", etiqueta: "Cómo se usa", guia: "los pasos de uso numerados, cada uno con una ilustración sencilla y su texto corto" },
  { valor: "escala", etiqueta: "Tamaño", guia: "el producto junto a un objeto de tamaño conocido (una mano, una taza, un celular) para ver qué tan grande es" },
  { valor: "detalle", etiqueta: "Detalle", guia: "un primer plano de material, textura, acabado o etiqueta" },
  { valor: "contenido", etiqueta: "Qué incluye", guia: "todo lo que trae el pedido, ordenado y separado" },
  { valor: "comparacion", etiqueta: "Comparación", guia: "el producto junto a un objeto de referencia (tamaño, cantidad, contenido) o frente a una alternativa genérica sin marca" },
  { valor: "estilo_cliente", etiqueta: "Estilo cliente", guia: "una foto casual, como la tomaría un cliente en casa, con el producto en la mano o en uso (sin texto ni reseña)" },
] as const;
export type TipoFoto = (typeof TIPOS_FOTO)[number]["valor"];
export const etiquetaTipoFoto = (t: string) => TIPOS_FOTO.find((x) => x.valor === t)?.etiqueta ?? t;

/** Qué pregunta del comprador responde una foto, cómo se hace bien y qué cuidar (todo en positivo, como pide la guía de Google para Gemini). */
export interface FichaFoto {
  /** La duda que resuelve. */
  para: string;
  /** Composición, luz y cámara. */
  como: string;
  /** Lo que no debe pasar (sobre todo honestidad y normas de las plataformas). */
  cuida: string;
}

export const FICHA_FOTO: Record<TipoFoto, FichaFoto> = {
  principal: {
    para: "Qué es el producto de un vistazo; es la miniatura que se ve en el catálogo.",
    como: "Producto completo y centrado, de frente o en tres cuartos, ocupando al menos el 85 % del cuadro (95 % si el fondo es de contexto), sobre fondo blanco o gris muy claro, liso y sin textura. Iluminación de estudio con tres softboxes, sombra suave y corta bajo el producto, enfoque nítido en la etiqueta, formato cuadrado 1:1.",
    cuida: "Solo el producto, sin objetos que no vengan incluidos, sin varios productos y sin bordes cortados.",
  },
  ingredientes: {
    para: "Qué lleva por dentro y por qué confiar en él: los compradores de suplementos y de cuidado personal buscan los ingredientes en la galería.",
    como: "El frasco o empaque al fondo y, delante, los ingredientes reales en su forma natural (raíz, hojas, frutos, semillas o polvo), los más importantes, cada uno con su nombre escrito debajo, en una fila o un semicírculo ordenado sobre una superficie clara. Luz suave y lateral, macro nítido de cada ingrediente, fondo liso. Cinco o seis ingredientes como máximo, los más importantes.",
    cuida: "Solo ingredientes que aparecen en los datos o en la etiqueta; sin cifras, dosis, sellos ni certificaciones.",
  },
  beneficios: {
    para: "Qué gana la persona con el producto: sus beneficios más importantes, dichos de forma clara.",
    como: "El producto en primer plano, limpio y reconocible, con los tres o cuatro beneficios más importantes escritos como etiquetas cortas, cada una con un ícono simple, repartidas con orden alrededor del producto y sin saturar. Fondo liso o con un degradado suave de dos o tres colores tomados del empaque, luz de estudio suave.",
    cuida: "Solo beneficios reales del producto, dichos como apoyo o bienestar; sin resultados médicos, cifras inventadas ni antes y después.",
  },
  uso: {
    para: "Cómo se ve en la vida real, con alguien parecido al cliente.",
    como: "Una persona que coincide con el comprador (edad y estilo) usando o sosteniendo el producto en un ambiente cotidiano creíble (cocina, baño, sala, oficina), con luz natural de ventana. Plano medio con lente de 35 a 50 mm, el producto visible y reconocible, expresión natural, manos con cinco dedos y proporciones normales.",
    cuida: "El producto idéntico al de la foto adjunta; sin ambientes de lujo irreales ni rostros de estudio demasiado perfectos.",
  },
  como_usar: {
    para: "Cómo se usa o se toma, para quitar la duda antes de comprar.",
    como: "Los pasos de uso en orden, numerados, cada uno con una ilustración o foto sencilla de la mano o la persona haciendo el paso (tomar la cápsula con un vaso de agua, aplicar la crema en la piel, encender el aparato) y su texto corto; el producto visible; fondo claro y luz suave.",
    cuida: "Solo el modo de uso que dice la etiqueta o la descripción; sin inventar dosis ni indicaciones médicas.",
  },
  escala: {
    para: "Qué tan grande es: muchos compradores tratan de adivinar el tamaño mirando las fotos y se equivocan sin una referencia.",
    como: "El producto junto a un objeto de tamaño conocido (una mano que lo sostiene, una taza, un celular, una moneda) en el mismo plano. Lente de 50 mm sin distorsión, fondo liso, luz suave, proporciones reales entre el producto y la referencia.",
    cuida: "Sin perspectiva forzada que agrande o achique el producto; sin marcas ni logos visibles en el objeto de referencia.",
  },
  detalle: {
    para: "La calidad, el material, la textura o la etiqueta de cerca.",
    como: "Macro con lente de 100 mm enfocada en un solo detalle (tapa, textura, costura, cierre, acabado o etiqueta), poca profundidad de campo, luz lateral suave que marque la textura y fondo desenfocado liso.",
    cuida: "Un solo detalle por foto, nítido y sin pixelado.",
  },
  contenido: {
    para: "Qué recibe exactamente el cliente, para evitar sorpresas y devoluciones.",
    como: "Todo lo que trae el pedido ordenado en cuadrícula o en línea sobre un fondo liso y claro, vista cenital, cada pieza separada y visible, con las proporciones reales entre ellas.",
    cuida: "Solo lo que realmente viene incluido y solo las cantidades que aparecen en los datos.",
  },
  comparacion: {
    para: "Por qué este producto y no otro.",
    como: "El producto junto a una alternativa genérica sin marca, o junto a un objeto de referencia, en el mismo plano y con la misma luz; composición simétrica 50/50 sobre fondo liso.",
    cuida: "Sin marcas de la competencia ni afirmaciones inventadas.",
  },
  estilo_cliente: {
    para: "La prueba de realidad: cómo lo mostraría un cliente de verdad.",
    como: "Una foto casual de teléfono: el producto en la mano o sobre una mesa de casa, luz natural, encuadre un poco imperfecto, fondo de hogar real con algo de desorden natural y sin retoques excesivos.",
    cuida: "Sin reseñas, estrellas, texto ni personas reconocibles.",
  },
};

/**
 * Las fotos **informativas**: son las únicas que llevan texto escrito en la imagen (es lo que informa); las demás son solo visuales. El
 * texto no lo inventa Gemini: lo escribe el plan (o el equipo) y se le pide tal cual. `max` líneas, de a lo más `largo` caracteres.
 */
export const TIPOS_CON_TEXTO = ["beneficios", "ingredientes", "como_usar"] as const;
export type TipoConTexto = (typeof TIPOS_CON_TEXTO)[number];
export const conTexto = (tipo: string): tipo is TipoConTexto => (TIPOS_CON_TEXTO as readonly string[]).includes(tipo);

export const LIMITES_TEXTO: Record<TipoConTexto, { max: number; largo: number; titulo: string; ejemplo: string }> = {
  beneficios: { max: 4, largo: 40, titulo: "Beneficios", ejemplo: "Hidrata en profundidad" },
  ingredientes: { max: 6, largo: 30, titulo: "Ingredientes", ejemplo: "Ácido hialurónico" },
  como_usar: { max: 4, largo: 60, titulo: "Cómo se usa", ejemplo: "Aplica una capa fina sobre la piel limpia" },
};

/** Cómo se reparte el texto en la imagen, según el tipo. */
export const DISTRIBUCION_TEXTO: Record<TipoConTexto, string> = {
  beneficios: "El producto al centro y cada beneficio como una etiqueta corta con un ícono simple a su lado, repartidos con orden alrededor del producto.",
  ingredientes: "El producto al fondo y cada ingrediente con su foto natural y su nombre escrito debajo, en una fila o un semicírculo ordenado.",
  como_usar: "Los pasos numerados 1, 2, 3… en orden de izquierda a derecha o de arriba hacia abajo, cada uno con una ilustración sencilla del paso y su texto; el producto visible.",
};

/** Cómo se agrupan los productos para elegir el juego de fotos. */
export type FamiliaProducto = "suplemento" | "belleza" | "general";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const BELLEZA = /crema|serum|suero|shampoo|champu|acondicionador|mascarilla|labial|maquillaje|pestan|capilar|facial|exfoli|jabon|perfume|esmalte|depil|protector solar|bloqueador|locion|desodorante|tonico|aceite para|cuidado de la piel|skin/;

/** Qué tipo de producto es, por su título y la categoría de Dropi (un suplemento manda sobre belleza: «cápsulas para el cabello» es suplemento). */
export function familiaDeProducto(titulo: string, categoria: string | null): FamiliaProducto {
  if (esSuplemento(titulo, categoria)) return "suplemento";
  return BELLEZA.test(sinTildes(`${titulo} ${categoria ?? ""}`)) ? "belleza" : "general";
}

/**
 * Las fotos que necesita un comprador, de la más a la menos importante, según el tipo de producto. La principal va primero porque es la
 * miniatura; las últimas solo se piden si todavía falta para llegar al mínimo de la galería. «Comparación» y «Estilo cliente» son de relleno.
 */
export const JUEGO_BASE: Record<FamiliaProducto, TipoFoto[]> = {
  suplemento: ["principal", "ingredientes", "beneficios", "uso", "como_usar", "contenido", "detalle", "escala", "estilo_cliente", "comparacion"],
  belleza: ["principal", "detalle", "uso", "beneficios", "ingredientes", "escala", "contenido", "como_usar", "estilo_cliente", "comparacion"],
  general: ["principal", "uso", "beneficios", "escala", "detalle", "contenido", "como_usar", "comparacion", "estilo_cliente", "ingredientes"],
};

export const ETIQUETA_FAMILIA: Record<FamiliaProducto, string> = { suplemento: "suplemento o producto de salud", belleza: "cuidado personal o belleza", general: "producto general (hogar, gadget, accesorio)" };

/** Lo que no se genera con IA y por qué: se avisa en el plan para que el equipo use la foto real. */
export const NO_SE_GENERA = [
  "Antes y después de una persona: es un resultado inventado y las plataformas (Meta, Amazon, la publicidad de salud) lo rechazan en suplementos y productos de salud.",
  "Panel de información o etiqueta con cifras (Supplement Facts): debe ser exacto; se usa la foto real de la etiqueta del proveedor, derecha y legible.",
  "Sellos, certificaciones o premios: solo si existen de verdad y vienen del proveedor.",
  "Reseñas, estrellas o testimonios: son de clientes reales.",
];

/** El bloque del plan de fotos: el juego prioritario del tipo de producto y lo que logra cada tipo de foto. */
export function textoJuegoBase(familia: FamiliaProducto): string {
  const orden = JUEGO_BASE[familia];
  return [
    `Juego de fotos que necesita el comprador de un ${ETIQUETA_FAMILIA[familia]}, de la más a la menos importante: ${orden.map((t) => `${t} (${etiquetaTipoFoto(t)})`).join(" › ")}. Elige las que faltan siguiendo ese orden; salta una solo si la foto del producto muestra que no aplica (por ejemplo, ingredientes de un producto sin ingredientes).`,
    `Qué resuelve cada tipo:\n${TIPOS_FOTO.map((t) => `- ${t.valor}: ${FICHA_FOTO[t.valor].para}`).join("\n")}`,
    `Esto no se genera con IA (si hace falta, dilo en «analisis» para que el equipo use la foto real):\n- ${NO_SE_GENERA.join("\n- ")}`,
  ].join("\n\n");
}

/** La guía profesional de un tipo de foto para el pedido a Gemini: cómo componerla, iluminarla y qué cuidar. Vacío si el tipo no existe. */
export function textoFichaFoto(tipo: string): string {
  const f = FICHA_FOTO[tipo as TipoFoto];
  if (!f) return "";
  return `Guía profesional para esta foto — qué resuelve: ${f.para}\nCómo hacerla: ${f.como}\nCuida: ${f.cuida}`;
}
