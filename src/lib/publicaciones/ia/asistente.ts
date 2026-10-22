// Asistente de IA de Gestión de IDs Dropi (22 oct 2026): qué se le pide a la IA y cómo se valida lo que devuelve. Dos trabajos:
//  · «texto»: investiga el producto (Alibaba, Amazon, otras tiendas) y propone títulos, descripción y ángulos de venta.
//  · «fotos»: mira la foto del producto, decide qué fotos le faltan a la publicación (principal, beneficios, uso, comparación…) y
//    escribe la instrucción de cada una; después Gemini las genera.
// Todo lo que vuelve de la IA se vuelve a validar aquí (largos, tipos permitidos, solo enlaces http): nunca se guarda tal cual.
// Sin base, red ni React, con prueba.

import { extraerJson, type Fuente } from "./openai";

export type TipoIA = "texto" | "fotos";

/** Lo que puede generarse como foto de una publicación. Un «testimonio» no inventa reseñas ni personas reales: es una foto de uso. */
export const TIPOS_FOTO = [
  { valor: "principal", etiqueta: "Principal", guia: "el producto solo, centrado, sobre fondo limpio y bien iluminado" },
  { valor: "beneficios", etiqueta: "Beneficios", guia: "el producto con una escena que haga evidente su beneficio principal, sin texto" },
  { valor: "uso", etiqueta: "En uso", guia: "una persona usando el producto en su ambiente real" },
  { valor: "comparacion", etiqueta: "Comparación", guia: "el producto junto a un objeto de referencia (tamaño, cantidad, contenido) o frente a una alternativa genérica sin marca" },
  { valor: "estilo_cliente", etiqueta: "Estilo cliente", guia: "una foto casual, como la tomaría un cliente en casa, con el producto en la mano o en uso (sin texto ni reseña)" },
  { valor: "contenido", etiqueta: "Qué incluye", guia: "todo lo que trae la caja o el empaque, ordenado" },
  { valor: "detalle", etiqueta: "Detalle", guia: "un primer plano de material, textura o acabado" },
] as const;
export type TipoFoto = (typeof TIPOS_FOTO)[number]["valor"];
export const etiquetaTipoFoto = (t: string) => TIPOS_FOTO.find((x) => x.valor === t)?.etiqueta ?? t;

/** Qué trabajo de la IA resuelve cada recomendación de optimización (null: esa recomendación no tiene asistente). */
export function tipoIADeRecomendacion(tipo: string): TipoIA | null {
  if (tipo === "optimizar_titulo" || tipo === "mejorar_descripcion") return "texto";
  if (tipo === "mas_fotos") return "fotos";
  return null;
}

/** Cuántas fotos se generan como máximo de una vez (cada una cuesta y tarda). */
export const MAX_FOTOS = 6;

const REGLAS_COMUNES = [
  "Escribes en español neutro de Latinoamérica, claro y vendedor, para el catálogo de Dropi (dropshipping con pago contra entrega).",
  "No inventes datos técnicos, certificaciones, resultados ni marcas que no puedas verificar en lo que investigaste o se ve en la foto.",
  "No prometas curar, tratar ni prevenir enfermedades; en suplementos y productos de salud habla de apoyo y bienestar.",
  "No inventes reseñas, testimonios ni cifras de clientes.",
  "No uses el nombre de otras marcas ni de otras tiendas.",
].join("\n- ");

export interface DatosPublicacionIA {
  nombre: string;
  /** Cómo se ve en Dropi, si se leyó. */
  tituloDropi: string | null;
  categoria: string | null;
  pais: string;
  precio: number | null;
  /** El producto vinculado de Producto, si hay. */
  producto: string | null;
  /** Lo que le falta a la publicación según la revisión («Palabras en inglés: hair, growth»). */
  faltas: string[];
  /** Largo mínimo de la descripción, de las reglas. */
  minDescripcion: number;
}

/** El pedido para proponer títulos, descripción y ángulos de venta. */
export function pedidoTexto(d: DatosPublicacionIA): { instrucciones: string; texto: string } {
  const instrucciones = [
    "Eres especialista en optimizar publicaciones de productos en Dropi.",
    "Investiga en internet el producto (Alibaba, AliExpress, Amazon y tiendas parecidas): para qué sirve, qué incluye, cómo se usa, medidas o contenido, y cómo lo venden los mejores vendedores. Mira también la foto adjunta.",
    `Reglas:\n- ${REGLAS_COMUNES}`,
    'Responde SOLO con un JSON, sin texto antes ni después, con esta forma exacta: {"titulos":["…","…","…"],"descripcion":"…","angulos":[{"nombre":"…","gancho":"…","para_quien":"…","objecion":"…"}],"notas":"…"}.',
    "titulos: 3 opciones de máximo 100 caracteres, en español, que digan qué es, para qué sirve y, si aplica, la cantidad (cápsulas, gomitas, piezas, pack).",
    "descripcion: texto en español con párrafos cortos y listas con guiones: qué es, beneficios, qué incluye, modo de uso y especificaciones verificables.",
    "angulos: 4 ángulos de venta distintos; gancho = la frase que abre el anuncio; para_quien = el público; objecion = la duda que resuelve.",
    "notas: en 2 o 3 frases, lo más importante que encontraste (competencia, qué destacan, qué evitar).",
  ].join("\n");
  const lineas = [
    `Publicación de Dropi (${d.pais}): ${d.nombre}.`,
    d.tituloDropi && d.tituloDropi !== d.nombre ? `En Dropi se ve como: ${d.tituloDropi}.` : null,
    d.categoria ? `Categoría en Dropi: ${d.categoria}.` : null,
    d.producto ? `Producto en el sistema: ${d.producto}.` : null,
    d.precio !== null ? `Precio de venta: $${d.precio.toFixed(2)}.` : null,
    `La descripción debe tener al menos ${d.minDescripcion} caracteres.`,
    d.faltas.length ? `Lo que le falta hoy a la publicación: ${d.faltas.join("; ")}.` : null,
  ];
  return { instrucciones, texto: lineas.filter(Boolean).join("\n") };
}

/** El pedido para decidir qué fotos faltan y cómo pedirle cada una a Gemini. */
export function pedidoFotos(d: DatosPublicacionIA, cantidad: number): { instrucciones: string; texto: string } {
  const n = Math.max(1, Math.min(MAX_FOTOS, Math.round(cantidad)));
  const instrucciones = [
    "Eres director de arte de publicaciones de productos en Dropi.",
    "Mira la foto adjunta del producto y decide qué fotos le faltan a la publicación para venderse mejor. Si hace falta, consulta en internet cómo muestran el producto los mejores vendedores.",
    `Reglas:\n- ${REGLAS_COMUNES}\n- Las fotos no llevan texto, letras, logos, precios ni sellos.\n- Un «testimonio» no existe: la foto estilo cliente es solo una foto casual de uso, sin reseña ni persona real identificable.\n- Cada foto debe mostrar exactamente el mismo producto de la foto adjunta.`,
    `Tipos permitidos: ${TIPOS_FOTO.map((t) => `${t.valor} (${t.guia})`).join("; ")}.`,
    `Responde SOLO con un JSON, sin texto antes ni después: {"analisis":"…","fotos":[{"tipo":"…","titulo":"…","instruccion":"…"}]}. Exactamente ${n} fotos, de tipos distintos, de la que más hace falta a la que menos.`,
    "analisis: 1 o 2 frases con lo que le falta. titulo: 2 a 5 palabras. instruccion: la escena completa que debe generar el modelo de imágenes, en español, con composición, ambiente, luz y qué se ve (sin texto en la imagen).",
  ].join("\n");
  const texto = [`Publicación de Dropi (${d.pais}): ${d.nombre}.`, d.categoria ? `Categoría: ${d.categoria}.` : null, d.faltas.length ? `Lo que le falta hoy: ${d.faltas.join("; ")}.` : null, `Genera el plan de ${n} fotos.`].filter(Boolean).join("\n");
  return { instrucciones, texto };
}

export interface Angulo {
  nombre: string;
  gancho: string;
  paraQuien: string;
  objecion: string;
}

export interface PropuestaTexto {
  titulos: string[];
  descripcion: string;
  angulos: Angulo[];
  notas: string;
  fuentes: Fuente[];
}

const cortar = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** Valida lo que devolvió la IA para el texto. null si no sirve (sin títulos ni descripción). */
export function normalizarPropuestaTexto(texto: string, fuentes: Fuente[]): PropuestaTexto | null {
  const j = extraerJson(texto);
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const titulos = (Array.isArray(o.titulos) ? o.titulos : []).map((t) => cortar(t, 150)).filter((t) => t.length >= 8).slice(0, 3);
  // La descripción conserva sus saltos de línea (párrafos y listas).
  const descripcion = typeof o.descripcion === "string" ? o.descripcion.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000) : "";
  const angulos = (Array.isArray(o.angulos) ? o.angulos : [])
    .map((a) => {
      const x = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
      return { nombre: cortar(x.nombre, 80), gancho: cortar(x.gancho, 240), paraQuien: cortar(x.para_quien, 160), objecion: cortar(x.objecion, 200) };
    })
    .filter((a) => a.nombre && a.gancho)
    .slice(0, 5);
  if (!titulos.length && descripcion.length < 20) return null;
  return { titulos, descripcion, angulos, notas: cortar(o.notas, 700), fuentes: fuentes.filter((f) => /^https?:\/\//i.test(f.url)).slice(0, 8) };
}

export interface FotoPlan {
  tipo: TipoFoto;
  titulo: string;
  instruccion: string;
  /** Dónde quedó la imagen generada en Storage (null si todavía no se generó). */
  ruta: string | null;
  /** El motivo si la última generación falló. */
  error: string | null;
}

export interface PlanFotos {
  analisis: string;
  fotos: FotoPlan[];
}

/** Valida el plan de fotos de la IA: solo tipos permitidos, sin repetir, con su instrucción. null si no sirve. */
export function normalizarPlanFotos(texto: string, cantidad: number): PlanFotos | null {
  const j = extraerJson(texto);
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const vistos = new Set<string>();
  const fotos: FotoPlan[] = [];
  for (const f of Array.isArray(o.fotos) ? o.fotos : []) {
    const x = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
    const tipo = TIPOS_FOTO.find((t) => t.valor === x.tipo)?.valor;
    const instruccion = cortar(x.instruccion, 900);
    if (!tipo || vistos.has(tipo) || instruccion.length < 20) continue;
    vistos.add(tipo);
    fotos.push({ tipo, titulo: cortar(x.titulo, 60) || etiquetaTipoFoto(tipo), instruccion, ruta: null, error: null });
  }
  if (!fotos.length) return null;
  return { analisis: cortar(o.analisis, 500), fotos: fotos.slice(0, Math.max(1, Math.min(MAX_FOTOS, Math.round(cantidad)))) };
}

/** El pedido final a Gemini de una foto del plan: la instrucción más lo que no se negocia. */
export function promptFoto(d: Pick<DatosPublicacionIA, "nombre">, f: Pick<FotoPlan, "tipo" | "instruccion">, referencias: number): string {
  const guia = TIPOS_FOTO.find((t) => t.valor === f.tipo)?.guia ?? "";
  const lineas = [
    `Foto para la publicación de un producto en un marketplace. Producto: ${d.nombre.trim()}.`,
    `Tipo de foto: ${etiquetaTipoFoto(f.tipo)} (${guia}).`,
    `Lo que debe mostrar: ${f.instruccion.trim()}`,
  ];
  if (referencias)
    lineas.push(`${referencias === 1 ? "La imagen adjunta es una foto real" : `Las ${referencias} imágenes adjuntas son fotos reales`} del producto: respeta exactamente su forma, colores, materiales, proporciones y detalles. No inventes otro producto ni cambies su diseño.`);
  lineas.push("Fotografía realista de calidad comercial, bien iluminada. Sin textos, letras, logos, marcas de agua, precios ni sellos sobre la imagen.");
  return lineas.join("\n");
}
