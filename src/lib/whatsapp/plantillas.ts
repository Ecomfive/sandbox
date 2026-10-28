// Plantillas de WhatsApp (28 oct 2026): lo que hay que saber de una plantilla sin tocar la red ni la base, para poder probarlo
// (src/lib/whatsapp/plantillas.test.ts). Meta (o 360dialog) solo aprueba plantillas con esta forma: un cuerpo con variables {{1}}, {{2}}…,
// un ejemplo de cada variable, y opcionalmente un encabezado, un pie y botones de respuesta rápida. Importa con rutas relativas porque
// también lo usa `scripts/`.

export const CATEGORIAS = ["marketing", "utility"] as const;
export type Categoria = (typeof CATEGORIAS)[number];
/** Las tres que tiene Meta; «authentication» (códigos de verificación) no se crea desde aquí. */
export type CategoriaMeta = Categoria | "authentication";

export type EstadoPlantilla = "borrador" | "pendiente" | "aprobada" | "rechazada" | "pausada" | "deshabilitada";
export type Calidad = "pendiente" | "alta" | "media" | "baja";

export const IDIOMAS: { codigo: string; etiqueta: string }[] = [
  { codigo: "es", etiqueta: "Español" },
  { codigo: "en_US", etiqueta: "Inglés" },
  { codigo: "pt_BR", etiqueta: "Portugués" },
];

/** Qué dato de la persona llena una variable: uno de los que el sistema ya sabe, o «manual» (se escribe al enviar). */
export type CampoVariable = "primer_nombre" | "nombre_completo" | "tienda" | "manual";

export const CAMPOS_VARIABLE: { campo: CampoVariable; etiqueta: string; ejemplo: string }[] = [
  { campo: "primer_nombre", etiqueta: "Primer nombre", ejemplo: "María" },
  { campo: "nombre_completo", etiqueta: "Nombre completo", ejemplo: "María Pérez" },
  { campo: "tienda", etiqueta: "Nombre de su tienda", ejemplo: "Bella Moda" },
  { campo: "manual", etiqueta: "Lo escribo al enviar", ejemplo: "" },
];

export interface VariablePlantilla {
  campo: CampoVariable;
  /** El valor de muestra que Meta revisa (nunca un dato de una persona real). */
  ejemplo: string;
  /** Solo en «manual»: qué se pide al enviar («Producto»). */
  etiqueta?: string;
}

export interface DatosPlantilla {
  nombre: string;
  idioma: string;
  categoria: Categoria;
  encabezado: string | null;
  cuerpo: string;
  pie: string | null;
  /** Botones de respuesta rápida (hasta 3). */
  botones: string[];
  /** Una por cada {{n}} del cuerpo, en orden. */
  variables: VariablePlantilla[];
}

// Límites de Meta.
export const MAX_CUERPO = 1024;
export const MAX_ENCABEZADO = 60;
export const MAX_PIE = 60;
export const MAX_BOTONES = 3;
export const MAX_BOTON = 25;
export const MAX_NOMBRE = 100;
export const MAX_EJEMPLO = 60;
export const NOMBRE_VALIDO = /^[a-z0-9_]+$/;

const RANURA = /\{\{\s*(\d+)\s*\}\}/g;

/** Los números de las variables del texto, en el orden en que aparecen (con repetidos). */
export function ranuras(texto: string): number[] {
  return [...texto.matchAll(RANURA)].map((m) => Number(m[1]));
}

/** Los números distintos, de menor a mayor. */
export const ranurasUnicas = (texto: string): number[] => [...new Set(ranuras(texto))].sort((a, b) => a - b);

/** Escribe cada variable como la quiere Meta: «{{ 1 }}» pasa a «{{1}}». */
export const normalizarCuerpo = (texto: string): string => texto.replace(RANURA, (_, n: string) => `{{${Number(n)}}}`);

/** El número de la próxima variable que se agrega: la más alta + 1. */
export const siguienteRanura = (cuerpo: string): number => Math.max(0, ...ranuras(cuerpo)) + 1;

/** «Retomar compra» → «retomar_compra»: el nombre que acepta Meta, sugerido a partir de lo que se escribe. */
export function nombreSugerido(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, MAX_NOMBRE);
}

/**
 * Deja las variables de la plantilla alineadas con el cuerpo: una por cada {{n}} (la mayor), conservando lo ya elegido de cada una y
 * dando a las nuevas «Primer nombre» la primera y «Lo escribo al enviar» las demás.
 */
export function alinearVariables(cuerpo: string, actuales: VariablePlantilla[]): VariablePlantilla[] {
  const n = Math.max(0, ...ranuras(cuerpo));
  return Array.from({ length: n }, (_, i) => actuales[i] ?? (i === 0 ? { campo: "primer_nombre", ejemplo: "María" } : { campo: "manual", ejemplo: "", etiqueta: "" }));
}

const palabras = (texto: string) => texto.split(/\s+/).filter(Boolean).length;
const PROMOCIONAL = /\b(descuentos?|ofertas?|promoci[oó]n(es)?|gratis|rebajas?|aprovecha|ahorra|2x1|liquidaci[oó]n|cup[oó]n(es)?)\b/i;
const DESPEDIDA = /(no\s+(quieres|deseas|prefieres)|dejar\s+de\s+recibir|no\s+m[aá]s|darte\s+de\s+baja|no\s+te\s+escribimos)/i;

export interface Revision {
  /** Lo que impide mandarla a Meta. */
  errores: string[];
  /** Lo que Meta suele rechazar o penalizar, pero no impide mandarla. */
  avisos: string[];
}

/**
 * Revisa una plantilla antes de mandarla a Meta. Los errores son lo que Meta rechaza seguro (nombre, largos, variables sin orden o sin
 * ejemplo); los avisos, lo que suele darle problemas (una variable al principio o al final, demasiadas variables para el texto, una
 * «utilidad» que suena a promoción, un mensaje de marketing sin forma de decir que no).
 */
export function validarPlantilla(d: DatosPlantilla): Revision {
  const errores: string[] = [];
  const avisos: string[] = [];
  const nombre = d.nombre.trim();
  if (!nombre) errores.push("Falta el nombre.");
  else if (!NOMBRE_VALIDO.test(nombre) || nombre.length > MAX_NOMBRE) errores.push("El nombre solo lleva minúsculas, números y guiones bajos (ej: retomar_compra).");
  if (!IDIOMAS.some((i) => i.codigo === d.idioma)) errores.push("Elige el idioma.");
  if (!(CATEGORIAS as readonly string[]).includes(d.categoria)) errores.push("Elige la categoría.");

  const cuerpo = d.cuerpo.trim();
  if (!cuerpo) errores.push("Falta el mensaje.");
  if (cuerpo.length > MAX_CUERPO) errores.push(`El mensaje es muy largo (máximo ${MAX_CUERPO} caracteres).`);
  const abiertas = (cuerpo.match(/\{\{/g) ?? []).length;
  const cerradas = (cuerpo.match(/\}\}/g) ?? []).length;
  const lista = ranuras(cuerpo);
  if (abiertas !== lista.length || cerradas !== lista.length) errores.push("Revisa las variables: cada una se escribe {{1}}, {{2}}…");

  const unicas = ranurasUnicas(cuerpo);
  if (unicas.some((n, i) => n !== i + 1)) errores.push("Las variables van en orden, sin saltos: {{1}}, {{2}}, {{3}}…");
  else {
    if (d.variables.length !== unicas.length) errores.push("Faltan datos de alguna variable.");
    unicas.forEach((n, i) => {
      const v = d.variables[i];
      if (!v) return;
      const ejemplo = v.ejemplo.trim();
      if (!ejemplo) errores.push(`Falta el ejemplo de {{${n}}}: Meta lo pide para aprobar la plantilla.`);
      else if (ejemplo.length > MAX_EJEMPLO || /[\n\t]/.test(ejemplo)) errores.push(`El ejemplo de {{${n}}} debe ser corto y en una sola línea.`);
      if (v.campo === "manual" && !(v.etiqueta ?? "").trim()) errores.push(`Di qué se escribe en {{${n}}} al enviar (ej: Producto).`);
    });
  }

  const encabezado = (d.encabezado ?? "").trim();
  if (encabezado.length > MAX_ENCABEZADO) errores.push(`El encabezado es muy largo (máximo ${MAX_ENCABEZADO} caracteres).`);
  if (ranuras(encabezado).length) errores.push("El encabezado no lleva variables.");
  const pie = (d.pie ?? "").trim();
  if (pie.length > MAX_PIE) errores.push(`El pie es muy largo (máximo ${MAX_PIE} caracteres).`);
  if (ranuras(pie).length) errores.push("El pie no lleva variables.");

  const botones = d.botones.map((b) => b.trim());
  if (botones.length > MAX_BOTONES) errores.push(`Hasta ${MAX_BOTONES} botones.`);
  if (botones.some((b) => !b)) errores.push("Hay un botón vacío.");
  if (botones.some((b) => b.length > MAX_BOTON)) errores.push(`El texto de un botón es de máximo ${MAX_BOTON} caracteres.`);
  if (new Set(botones.map((b) => b.toLowerCase())).size !== botones.length) errores.push("Dos botones dicen lo mismo.");

  if (unicas.length && cuerpo) {
    if (/^\{\{\d+\}\}/.test(cuerpo) || /\{\{\d+\}\}[^\p{L}\p{N}]*$/u.test(cuerpo)) avisos.push("Meta suele rechazar un mensaje que empieza o termina con una variable: pon texto antes y después.");
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(cuerpo)) avisos.push("Dos variables seguidas: pon al menos una palabra entre ellas.");
    const fijas = palabras(cuerpo.replace(RANURA, " "));
    if (fijas < unicas.length * 3) avisos.push("Hay muchas variables para tan poco texto: agrega más palabras o quita alguna variable.");
  }
  if (d.categoria === "utility" && PROMOCIONAL.test(`${encabezado} ${cuerpo}`)) avisos.push("Suena a promoción: Meta la pasaría a Marketing (cuesta más). Si es una promoción, elige Marketing.");
  if (d.categoria === "marketing" && cuerpo && !botones.some((b) => /\bno\b/i.test(b)) && !DESPEDIDA.test(cuerpo)) {
    avisos.push("Agrega un botón como «No, gracias»: si la persona puede decir que no fácil, te reporta menos.");
  }
  return { errores, avisos };
}

type Componente = Record<string, unknown>;

/** Los componentes que se mandan a Meta: encabezado, cuerpo (con el ejemplo de cada variable), pie y botones de respuesta rápida. */
export function construirComponentes(d: DatosPlantilla): Componente[] {
  const componentes: Componente[] = [];
  const encabezado = (d.encabezado ?? "").trim();
  if (encabezado) componentes.push({ type: "HEADER", format: "TEXT", text: encabezado });
  const cuerpo: Componente = { type: "BODY", text: normalizarCuerpo(d.cuerpo.trim()) };
  const n = ranurasUnicas(d.cuerpo).length;
  if (n) cuerpo.example = { body_text: [d.variables.slice(0, n).map((v) => v.ejemplo.trim())] };
  componentes.push(cuerpo);
  const pie = (d.pie ?? "").trim();
  if (pie) componentes.push({ type: "FOOTER", text: pie });
  const botones = d.botones.map((b) => b.trim()).filter(Boolean);
  if (botones.length) componentes.push({ type: "BUTTONS", buttons: botones.map((text) => ({ type: "QUICK_REPLY", text })) });
  return componentes;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Lo contrario: de los componentes que devuelve Meta, el encabezado, el cuerpo, el pie y los botones de respuesta rápida. */
export function desdeComponentes(componentes: unknown): { encabezado: string | null; cuerpo: string; pie: string | null; botones: string[]; ejemplos: string[] } {
  let encabezado: string | null = null;
  let cuerpo = "";
  let pie: string | null = null;
  let botones: string[] = [];
  let ejemplos: string[] = [];
  for (const c of Array.isArray(componentes) ? componentes.map(obj) : []) {
    const tipo = String(c.type ?? "").toUpperCase();
    if (tipo === "HEADER" && String(c.format ?? "TEXT").toUpperCase() === "TEXT") encabezado = texto(c.text);
    else if (tipo === "BODY") {
      cuerpo = texto(c.text) ?? "";
      const fila = obj(c.example).body_text;
      ejemplos = Array.isArray(fila) && Array.isArray(fila[0]) ? (fila[0] as unknown[]).map((e) => String(e ?? "")) : [];
    } else if (tipo === "FOOTER") pie = texto(c.text);
    else if (tipo === "BUTTONS" && Array.isArray(c.buttons))
      botones = c.buttons.map(obj).filter((b) => String(b.type ?? "").toUpperCase() === "QUICK_REPLY").map((b) => texto(b.text) ?? "").filter(Boolean);
  }
  return { encabezado, cuerpo, pie, botones, ejemplos };
}

/** El cuerpo con cada {{n}} reemplazado por su valor (el que falta queda como está). */
export function rellenar(cuerpo: string, valores: string[]): string {
  return cuerpo.replace(RANURA, (_, n: string) => valores[Number(n) - 1] ?? `{{${Number(n)}}}`);
}

/** Cómo se vería el mensaje con los ejemplos. */
export const vistaPrevia = (d: Pick<DatosPlantilla, "cuerpo" | "variables">): string => rellenar(d.cuerpo, d.variables.map((v) => v.ejemplo.trim()));

/**
 * Los segundos que hay que esperar antes de mandar otra plantilla a Meta (0 si ya se puede). Meta deja crear hasta 100 por hora y no
 * documenta un mínimo entre una y otra; los dos minutos son una precaución nuestra para que no parezca un envío en masa.
 */
export const ESPERA_ENTRE_PLANTILLAS_S = 120;
export function segundosDeEspera(ultimoEnvio: string | null | undefined, ahora: Date = new Date(), minimo = ESPERA_ENTRE_PLANTILLAS_S): number {
  const t = Date.parse(ultimoEnvio ?? "");
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.ceil(minimo - (ahora.getTime() - t) / 1000));
}

/** «45 segundos» o «2 minutos»: para decirle a la persona cuánto esperar. */
export const textoEspera = (segundos: number): string => (segundos >= 90 ? `${Math.ceil(segundos / 60)} minutos` : `${segundos} segundos`);

/** Un valor que se manda como variable: sin saltos de línea, tabuladores ni espacios repetidos (Meta los rechaza). */
export const limpiarValor = (v: string): string => v.replace(/\s+/g, " ").trim().slice(0, 200);

export const primerNombre = (nombre: string | null | undefined): string => (nombre ?? "").trim().split(/\s+/)[0] ?? "";

/**
 * Los valores de las variables de una plantilla para una persona: los que el sistema sabe salen de su ficha y los «manual» se escriben al
 * enviar (`manuales`, uno por cada variable, en el mismo orden). Si falta alguno, dice cuál.
 */
export function resolverVariables(
  variables: VariablePlantilla[],
  persona: { nombre: string | null; tienda: string | null },
  manuales: string[] = [],
): { valores: string[] } | { error: string } {
  const valores: string[] = [];
  for (let i = 0; i < variables.length; i++) {
    const v = variables[i];
    const dato =
      v.campo === "primer_nombre" ? primerNombre(persona.nombre) : v.campo === "nombre_completo" ? (persona.nombre ?? "") : v.campo === "tienda" ? (persona.tienda ?? "") : (manuales[i] ?? "");
    const limpio = limpiarValor(dato);
    if (!limpio) {
      const que = v.campo === "manual" ? (v.etiqueta?.trim() || `la variable {{${i + 1}}}`) : (CAMPOS_VARIABLE.find((c) => c.campo === v.campo)?.etiqueta ?? v.campo).toLowerCase();
      return { error: v.campo === "manual" ? `Escribe ${que}.` : `Este dropshipper no tiene ${que} en el CRM.` };
    }
    valores.push(limpio);
  }
  return { valores };
}

/** El estado de Meta, en el nuestro. `null` si el evento no cambia el estado (una marca de riesgo, un borrado). */
export function estadoDeMeta(estado: string | null | undefined): EstadoPlantilla | null {
  switch (String(estado ?? "").toUpperCase()) {
    case "APPROVED":
    case "REINSTATED":
      return "aprobada";
    case "PENDING":
    case "IN_REVIEW":
    case "IN_APPEAL":
    case "SUBMITTED":
      return "pendiente";
    case "REJECTED":
      return "rechazada";
    case "PAUSED":
      return "pausada";
    case "DISABLED":
      return "deshabilitada";
    default:
      return null;
  }
}

/** La calidad de Meta (verde, amarillo, rojo), en la nuestra. */
export function calidadDeMeta(puntaje: string | null | undefined): Calidad | null {
  switch (String(puntaje ?? "").toUpperCase()) {
    case "GREEN":
      return "alta";
    case "YELLOW":
      return "media";
    case "RED":
      return "baja";
    case "UNKNOWN":
      return "pendiente";
    default:
      return null;
  }
}

export function categoriaDeMeta(categoria: string | null | undefined): CategoriaMeta | null {
  const c = String(categoria ?? "").toLowerCase();
  return c === "marketing" || c === "utility" || c === "authentication" ? c : null;
}

/** «en-US» y «en_US» son el mismo idioma. */
export const normalizarIdioma = (c: string): string => c.trim().replace(/-/g, "_").toLowerCase();

/** El límite de envío que avisa Meta (`TIER_10K`), en palabras («10.000 conversaciones cada 24 h»). */
export function textoLimite(tier: string | null | undefined): string | null {
  switch (String(tier ?? "").toUpperCase()) {
    case "TIER_50":
      return "50";
    case "TIER_250":
      return "250";
    case "TIER_1K":
      return "1.000";
    case "TIER_2K":
      return "2.000";
    case "TIER_10K":
      return "10.000";
    case "TIER_100K":
      return "100.000";
    case "TIER_UNLIMITED":
      return "Sin límite";
    default:
      return null;
  }
}

/** Una plantilla tal como la lista Meta (360dialog), ya en nuestros términos. */
export interface PlantillaDeMeta {
  metaId: string;
  nombre: string;
  idioma: string;
  estado: EstadoPlantilla | null;
  categoria: CategoriaMeta | null;
  calidad: Calidad | null;
  motivo: string | null;
  encabezado: string | null;
  cuerpo: string;
  pie: string | null;
  botones: string[];
  ejemplos: string[];
}

/** La lista de plantillas que devuelve Meta (`data`), ya entendida. Lo que no tiene nombre o id se ignora. */
export function leerListaMeta(data: unknown): PlantillaDeMeta[] {
  const salida: PlantillaDeMeta[] = [];
  for (const t of Array.isArray(data) ? data.map(obj) : []) {
    const metaId = t.id !== undefined && t.id !== null ? String(t.id) : null;
    const nombre = texto(t.name);
    if (!metaId || !nombre) continue;
    const motivo = texto(t.rejected_reason);
    salida.push({
      metaId,
      nombre,
      idioma: texto(t.language) ?? "es",
      estado: estadoDeMeta(texto(t.status)),
      categoria: categoriaDeMeta(texto(t.category)),
      calidad: calidadDeMeta(texto(obj(t.quality_score).score)),
      motivo: motivo && motivo.toUpperCase() !== "NONE" ? motivo : null,
      ...desdeComponentes(t.components),
    });
  }
  return salida;
}
