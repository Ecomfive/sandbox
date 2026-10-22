// Asistente de IA de Gestión de IDs Dropi (22 oct 2026): qué se le pide a la IA y cómo se valida lo que devuelve. Cuatro trabajos:
//  · «analisis»: revisa la publicación con las reglas del sistema y dice qué mejorar, en qué orden y cómo mejorar el proceso.
//  · «titulos»: propone títulos que cumplan las reglas (largo, español, cantidad); los que no cumplen se descartan.
//  · «texto»: investiga el producto (Alibaba, Amazon, otras tiendas) y propone la descripción y los ángulos de venta.
//  · «fotos»: mira la foto del producto, decide qué fotos le faltan y escribe la instrucción de cada una; Gemini las genera.
// Todos reciben las reglas del sistema (`criterios.ts`), las indicaciones que escribió el equipo y los títulos que ya aprobó. Todo lo
// que vuelve de la IA se vuelve a validar aquí (largos, tipos permitidos, solo enlaces http): nunca se guarda tal cual.
// Sin base, red ni React, con prueba.

import { chequearTitulo, textoCriterios, textoEjemplos, textoIndicaciones, type ChequeoTitulo, type Ejemplos, type Indicaciones, type ReglasIA } from "./criterios";
import { extraerJson, type Fuente } from "./openai";

export type TipoIA = "analisis" | "titulos" | "texto" | "fotos";

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
    "Eres especialista en títulos de productos para Dropi.",
    `Propón 6 títulos distintos para esta publicación. Cada uno debe tener entre ${minTitulo} y ${maxTitulo} caracteres contando los espacios: cuenta los caracteres de cada uno antes de responder. Dropi no admite más de ${maxTitulo}.`,
    `Reglas del sistema:\n- ${textoCriterios(c.reglas)}`,
    `Reglas:\n- ${REGLAS_COMUNES}`,
    textoIndicaciones(c.indicaciones, "titulo"),
    'Responde SOLO con un JSON, sin texto antes ni después: {"enfoque":"…","titulos":["…","…","…","…","…","…"]}. enfoque: 1 frase con el ángulo que elegiste y por qué.',
  );
  const texto = bloques(
    datosBase(d).join("\n"),
    `Título actual en Dropi: ${d.tituloDropi ?? d.nombre} (${(d.tituloDropi ?? d.nombre).trim().length} caracteres).`,
    resumenFaltas(d).length ? `Lo que le falta hoy: ${resumenFaltas(d).join("; ")}.` : "",
    d.competidores.length ? `Así titulan este producto otros vendedores en Dropi (referencia, no copies):\n- ${d.competidores.slice(0, 10).map((x) => x.nombre).join("\n- ")}` : "",
    textoEjemplos(c.ejemplos),
  );
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
    `Reglas:\n- ${REGLAS_COMUNES}\n- Las fotos no llevan texto, letras, logos, precios ni sellos.\n- Un «testimonio» no existe: la foto estilo cliente es solo una foto casual de uso, sin reseña ni persona real identificable.\n- Cada foto debe mostrar exactamente el mismo producto de la foto adjunta.`,
    textoIndicaciones(c.indicaciones, "fotos"),
    `Tipos permitidos: ${TIPOS_FOTO.map((t) => `${t.valor} (${t.guia})`).join("; ")}.`,
    `Responde SOLO con un JSON, sin texto antes ni después: {"analisis":"…","fotos":[{"tipo":"…","titulo":"…","instruccion":"…"}]}. Exactamente ${n} fotos, de tipos distintos, de la que más hace falta a la que menos.`,
    "analisis: 1 o 2 frases con lo que le falta. titulo: 2 a 5 palabras. instruccion: la escena completa que debe generar el modelo de imágenes, en español, con composición, ambiente, luz y qué se ve (sin texto en la imagen).",
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

/**
 * Valida los títulos de la IA con las reglas del sistema: se queda con los que cumplen (hasta 3) y cuenta los descartados. Si ninguno
 * cumple, devuelve los 3 más cercanos marcados para que el equipo los ajuste. null si no hay ningún título.
 */
export function normalizarTitulos(texto: string, categoria: string | null, reglas: Pick<ReglasIA, "minTitulo" | "maxTitulo">): PropuestaTitulos | null {
  const j = extraerJson(texto);
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const vistos = new Set<string>();
  const todos: TituloSugerido[] = [];
  for (const t of Array.isArray(o.titulos) ? o.titulos : []) {
    const titulo = cortar(t, 200);
    const clave = titulo.toLowerCase();
    if (titulo.length < 8 || vistos.has(clave)) continue;
    vistos.add(clave);
    const r = chequearTitulo(titulo, categoria, reglas);
    todos.push({ titulo, chequeos: r.chequeos, cumple: r.cumple });
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
