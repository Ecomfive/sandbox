// Anuncios Meta › ángulo de cada video (18 nov 2026, pedido de Alcides): el ángulo no va en el nombre de la campaña, así que sale de lo que dice y muestra el video. Una IA (Gemini) ve el video completo y devuelve, en un JSON,
// el ángulo (el motivo de compra que usa), la promesa, el gancho de los primeros segundos, lo que dice y a quién le habla. Aquí está lo puro, con prueba: el pedido, la validación de lo que contesta la IA (nunca se confía en ella:
// largos, tipos y texto limpio) y cómo se reutiliza un ángulo que ya existe para que «Dolor de espalda» y «dolor de espalda.» no sean dos ángulos.

import { ganchoTipoValido, TIPOS_GANCHO } from "./ganchos";
import { claveDeTexto, embellecer } from "./nombre";

/** Sube cuando el análisis pide más cosas al video: «Analizar los pendientes» vuelve a ver los de una versión menor. 1 = ángulo, promesa, gancho…; 2 = estructura, llamado a la acción, oferta y recursos. */
export const VERSION_ANALISIS = 2;
/**
 * Con qué regla de ángulo se analizó un video (23 nov 2026, pedido de Alcides): la 3 pide un ángulo específico y sacado solo de lo que se ve y se dice en el video, no del texto del anuncio. Es aparte de `VERSION_ANALISIS`
 * (que dice si el análisis trae estructura y llamado a la acción) para que subirla vuelva a analizar todos los videos sin dejar sin datos de estructura a los que aún no se reanalizaron.
 */
export const VERSION_ANGULO = 5;

/**
 * Nombres que no dicen nada del motivo de compra (24 nov 2026: «Beneficios clave» llegó a 806 de 2.579 videos y seguía saliendo en el reanálisis, porque estaba en la lista de ángulos existentes). La IA no los
 * debe usar ni se le ofrecen para reutilizar: tiene que decir cuál es el beneficio.
 */
export const ANGULOS_VAGOS = ["Beneficios clave", "Beneficios", "Beneficios del producto", "Resultados", "Calidad", "Producto", "Características", "Vitalidad masculina", "Energía masculina", "Salud masculina", "Bienestar masculino"];
const clavesVagas = new Set(ANGULOS_VAGOS.map((a) => claveDeTexto(a)));
/** Una palabra general más el público («Vitalidad masculina», «Energía masculina», «Salud femenina»…): junta motivos de compra distintos (el ejemplo de la persona que lleva las campañas: energía, gimnasio, salud prostática y aumento de libido no son «vitalidad masculina»). */
const GENERICO_DE_PUBLICO = /^(ENERGIA|VITALIDAD|SALUD|BIENESTAR|RENDIMIENTO|POTENCIA|FUERZA)(MASCULIN[OA]|FEMENIN[OA])$/;
export const esAnguloVago = (a: string): boolean => clavesVagas.has(claveDeTexto(a)) || GENERICO_DE_PUBLICO.test(claveDeTexto(a));

/** Las tácticas generales que se dejan como ángulo para poder compararlas entre productos, y que llevan aparte su detalle (de qué es). */
export const ANGULOS_TACTICOS = ["Antes y después", "Testimonio de cliente", "Experto o autoridad"];
const clavesTacticas = new Set(ANGULOS_TACTICOS.map((a) => claveDeTexto(a)));
export const esAnguloTactico = (a: string): boolean => clavesTacticas.has(claveDeTexto(a));

export interface AnalisisVideo {
  angulo: string;
  /** Solo para las tácticas generales («Antes y después», «Testimonio de cliente», «Experto o autoridad»): de qué es. Vacío en los demás ángulos. */
  anguloDetalle: string;
  promesa: string;
  gancho: string;
  /** El tipo de gancho, de la lista fija de `ganchos.ts`; null si la IA no contestó uno válido (se clasifica después con el texto del gancho). */
  ganchoTipo: string | null;
  resumen: string;
  transcripcion: string;
  publico: string;
  formato: string;
  /** El llamado a la acción tal como lo dice o lo escribe el anuncio («Pide el tuyo con pago contra entrega»); vacío si no hay. */
  cta: string;
  /** El segundo (aproximado) en que aparece por primera vez; null si no se sabe o el video no lo trae. */
  ctaSegundo: number | null;
  ctaTipo: string;
  /** La oferta concreta (descuento, 2x1, envío gratis, garantía, precio…); vacío si no hay. */
  oferta: string;
  recursos: string[];
  /** Cómo se arma el video, parte por parte y con sus segundos. */
  estructura: ParteVideo[];
}

export interface ParteVideo {
  parte: string;
  desde: number | null;
  hasta: number | null;
  resumen: string;
}

export const PARTES_VIDEO = ["gancho", "problema", "solución", "demostración", "prueba social", "oferta", "llamado a la acción", "cierre", "otro"] as const;
export const TIPOS_CTA = ["compra directa", "oferta o descuento", "urgencia o escasez", "pedir información", "mensaje o WhatsApp", "otro", "ninguno"] as const;
export const RECURSOS_VIDEO = ["prueba social", "demostración del producto", "antes y después", "testimonio", "persona hablando a cámara", "voz en off", "texto en pantalla", "subtítulos", "música", "precio mencionado", "garantía", "pago contra entrega", "envío gratis", "urgencia", "comparación", "experto o autoridad"] as const;

export const FORMATOS_VIDEO = ["testimonio", "demostración", "antes y después", "UGC", "animación", "oferta", "otro"] as const;

export interface ContextoPedido {
  producto: string | null;
  copy: string | null;
  titulo: string | null;
  /** Los ángulos que ya existen (de otros videos), para reutilizarlos si encajan. */
  angulosExistentes: string[];
  /** El video no se pudo bajar: se analiza solo con el texto del anuncio (y la miniatura, si la hay). */
  soloTexto: boolean;
  /**
   * Segundo intento tras un bloqueo por «recitation» (Gemini corta la respuesta cuando va a repetir palabra por palabra un texto que reconoce, como una canción o un discurso famoso): no se transcribe nada y todo
   * se cuenta con palabras propias.
   */
  sinTranscribir?: boolean;
}

const recorte = (t: string | null | undefined, max: number) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** Cómo se pide el ángulo (lo mismo en el análisis completo y en el reanálisis solo del ángulo): específico, con ejemplos y sin forzar uno amplio que ya existe. */
export function lineasDeAngulo(existentes: string[]): string[] {
  // Los ángulos vagos ya existentes no se ofrecen para reutilizar: es lo que hacía que «Beneficios clave» se repitiera.
  existentes = existentes.filter((a) => !esAnguloVago(a));
  return [
    "Dime el ÁNGULO: el motivo concreto de compra que usa ESTE anuncio para convencer (por ejemplo «Dolor de espalda», «Antes y después», «Oferta 2x1», «Testimonio de cliente», «Ahorro», «Regalo», «Piel más firme»). Son de 2 a 5 palabras, en español, sin signos.",
    "Sé ESPECÍFICO: nombra el motivo concreto de compra, no la categoría general del producto ni a quién va dirigido. Ejemplo de quien lleva las campañas: un producto para el público masculino se puede vender con ángulos de «Energía», «Gimnasio», «Salud prostática» o «Aumento de libido»; son ángulos distintos y NO se deben resumir en «Vitalidad masculina» ni en «Energía masculina». Haz lo mismo con cualquier producto: separa por el motivo concreto que usa ESTE anuncio (para una crema, «Manchas en la cara», «Arrugas y firmeza» y «Piel seca» son distintos; para un aceite, «Caída del cabello» y «Crecimiento de la barba»; para algo femenino, «Aclarar zonas íntimas» y «Bienestar íntimo» no son lo mismo que «Salud femenina»). Si el anuncio toca varios motivos, elige el que más tiempo ocupa o el del gancho.",
    `Si el ángulo es una táctica general (${ANGULOS_TACTICOS.map((a) => `«${a}»`).join(", ")}), ponla tal cual en "angulo" para poder compararla entre productos, y en "angulo_detalle" di de qué es, en pocas palabras: de qué motivo concreto es el antes y después («salud prostática», «manchas en la cara»), de qué habla el testimonio («caída del cabello», «aumento de libido») o quién es el experto y de qué («urólogo, salud prostática», «dermatóloga, acné»). El detalle usa el mismo lenguaje que los ángulos: el motivo de compra, no «beneficios». Para cualquier otro ángulo deja "angulo_detalle" vacío.`,
    `Nombres vagos como ${ANGULOS_VAGOS.slice(0, 4).map((a) => `«${a}»`).join(", ")} NO sirven: no dicen nada. Di cuál es el beneficio o el problema concreto del que habla el video (por ejemplo «Alivio de varices», «Piel sin manchas», «Dientes más blancos», «Más energía en el gimnasio»).`,
    existentes.length ? `Estos ángulos ya existen en otros videos: ${existentes.map((a) => `«${a}»`).join(", ")}. Usa EXACTAMENTE uno de ellos solo si describe igual de específico el motivo de compra de este anuncio; si el de aquí es más específico o distinto, propón uno nuevo. No fuerces un ángulo amplio para que coincida.` : "",
  ];
}

/**
 * Reanálisis solo del ángulo (23 nov 2026, pedido de Alcides): con la regla nueva (específico y sacado únicamente del video) se vuelve a pedir **solo el ángulo** de los videos que ya estaban analizados, sin repetir
 * la estructura, el llamado a la acción ni la transcripción: es un pedido corto y más barato.
 */
export function pedidoSoloAngulo(c: { producto: string | null; angulosExistentes: string[]; /** La respuesta anterior de la IA, si fue demasiado vaga: se le dice para que no la repita. */ vagoAnterior?: string }): string {
  return [
    "Eres analista de publicidad de una tienda en línea (dropshipping, Latinoamérica). Mira el video completo del anuncio y escucha lo que dice.",
    ...lineasDeAngulo(c.angulosExistentes.slice(0, 40)),
    "El ángulo sale ÚNICAMENTE de lo que se ve y se dice en el video (el guion, la historia, el problema que muestra, el beneficio que destaca), no de ningún texto escrito del anuncio.",
    c.producto ? `Producto de la campaña: ${recorte(c.producto, 80)}.` : "",
    c.vagoAnterior ? `Tu respuesta anterior fue «${recorte(c.vagoAnterior, 60)}», que es demasiado vaga: vuelve a ver el video y di el beneficio o problema concreto.` : "",
    'Contesta SOLO un JSON, sin texto antes ni después: {"angulo": "…", "angulo_detalle": "…"}',
  ]
    .filter(Boolean)
    .join("\n");
}

/** El pedido a la IA: qué mirar y el JSON exacto que debe devolver. */
export function pedidoAnalisisVideo(c: ContextoPedido): string {
  const existentes = c.angulosExistentes.slice(0, 40);
  return [
    c.soloTexto ? "Eres analista de publicidad de una tienda en línea (dropshipping, Latinoamérica). No hay video: analiza el anuncio por su texto y su imagen." : "Eres analista de publicidad de una tienda en línea (dropshipping, Latinoamérica). Mira el video completo del anuncio y escucha lo que dice.",
    ...lineasDeAngulo(existentes),
    c.producto ? `Producto de la campaña: ${recorte(c.producto, 80)}.` : "",
    // Con el video a la vista, el ángulo sale del video: el texto del anuncio suele ser general y poco detallado, así que no se le muestra a la IA (solo sirve cuando no hay video).
    c.soloTexto && c.copy ? `Texto principal del anuncio: «${recorte(c.copy, 500)}».` : "",
    c.soloTexto && c.titulo ? `Título del anuncio: «${recorte(c.titulo, 120)}».` : "",
    c.soloTexto ? "" : "El ángulo sale ÚNICAMENTE de lo que se ve y se dice en el video (el guion, la historia, el problema que muestra, el beneficio que destaca), no del texto escrito del anuncio, que suele ser general.",
    "Contesta SOLO un JSON, sin texto antes ni después, con estas llaves:",
    '{"angulo": "…", "angulo_detalle": "…", "promesa": "lo que promete el anuncio, en una frase", "gancho": "lo que se ve y se dice en los primeros 3 segundos", "gancho_tipo": "uno de: ' + TIPOS_GANCHO.join(", ") + '", "resumen": "de qué trata, en 2 o 3 frases", "transcripcion": ' + (c.sinTranscribir ? '"" (déjala vacía)' : '"lo que se dice, hasta 1200 caracteres; vacío si no habla nadie"') + ', "publico": "a quién le habla", "formato": "uno de: ' + FORMATOS_VIDEO.join(", ") + '", "cta": "el llamado a la acción tal como se dice o se escribe; vacío si no hay", "cta_segundo": segundo aproximado en que aparece por primera vez (un número entero) o null, "cta_tipo": "uno de: ' + TIPOS_CTA.join(", ") + '", "oferta": "la oferta concreta (descuento, 2x1, envío gratis, garantía, precio); vacío si no hay", "recursos": ["los que use el video, de esta lista: ' + RECURSOS_VIDEO.join(", ") + '"], "estructura": [{"parte": "una de: ' + PARTES_VIDEO.join(", ") + '", "desde": segundo de inicio, "hasta": segundo de fin, "resumen": "qué pasa en esa parte, en una frase"}]}',
    c.soloTexto ? "Como no hay video, deja cta_segundo en null, recursos y estructura vacíos." : "En estructura pon de 3 a 8 partes en orden, con los segundos reales del video; la primera es el gancho.",
    c.sinTranscribir ? "No copies ni transcribas literalmente lo que se dice, la letra de una canción ni el texto del anuncio: cuéntalo todo con tus propias palabras." : "",
    "No inventes: si algo no se ve o no se oye, déjalo vacío.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** La llave con la que se compara un ángulo: sin acentos, mayúsculas ni signos. */
export const claveDeAngulo = (a: string): string => claveDeTexto(a);

/** Si el ángulo nuevo es el mismo de uno que ya existe (aunque cambien mayúsculas, acentos o signos), devuelve el que ya existe. */
export function reutilizarAngulo(nuevo: string, existentes: string[]): string {
  const k = claveDeAngulo(nuevo);
  return existentes.find((e) => claveDeAngulo(e) === k) ?? nuevo;
}

/** Lo que contestó la IA, validado: el ángulo es obligatorio; todo se recorta y se limpia. Null si no se puede usar. */
export function normalizarAnalisisVideo(texto: string | null | undefined, existentes: string[] = []): AnalisisVideo | null {
  if (!texto) return null;
  const limpio = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const inicio = limpio.indexOf("{");
  const fin = limpio.lastIndexOf("}");
  if (inicio < 0) return null;
  let o: Record<string, unknown> | null = null;
  try {
    const v: unknown = fin > inicio ? JSON.parse(limpio.slice(inicio, fin + 1)) : null;
    if (v && typeof v === "object" && !Array.isArray(v)) o = v as Record<string, unknown>;
  } catch {
    o = null;
  }
  // Una respuesta cortada a la mitad (terminó por el largo) o con una coma de más no se tira: se rescata lo que alcanzó a escribir, que casi siempre incluye el ángulo.
  o ??= camposSueltos(limpio.slice(inicio));
  if (!o) return null;
  const s = (k: string, max: number) => recorte(typeof o[k] === "string" ? (o[k] as string) : "", max);
  const bruto = s("angulo", 120).replace(/[«»"“”.,;:!?¿¡]/g, "").trim();
  const palabras = bruto.split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return null;
  // Un ángulo largo se acorta a sus primeras palabras en vez de descartar todo el análisis.
  const angulo = reutilizarAngulo(embellecer(palabras.slice(0, 8).join(" ")), existentes);
  const formato = s("formato", 30).toLowerCase();
  return {
    angulo,
    anguloDetalle: esAnguloTactico(angulo) ? s("angulo_detalle", 120).replace(/[«»"“”]/g, "").replace(/[.;:!?]+$/, "").trim() : "",
    promesa: s("promesa", 240),
    gancho: s("gancho", 300),
    ganchoTipo: ganchoTipoValido(o.gancho_tipo),
    resumen: s("resumen", 500),
    transcripcion: s("transcripcion", 1200),
    publico: s("publico", 160),
    formato: (FORMATOS_VIDEO as readonly string[]).find((f) => f.toLowerCase() === formato) ?? "otro",
    cta: s("cta", 200),
    ctaSegundo: segundo(o.cta_segundo),
    ctaTipo: (TIPOS_CTA as readonly string[]).find((t) => t.toLowerCase() === s("cta_tipo", 40).toLowerCase()) ?? (s("cta", 200) ? "otro" : "ninguno"),
    oferta: s("oferta", 200),
    recursos: recursosValidos(o.recursos),
    estructura: estructuraValida(o.estructura),
  };
}

/** De un JSON que no se pudo leer entero (cortado o mal cerrado), saca los textos y números simples que sí se alcanzan a leer. Null si no hay ninguno. */
export function camposSueltos(texto: string): Record<string, unknown> | null {
  const o: Record<string, unknown> = {};
  for (const m of texto.matchAll(/"([a-z_]+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    if (m[1] in o) continue;
    try {
      o[m[1]] = JSON.parse(`"${m[2]}"`);
    } catch {
      o[m[1]] = m[2];
    }
  }
  const n = /"cta_segundo"\s*:\s*(\d+)/.exec(texto);
  if (n) o.cta_segundo = Number(n[1]);
  return Object.keys(o).length > 0 ? o : null;
}

/** Un segundo del video: entero de 0 a 3 600; lo demás es «no se sabe». */
function segundo(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 3600 ? Math.round(n) : null;
}

/** Solo los recursos de la lista, sin repetir y en el orden en que se dieron. */
export function recursosValidos(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const ok = new Set<string>();
  for (const x of v) {
    const t = typeof x === "string" ? x.trim().toLowerCase() : "";
    const r = (RECURSOS_VIDEO as readonly string[]).find((y) => y.toLowerCase() === t);
    if (r) ok.add(r);
  }
  return [...ok];
}

/** Las partes del video, validadas: hasta 8, con la parte de la lista, segundos coherentes (el fin no antes del inicio) y el resumen recortado. */
export function estructuraValida(v: unknown): ParteVideo[] {
  if (!Array.isArray(v)) return [];
  const partes: ParteVideo[] = [];
  for (const x of v.slice(0, 8)) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const nombre = typeof o.parte === "string" ? o.parte.trim().toLowerCase() : "";
    const resumen = recorte(typeof o.resumen === "string" ? o.resumen : "", 200);
    if (!resumen) continue;
    const desde = segundo(o.desde);
    let hasta = segundo(o.hasta);
    if (desde !== null && hasta !== null && hasta < desde) hasta = desde;
    partes.push({ parte: (PARTES_VIDEO as readonly string[]).find((p) => p === nombre) ?? "otro", desde, hasta, resumen });
  }
  return partes;
}

/** El ángulo de una campaña según sus videos: el que más gasto lleva (gasto de los anuncios con video analizado). */
export function anguloDeCampana(videos: { angulo: string; gasto: number }[]): string | null {
  const suma = new Map<string, number>();
  for (const v of videos) suma.set(v.angulo, (suma.get(v.angulo) ?? 0) + Math.max(v.gasto, 0.01));
  return [...suma].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** Los hosts de los que se baja un video de Meta (su red de archivos): nada más, para que una dirección ajena nunca se descargue. */
export function esHostDeVideoMeta(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname.endsWith(".fbcdn.net") || u.hostname.endsWith(".facebook.com") || u.hostname.endsWith(".fbsbx.com"));
  } catch {
    return false;
  }
}
