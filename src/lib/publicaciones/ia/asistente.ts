// Asistente de IA de Gestión de IDs Dropi (22 oct 2026): qué se le pide a la IA y cómo se valida lo que devuelve. Cuatro trabajos:
//  · «analisis»: revisa la publicación con las reglas del sistema y dice qué mejorar, en qué orden y cómo mejorar el proceso.
//  · «titulos»: propone títulos que cumplan las reglas (largo, español, cantidad); los que no cumplen se descartan.
//  · «texto»: investiga el producto (Alibaba, Amazon, otras tiendas) y propone la descripción y los ángulos de venta.
//  · «fotos»: mira la foto del producto, decide qué fotos le faltan y escribe la instrucción de cada una; Gemini las genera.
// Todos reciben las reglas del sistema (`criterios.ts`), las indicaciones que escribió el equipo y los títulos que ya aprobó. Todo lo
// que vuelve de la IA se vuelve a validar aquí (largos, tipos permitidos, solo enlaces http): nunca se guarda tal cual.
// Sin base, red ni React, con prueba.

import { textoEstilos, type EstiloImagen } from "./estilos";
import { etiquetaTipoFoto, familiaDeProducto, LIMITES_TEXTO, textoFichaFoto, textoJuegoBase, TIPOS_FOTO, type TipoFoto } from "./fotos-base";
import { lineaRiesgosa, normalizarTextos, textoDeFoto } from "./texto-imagen";
import { chequearTitulo, textoCriterios, textoEjemplos, textoIndicaciones, type ChequeoTitulo, type Ejemplos, type Indicaciones, type ReglasIA } from "./criterios";
import { extraerJson, type Fuente } from "./openai";

export type TipoIA = "analisis" | "titulos" | "texto" | "fotos";

/** Lo que puede generarse como foto de una publicación. Un «testimonio» no inventa reseñas ni personas reales: es una foto de uso. */
export { TIPOS_FOTO, etiquetaTipoFoto, type TipoFoto } from "./fotos-base";

/** Qué trabajo de la IA resuelve cada recomendación de optimización (null: esa recomendación no tiene asistente). */
export function tipoIADeRecomendacion(tipo: string): TipoIA | null {
  if (tipo === "optimizar_titulo") return "titulos";
  if (tipo === "mejorar_descripcion") return "texto";
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
  /** Lo que se revisa de la publicación y cómo está («Fotos · falta · 3 de 7 fotos como mínimo»). */
  revisiones: { etiqueta: string; estado: string; detalle: string }[];
  /** Cómo la venden otros en Dropi (nombre, proveedor, precio): sirve de referencia, no para copiar. */
  competidores: { nombre: string; proveedor: string; precio: number | null }[];
  /** Margen bruto (0,45 = 45 %) y ventas netas de 30 días, si se saben. */
  margen: number | null;
  ventas30: number | null;
}

/** Lo que acompaña a todos los pedidos: las reglas del sistema, lo que escribió el equipo y lo que ya aprobó. */
export interface ContextoIA {
  reglas: ReglasIA;
  indicaciones: Indicaciones;
  ejemplos: Ejemplos;
  /** Guías de estilo sacadas de las imágenes modelo del equipo (solo las activas). */
  estilos?: EstiloImagen[];
}

const bloques = (...b: string[]) => b.filter(Boolean).join("\n\n");

const resumenFaltas = (d: DatosPublicacionIA) => d.revisiones.filter((r) => r.estado === "falta" || r.estado === "revisar").map((r) => `${r.etiqueta}: ${r.detalle}`);

const datosBase = (d: DatosPublicacionIA): string[] =>
  [
    `Publicación de Dropi (${d.pais}): ${d.nombre}.`,
    d.tituloDropi && d.tituloDropi !== d.nombre ? `En Dropi se ve como: ${d.tituloDropi}.` : null,
    d.categoria ? `Categoría en Dropi: ${d.categoria}.` : null,
    d.producto ? `Producto en el sistema: ${d.producto}.` : null,
    d.precio !== null ? `Precio de venta: $${d.precio.toFixed(2)}.` : null,
  ].filter((x): x is string => !!x);

/** El pedido para analizar la publicación: qué mejorar, en qué orden, y cómo mejorar el proceso del equipo. */
export function pedidoAnalisis(d: DatosPublicacionIA, c: ContextoIA): { instrucciones: string; texto: string } {
  const instrucciones = bloques(
    "Eres consultor de optimización de publicaciones de productos en Dropi.",
    "Analiza la publicación con las reglas del sistema y lo que sabes del mercado (puedes consultar internet y mirar la foto adjunta). Di qué mejorar, en qué orden y por qué, y qué cambiaría el equipo en su forma de trabajar para que esto no vuelva a pasar.",
    `Reglas del sistema:\n- ${textoCriterios(c.reglas)}`,
    `Reglas:\n- ${REGLAS_COMUNES}`,
    textoIndicaciones(c.indicaciones, "analisis"),
    'Responde SOLO con un JSON, sin texto antes ni después: {"resumen":"…","prioridades":[{"titulo":"…","detalle":"…","impacto":"alto|medio|bajo","accion":"titulo|descripcion|fotos|video|precio|angulos|otro"}],"proceso":[{"sugerencia":"…","por_que":"…"}]}.',
    "resumen: 2 o 3 frases con el estado de la publicación y lo más importante. prioridades: de 3 a 6, de la que más impacto tiene a la que menos; detalle = qué hacer concretamente. proceso: de 2 a 4 sugerencias para el equipo (reglas nuevas, pasos, cosas a medir), no sobre este producto en particular.",
  );
  const texto = bloques(
    datosBase(d).join("\n"),
    d.margen !== null || d.ventas30 !== null ? `Margen bruto: ${d.margen === null ? "—" : `${Math.round(d.margen * 1000) / 10} %`}. Ventas netas en 30 días: ${d.ventas30 ?? "—"}.` : "",
    `Revisión actual:\n- ${d.revisiones.map((r) => `${r.etiqueta} [${r.estado}]: ${r.detalle}`).join("\n- ")}`,
    d.competidores.length ? `Así lo venden otros en Dropi:\n- ${d.competidores.slice(0, 8).map((x) => `${x.nombre} (${x.proveedor}${x.precio !== null ? `, $${x.precio.toFixed(2)}` : ""})`).join("\n- ")}` : "",
    textoEjemplos(c.ejemplos),
  );
  return { instrucciones, texto };
}

/** El pedido para proponer títulos: varios candidatos; el sistema se queda con los que cumplen las reglas. */
export function pedidoTitulos(d: DatosPublicacionIA, c: ContextoIA): { instrucciones: string; texto: string } {
  const { minTitulo, maxTitulo } = c.reglas;
  const instrucciones = bloques(
    "Eres especialista en catálogos de dropshipping en Latinoamérica (Dropi). Escribes títulos de producto que venden: en español neutro, claros, que dicen qué es el producto y para qué sirve.",
    `Propón 6 títulos distintos para esta publicación. Cada uno debe tener entre ${minTitulo} y ${maxTitulo} caracteres contando los espacios: cuenta los caracteres de cada uno antes de responder. Dropi no admite más de ${maxTitulo}.`,
    `Reglas del sistema:\n- ${textoCriterios(c.reglas)}`,
    [
      "Reglas del título (todas obligatorias):",
      "- Primero el nombre del producto, después la cantidad y al final el uso principal: «15 Days Cleanse 30c Limpieza Intestinal».",
      "- Si el producto tiene un nombre comercial en inglés (su marca o lo que dice su empaque: «15 Days Cleanse»), consérvalo tal cual, sin traducirlo. Lo que agregas (el uso, el beneficio) va en español; traduce las palabras descriptivas en inglés que vengan del proveedor (hair, growth, cream, pain relief…).",
      "- Si es un suplemento, di cuántas cápsulas, gomitas, tabletas o softgels trae, solo si la cantidad aparece en los datos: no inventes cantidades. Si no cabe completa, abrévala: 30c (cápsulas), 30go (gomitas), 30t (tabletas), 30sg (softgels); es mejor abreviar que dejar fuera el uso.",
      "- El uso puede ir directo, sin «para» («Limpieza Intestinal», «Salud Digestiva»), o con «para…», «contra…», «alivio de…».",
      "- Mínimo 3 palabras. Sin MAYÚSCULAS sostenidas, emojis, signos de exclamación ni punto final.",
      "- Que las opciones sean distintas entre sí (otro enfoque o beneficio), no la misma frase reordenada.",
    ].join("\n"),
    `Reglas:\n- ${REGLAS_COMUNES}`,
    textoIndicaciones(c.indicaciones, "titulo"),
    'Responde SOLO con un JSON, sin texto antes ni después: {"enfoque":"…","titulos":[{"titulo":"…","porque":"una frase corta de por qué ese título vende mejor"}]}. enfoque: 1 frase con lo que privilegiaste.',
  );
  const texto = bloques(
    datosBase(d).join("\n"),
    `Título actual en Dropi: «${(d.tituloDropi ?? d.nombre).trim()}» (${(d.tituloDropi ?? d.nombre).trim().length} caracteres).`,
    d.tituloDropi && d.tituloDropi.trim() !== d.nombre.trim() ? `Nombre interno del producto (a veces trae la cantidad o el uso que el título de Dropi no dice): «${d.nombre.trim()}».` : "",
    resumenFaltas(d).length ? `Lo que le falta hoy: ${resumenFaltas(d).join("; ")}.` : "",
    d.competidores.length ? `Así titulan este producto otros vendedores en Dropi (referencia, no copies):\n- ${d.competidores.slice(0, 10).map((x) => x.nombre).join("\n- ")}` : "",
    textoEjemplos(c.ejemplos),
  );
  return { instrucciones, texto };
}

/**
 * Segunda pasada: la IA cuenta mal los caracteres, así que los títulos que se pasan o se quedan cortos se le devuelven con su largo
 * real y lo que hay que ajustar. Conservan la idea; solo se acortan o se alargan.
 */
export function pedidoCorregirTitulos(titulos: Pick<TituloSugerido, "titulo" | "porque">[], c: ContextoIA): { instrucciones: string; texto: string } {
  const { minTitulo, maxTitulo } = c.reglas;
  const instrucciones = bloques(
    "Eres especialista en catálogos de dropshipping en Latinoamérica (Dropi). Ajustas el largo de títulos de producto sin cambiar su idea.",
    `Cada título debe medir entre ${minTitulo} y ${maxTitulo} caracteres contando los espacios. Te paso cada uno con su largo actual: reescríbelo para que quede dentro del rango (si se pasa, quita palabras de relleno; si se queda corto, agrega el beneficio o la cantidad que ya aparece en el título). Cuenta los caracteres antes de responder.`,
    "Conserva el nombre del producto tal cual (aunque esté en inglés) y lo demás en español; que diga qué es y para qué sirve (si no cabe, abrevia la cantidad: 30c, 30go, 30t, 30sg), sin mayúsculas sostenidas, emojis, exclamaciones ni punto final, y no inventes cantidades.",
    'Responde SOLO con un JSON, sin texto antes ni después: {"titulos":[{"titulo":"…","porque":"una frase corta de por qué ese título vende mejor"}]}.',
  );
  const texto = titulos.map((t, i) => `${i + 1}. «${t.titulo}» (${t.titulo.length} caracteres; objetivo ${minTitulo}-${maxTitulo})${t.porque ? ` · idea: ${t.porque}` : ""}`).join("\n");
  return { instrucciones, texto };
}

/** El pedido para proponer la descripción y los ángulos de venta (con investigación en internet). */
export function pedidoTexto(d: DatosPublicacionIA, c: ContextoIA): { instrucciones: string; texto: string } {
  const instrucciones = bloques(
    "Eres especialista en optimizar publicaciones de productos en Dropi.",
    "Investiga en internet el producto (Alibaba, AliExpress, Amazon y tiendas parecidas): para qué sirve, qué incluye, cómo se usa, medidas o contenido, y cómo lo venden los mejores vendedores. Mira también la foto adjunta.",
    `Reglas del sistema:\n- ${textoCriterios(c.reglas)}`,
    `Reglas:\n- ${REGLAS_COMUNES}`,
    textoIndicaciones(c.indicaciones, "descripcion"),
    'Responde SOLO con un JSON, sin texto antes ni después, con esta forma exacta: {"descripcion":"…","angulos":[{"nombre":"…","gancho":"…","para_quien":"…","objecion":"…"}],"notas":"…"}.',
    "descripcion: texto en español con párrafos cortos y listas con guiones: qué es, beneficios, qué incluye, modo de uso y especificaciones verificables.",
    "angulos: 4 ángulos de venta distintos; gancho = la frase que abre el anuncio; para_quien = el público; objecion = la duda que resuelve.",
    "notas: en 2 o 3 frases, lo más importante que encontraste (competencia, qué destacan, qué evitar).",
  );
  const texto = bloques(
    datosBase(d).join("\n"),
    `La descripción debe tener al menos ${c.reglas.minDescripcion} caracteres.`,
    resumenFaltas(d).length ? `Lo que le falta hoy a la publicación: ${resumenFaltas(d).join("; ")}.` : "",
    textoEjemplos({ titulos: c.ejemplos.titulos, rechazos: [] }),
  );
  return { instrucciones, texto };
}

/** El pedido para decidir qué fotos faltan y cómo pedirle cada una a Gemini. */
export function pedidoFotos(d: DatosPublicacionIA, c: ContextoIA, cantidad: number): { instrucciones: string; texto: string } {
  const n = Math.max(1, Math.min(MAX_FOTOS, Math.round(cantidad)));
  const instrucciones = bloques(
    "Eres director de arte de publicaciones de productos en Dropi.",
    "Mira la foto adjunta del producto y decide qué fotos le faltan a la publicación para venderse mejor. Si hace falta, consulta en internet cómo muestran el producto los mejores vendedores.",
    `Reglas del sistema:\n- ${textoCriterios(c.reglas)}`,
    `Reglas:\n- ${REGLAS_COMUNES}\n- Solo las fotos de beneficios, ingredientes y cómo se usa llevan texto, y es el que tú escribes en «textos»; las demás fotos no llevan texto. Ninguna lleva logos, precios ni sellos.\n- Un «testimonio» no existe: la foto estilo cliente es solo una foto casual de uso, sin reseña ni persona real identificable.\n- Cada foto debe mostrar exactamente el mismo producto de la foto adjunta.`,
    textoIndicaciones(c.indicaciones, "fotos"),
    textoEstilos(c.estilos),
    textoJuegoBase(familiaDeProducto(d.tituloDropi ?? d.nombre, d.categoria)),
    [
      "Textos de las fotos informativas (en español, cortos, con sus tildes y bien escritos; se escriben tal cual en la imagen):",
      `- beneficios: de 3 a ${LIMITES_TEXTO.beneficios.max} beneficios, los más importantes y reales del producto, de a lo más ${LIMITES_TEXTO.beneficios.largo} caracteres cada uno (ej. «${LIMITES_TEXTO.beneficios.ejemplo}»), dichos como apoyo o bienestar: nunca curar, tratar ni garantizar nada. Usa verbos como «apoya», «favorece», «ayuda a» o «contribuye a»; evita «previene», «alivia», «mejora» y «reduce el dolor».`,
      `- ingredientes: los ingredientes principales, hasta ${LIMITES_TEXTO.ingredientes.max}, de a lo más ${LIMITES_TEXTO.ingredientes.largo} caracteres cada uno (ej. «${LIMITES_TEXTO.ingredientes.ejemplo}»). Solo los que se leen en la etiqueta de la foto o aparecen en los datos o en una fuente confiable de ese mismo producto: si no los puedes confirmar, no pidas esa foto.`,
      `- como_usar: de 2 a ${LIMITES_TEXTO.como_usar.max} pasos de uso, en orden, de a lo más ${LIMITES_TEXTO.como_usar.largo} caracteres cada uno, en infinitivo o imperativo (ej. «${LIMITES_TEXTO.como_usar.ejemplo}»). Solo el modo de uso que diga la etiqueta o la descripción, sin inventar dosis ni indicaciones médicas.`,
      "Una foto de otro tipo lleva «textos» vacío.",
    ].join("\n"),
    `Tipos permitidos: ${TIPOS_FOTO.map((t) => `${t.valor} (${t.guia})`).join("; ")}.`,
    `Responde SOLO con un JSON, sin texto antes ni después: {"analisis":"…","fotos":[{"tipo":"…","titulo":"…","instruccion":"…","textos":["…"]}]}. Exactamente ${n} fotos, de tipos distintos, de la que más hace falta a la que menos.`,
    "analisis: 1 o 2 frases con lo que le falta. titulo: 2 a 5 palabras. instruccion: la escena completa que debe generar el modelo de imágenes, en español, con composición, ambiente, luz y qué se ve (el texto de las fotos informativas va en «textos», no en la instrucción).",
  );
  const texto = bloques(datosBase(d).join("\n"), resumenFaltas(d).length ? `Lo que le falta hoy: ${resumenFaltas(d).join("; ")}.` : "", `Genera el plan de ${n} fotos.`);
  return { instrucciones, texto };
}

const cortar = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

// --- Análisis ---------------------------------------------------------------------------------------------------------

export type Impacto = "alto" | "medio" | "bajo";
export type AccionAnalisis = "titulo" | "descripcion" | "fotos" | "video" | "precio" | "angulos" | "otro";
const ACCIONES: AccionAnalisis[] = ["titulo", "descripcion", "fotos", "video", "precio", "angulos", "otro"];
const IMPACTOS: Impacto[] = ["alto", "medio", "bajo"];

export interface Prioridad {
  titulo: string;
  detalle: string;
  impacto: Impacto;
  accion: AccionAnalisis;
}

export interface AnalisisIA {
  resumen: string;
  prioridades: Prioridad[];
  proceso: { sugerencia: string; porQue: string }[];
}

/** Valida el análisis de la IA. null si no sirve (sin resumen ni prioridades). */
export function normalizarAnalisis(texto: string): AnalisisIA | null {
  const j = extraerJson(texto);
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const prioridades = (Array.isArray(o.prioridades) ? o.prioridades : [])
    .map((p) => {
      const x = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      return {
        titulo: cortar(x.titulo, 120),
        detalle: cortar(x.detalle, 500),
        impacto: IMPACTOS.find((i) => i === x.impacto) ?? "medio",
        accion: ACCIONES.find((a) => a === x.accion) ?? "otro",
      };
    })
    .filter((p) => p.titulo && p.detalle)
    .slice(0, 6);
  const proceso = (Array.isArray(o.proceso) ? o.proceso : [])
    .map((p) => {
      const x = (p && typeof p === "object" ? p : {}) as Record<string, unknown>;
      return { sugerencia: cortar(x.sugerencia, 240), porQue: cortar(x.por_que, 300) };
    })
    .filter((p) => p.sugerencia)
    .slice(0, 4);
  const resumen = cortar(o.resumen, 700);
  if (!resumen && !prioridades.length) return null;
  return { resumen, prioridades, proceso };
}

// --- Títulos ----------------------------------------------------------------------------------------------------------

export interface TituloSugerido {
  titulo: string;
  /** Una frase de la IA: por qué ese título vende mejor. */
  porque: string;
  chequeos: ChequeoTitulo[];
  cumple: boolean;
}

export interface PropuestaTitulos {
  enfoque: string;
  titulos: TituloSugerido[];
  /** Cuántos de los que propuso la IA no cumplían las reglas y se descartaron. */
  descartados: number;
  /** Lo que eligió el equipo: el título final (quizá corregido) y si lo editó. */
  elegido?: { titulo: string; editado: boolean; por: string; en: string };
}

/** Sin espacios de más, comillas alrededor ni punto o exclamación al final (en cualquier orden: «Título».). */
const limpiarTitulo = (t: string) =>
  t
    .replace(/\s+/g, " ")
    .replace(/^[\s"«“'`]+|[\s"»”'`.!¡]+$/g, "")
    .trim();

/**
 * Valida los títulos de la IA con las reglas del sistema: limpia cada uno, descarta los repetidos, el actual y los de menos de 3
 * palabras, se queda con los que cumplen (hasta 3) y cuenta los descartados. Si ninguno cumple, devuelve los 3 más cercanos marcados
 * para que el equipo los ajuste. null si no hay ningún título. Cada título puede venir solo o con su «porque».
 */
export function normalizarTitulos(texto: string, categoria: string | null, reglas: Pick<ReglasIA, "minTitulo" | "maxTitulo">, tituloActual?: string, nombreProducto?: string | null): PropuestaTitulos | null {
  const j = extraerJson(texto);
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const vistos = new Set<string>(tituloActual ? [tituloActual.trim().toLowerCase()] : []);
  const todos: TituloSugerido[] = [];
  for (const t of Array.isArray(o.titulos) ? o.titulos : []) {
    const crudo = typeof t === "string" ? t : (t as { titulo?: unknown } | null)?.titulo;
    if (typeof crudo !== "string") continue;
    const titulo = limpiarTitulo(crudo).slice(0, 200);
    const clave = titulo.toLowerCase();
    if (titulo.length < 8 || titulo.split(" ").length < 3 || vistos.has(clave)) continue;
    vistos.add(clave);
    const porque = typeof t === "object" && t && typeof (t as { porque?: unknown }).porque === "string" ? limpiarTitulo((t as { porque: string }).porque).slice(0, 200) : "";
    const r = chequearTitulo(titulo, categoria, reglas, nombreProducto);
    todos.push({ titulo, porque, chequeos: r.chequeos, cumple: r.cumple });
  }
  if (!todos.length) return null;
  const buenos = todos.filter((t) => t.cumple);
  const enfoque = cortar(o.enfoque, 300);
  if (buenos.length) return { enfoque, titulos: buenos.slice(0, 3), descartados: todos.length - Math.min(3, buenos.length) };
  // Ninguno cumple: los que menos se alejan del rango, para que se ajusten a mano.
  const medio = (reglas.minTitulo + reglas.maxTitulo) / 2;
  const cercanos = [...todos].sort((a, b) => Math.abs(a.titulo.length - medio) - Math.abs(b.titulo.length - medio)).slice(0, 3);
  return { enfoque, titulos: cercanos, descartados: todos.length - cercanos.length };
}

// --- Texto ------------------------------------------------------------------------------------------------------------

export interface Angulo {
  nombre: string;
  gancho: string;
  paraQuien: string;
  objecion: string;
}

export interface PropuestaTexto {
  /** La descripción que el equipo eligió usar (migración 0151): ya en HTML para Dropi. Queda pendiente en la cola de «Aplicar en Dropi». */
  elegida?: { html: string; por: string; en: string };
  descripcion: string;
  angulos: Angulo[];
  notas: string;
  fuentes: Fuente[];
}

/** Valida lo que devolvió la IA para la descripción y los ángulos. null si no sirve (sin descripción ni ángulos). */
export function normalizarPropuestaTexto(texto: string, fuentes: Fuente[]): PropuestaTexto | null {
  const j = extraerJson(texto);
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  // La descripción conserva sus saltos de línea (párrafos y listas).
  const descripcion = typeof o.descripcion === "string" ? o.descripcion.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 6000) : "";
  const angulos = (Array.isArray(o.angulos) ? o.angulos : [])
    .map((a) => {
      const x = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
      return { nombre: cortar(x.nombre, 80), gancho: cortar(x.gancho, 240), paraQuien: cortar(x.para_quien, 160), objecion: cortar(x.objecion, 200) };
    })
    .filter((a) => a.nombre && a.gancho)
    .slice(0, 5);
  if (descripcion.length < 20 && !angulos.length) return null;
  return { descripcion, angulos, notas: cortar(o.notas, 700), fuentes: fuentes.filter((f) => /^https?:\/\//i.test(f.url)).slice(0, 8) };
}

// --- Fotos ------------------------------------------------------------------------------------------------------------

export interface FotoPlan {
  tipo: TipoFoto;
  titulo: string;
  instruccion: string;
  /** El texto que lleva la imagen (solo beneficios, ingredientes y cómo se usa), una línea cada uno; el equipo lo puede corregir antes de generarla. */
  textos?: string[];
  /** Si la imagen generada se leyó y trae el texto bien escrito (true), mal escrito (false) o no se pudo comprobar (null). */
  textoOk?: boolean | null;
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
    // El texto del plan se limpia y se descarta lo que promete curar o tratar una enfermedad.
    const textos = normalizarTextos(tipo, x.textos).filter((t) => !lineaRiesgosa([t]));
    fotos.push({ tipo, titulo: cortar(x.titulo, 60) || etiquetaTipoFoto(tipo), instruccion, textos, textoOk: null, ruta: null, error: null });
  }
  if (!fotos.length) return null;
  return { analisis: cortar(o.analisis, 500), fotos: fotos.slice(0, Math.max(1, Math.min(MAX_FOTOS, Math.round(cantidad)))) };
}

/** El pedido final a Gemini de una foto del plan: la instrucción más lo que no se negocia. */
export function promptFoto(d: Pick<DatosPublicacionIA, "nombre">, f: Pick<FotoPlan, "tipo" | "instruccion" | "textos">, referencias: number, estilos?: EstiloImagen[]): string {
  const guia = TIPOS_FOTO.find((t) => t.valor === f.tipo)?.guia ?? "";
  const lineas = [
    `Foto para la publicación de un producto en un marketplace. Producto: ${d.nombre.trim()}.`,
    `Tipo de foto: ${etiquetaTipoFoto(f.tipo)} (${guia}).`,
    `Lo que debe mostrar: ${f.instruccion.trim()}`,
  ];
  if (referencias)
    lineas.push(`${referencias === 1 ? "La imagen adjunta es una foto real" : `Las ${referencias} imágenes adjuntas son fotos reales`} del producto: respeta exactamente su forma, colores, materiales, proporciones y detalles. No inventes otro producto ni cambies su diseño.`);
  const ficha = textoFichaFoto(f.tipo);
  if (ficha) lineas.push(ficha);
  const estilo = textoEstilos(estilos, f.tipo);
  if (estilo) lineas.push(estilo);
  // Las fotos informativas llevan solo el texto que se les da; las demás, ninguno.
  const texto = textoDeFoto(f.tipo, f.textos ?? []);
  if (texto) {
    lineas.push(texto);
    lineas.push("Fotografía realista de calidad comercial, bien iluminada. Sin logos, marcas de agua, precios, sellos ni más texto que el indicado.");
  } else {
    lineas.push("Fotografía realista de calidad comercial, bien iluminada. Sin textos, letras, logos, marcas de agua, precios ni sellos sobre la imagen.");
  }
  return lineas.join("\n");
}
