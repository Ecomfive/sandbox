/**
 * Lo que dicen las páginas públicas de un video de **TikTok** y de una publicación de **Facebook** (sin iniciar sesión), igual que se
 * hace con Instagram (`vista-previa.ts`, `embed.ts`). Es un dato **no oficial**: las redes pueden cambiar el formato o dejar de
 * responder a los servidores, y entonces la captura se guarda sin esos datos (se pueden completar a mano).
 *
 * - **TikTok** (probado el 15 oct 2026): la página del video trae un bloque `__UNIVERSAL_DATA_FOR_REHYDRATION__` con el texto, la cuenta,
 *   la fecha, las cifras (me gusta, comentarios, compartidos, vistas) y la dirección del video y de su portada.
 * - **Facebook**: la vista previa (`og:title`, `og:description`) trae el texto y, en el título, las reproducciones y reacciones
 *   («2,8 mill. reproducciones · 1353 reacciones | texto | Facebook»). No trae el nombre de la página ni el archivo.
 */
export interface DatosTikTok {
  copy: string | null;
  /** El usuario de la cuenta (`scout2015`). */
  usuario: string | null;
  /** El nombre con que se muestra la cuenta («Scout, Suki & Stella»): sirve como nombre de la página. */
  nombre: string | null;
  /** AAAA-MM-DD */
  fecha: string | null;
  megusta: number | null;
  comentarios: number | null;
  compartidos: number | null;
  /** Las veces que lo guardaron (el ícono de marcador de la página del video). */
  guardados: number | null;
  vistas: number | null;
  /** La dirección canónica del video, con su cuenta y su id. */
  enlace: string | null;
  videoUrl: string | null;
  duracion: number | null;
}

export interface DatosFacebook {
  copy: string | null;
  vistas: number | null;
  /** Las reacciones (me gusta y demás) de la publicación. */
  reacciones: number | null;
  comentarios: number | null;
  compartidos: number | null;
  /** La dirección canónica (`og:url`). */
  enlace: string | null;
  /** La dirección de la imagen de la publicación (`og:image`): la foto de un anuncio o de un post que no es video. Null si no trae o no es de la red de archivos de Facebook. */
  imagen: string | null;
  /** El nombre de la página, cuando el título de la vista previa es solo eso (una publicación que no es video: «Custom Venezuela»). */
  nombrePagina: string | null;
  /** El id de la página (o persona) dueña de la publicación, que está en el código de la página: con él se abre la página y se saca su nombre. */
  paginaId: string | null;
}

/** Lo que dice la página de Facebook (la del anunciante) en su vista previa. */
export interface DatosPaginaFacebook {
  /** El nombre de la página («Nuvo Venezuela»). */
  nombre: string | null;
  /** Su nombre en la dirección (`facebook.com/nuvovenezuela/` → `nuvovenezuela`); null si la dirección es solo un número. */
  usuario: string | null;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const cuenta = (v: unknown): number | null => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
};
const texto = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Solo se descarga un video de la red de archivos de TikTok (https), nunca de otro sitio que ponga el bloque de datos. */
export function archivoTikTokPermitido(url: unknown): string | null {
  if (typeof url !== "string" || url.length > 4000) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)(tiktok\.com|tiktokcdn\.com|tiktokcdn-us\.com|tiktokv\.com|tiktokv\.us|byteoversea\.com|ibytedtos\.com|muscdn\.com)$/i.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * La fecha (AAAA-MM-DD) de un instante, en la hora de Panamá (la de Costa Rica y Panamá, donde está el equipo): en UTC un video publicado
 * a las 10 de la noche salía con la fecha del día siguiente (TikTok lo muestra «10-8» y se guardaba 2026-10-09).
 */
export function fechaEnPanama(segundos: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(segundos * 1000));
}

/** Lo que se aprovecha de la página de un video de TikTok, o null si no trae los datos del video (bloqueada, borrada o privada). */
export function interpretarTikTok(html: string): DatosTikTok | null {
  const m = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return null;
  let datos: unknown;
  try {
    datos = JSON.parse(m[1]);
  } catch {
    return null;
  }
  const alcance = esObjeto(datos) && esObjeto(datos.__DEFAULT_SCOPE__) ? datos.__DEFAULT_SCOPE__ : null;
  const detalle = alcance && esObjeto(alcance["webapp.video-detail"]) ? alcance["webapp.video-detail"] : null;
  const info = detalle && esObjeto(detalle.itemInfo) ? detalle.itemInfo : null;
  const item = info && esObjeto(info.itemStruct) ? info.itemStruct : null;
  if (!item) return null;
  const autor = esObjeto(item.author) ? item.author : null;
  const stats = esObjeto(item.stats) ? item.stats : {};
  const video = esObjeto(item.video) ? item.video : {};
  const usuario = typeof autor?.uniqueId === "string" && /^[\w.]{1,40}$/.test(autor.uniqueId) ? autor.uniqueId : null;
  const id = typeof item.id === "string" && /^\d{8,25}$/.test(item.id) ? item.id : null;
  const segundos = typeof item.createTime === "string" || typeof item.createTime === "number" ? Number(item.createTime) : NaN;
  const salida: DatosTikTok = {
    copy: texto(item.desc, 4000),
    usuario,
    nombre: texto(autor?.nickname, 120),
    fecha: Number.isFinite(segundos) && segundos > 0 ? fechaEnPanama(segundos) : null,
    megusta: cuenta(stats.diggCount),
    comentarios: cuenta(stats.commentCount),
    compartidos: cuenta(stats.shareCount),
    guardados: cuenta(stats.collectCount),
    vistas: cuenta(stats.playCount),
    enlace: usuario && id ? `https://www.tiktok.com/@${usuario}/video/${id}` : null,
    videoUrl: archivoTikTokPermitido(video.playAddr) ?? archivoTikTokPermitido(video.downloadAddr),
    duracion: typeof video.duration === "number" && Number.isFinite(video.duration) ? video.duration : null,
  };
  return Object.values(salida).some((v) => v !== null) ? salida : null;
}

/** Las pocas entidades HTML que traen las vistas previas: &amp; &quot; &lt; &gt; &nbsp; y las numéricas (&#xfa; &#039;). */
export function decodificarHtml(t: string): string {
  return t
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/**
 * Una cifra como la escribe Facebook según el idioma: «1353», «1.353», «12 mil», «2,8 mill.», «2.8M», «1.3K», «1,2 K».
 * Con una palabra o letra de magnitud, el último punto o coma es el decimal; sin ella, son separadores de miles.
 */
export function cifraLocalizada(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.replace(/ /g, " ").trim().match(/^([\d][\d.,\s]*)\s*(mil millones|millones|mill\.?|mil|bil\.?|[KkMmBb])?\.?$/);
  if (!m) return null;
  const factores: Record<string, number> = { "mil millones": 1e9, millones: 1e6, "mill": 1e6, "mill.": 1e6, mil: 1e3, "bil": 1e9, "bil.": 1e9, k: 1e3, m: 1e6, b: 1e9 };
  const sufijo = (m[2] ?? "").toLowerCase();
  if (sufijo) {
    const decimal = Number(m[1].replace(/\s/g, "").replace(/[.,](?=\d{3}(?:\D|$))/g, "").replace(",", "."));
    return Number.isFinite(decimal) ? Math.round(decimal * (factores[sufijo] ?? 1)) : null;
  }
  const entero = Number(m[1].replace(/[.,\s]/g, ""));
  return Number.isFinite(entero) ? entero : null;
}

const META = /<meta\s+(?:property|name)="og:([a-z:_]+)"\s+content="([^"]*)"/gi;
/** La primera parte del título de una publicación: «2,8 mill. reproducciones · 1353 reacciones · 52 comentarios». */
const CIFRAS_FB = /^\s*\d[\d.,\s]*\s*(?:mil millones|millones|mill\.?|mil|[KkMmBb])?\.?\s+(?:reproduc|visualiz|vistas|views|plays|reacc|reactions|me gusta|likes|comentarios|comments|veces compartido|compartidos|shares)/i;

/** Lo que se aprovecha de la vista previa de una publicación de Facebook, o null si trae nada (pide iniciar sesión, borrada o privada). */
export function interpretarFacebook(html: string): DatosFacebook | null {
  const og: Record<string, string> = {};
  for (const m of html.matchAll(META)) if (!(m[1] in og)) og[m[1]] = decodificarHtml(m[2]);
  const titulo = og.title ?? "";
  // Una página que pide iniciar sesión dice «Inicia sesión o regístrate para verlo»: no es una publicación.
  if (!og.title || /inicia sesi[oó]n|log in|log into|sign up|reg[ií]strate/i.test(titulo)) return null;
  const partes = titulo.split(" | ");
  // El título es «cifras | texto completo | nombre de la página» (antes la última parte era «Facebook»). Las cifras se reconocen por su contenido, no por
  // cuántas partes tenga el título: sin la última parte, o con el texto cortado, las cifras dejaban de leerse.
  const traeCifras = partes.length >= 2 && CIFRAS_FB.test(partes[0]);
  const estadisticas = traeCifras ? partes[0] : "";
  const resto = traeCifras ? partes.slice(1) : partes.length >= 3 ? partes.slice(1) : [];
  const ultima = resto.length >= 2 ? resto[resto.length - 1].trim() : "";
  const nombreDelTitulo = ultima && !/^facebook$/i.test(ultima) ? ultima : null;
  const textoDelTitulo = resto.length >= 2 ? resto.slice(0, -1).join(" | ") : resto.join(" | ");
  // La descripción viene cortada a 200 caracteres con «...»; el título trae el texto completo.
  const descripcion = texto(og.description, 4000);
  const copyCompleto = textoDelTitulo.trim() && (!descripcion || textoDelTitulo.trim().length >= descripcion.replace(/\.{3}$/, "").length) ? texto(textoDelTitulo, 4000) : null;
  const leer = (palabras: string): number | null => {
    const r = new RegExp(`([\\d][\\d.,\\s]*\\s*(?:mil millones|millones|mill\\.?|mil|[KkMmBb])?\\.?)\\s+(?:${palabras})`, "i").exec(estadisticas);
    return r ? cifraLocalizada(r[1]) : null;
  };
  const salida: DatosFacebook = {
    copy: copyCompleto ?? descripcion ?? (textoDelTitulo.trim() ? texto(textoDelTitulo, 4000) : null),
    vistas: leer("reproducciones|visualizaciones|vistas|views|plays"),
    reacciones: leer("reacciones|reactions|me gusta|likes"),
    comentarios: leer("comentarios|comments"),
    compartidos: leer("veces compartido|compartidos|shares"),
    enlace: og.url && /^https:\/\/(www\.|m\.|web\.)?facebook\.com\//.test(og.url) ? og.url.slice(0, 2000) : null,
    imagen: archivoFacebookPermitido(og.image),
    nombrePagina: partes.length === 1 && !/\d[ \u00a0]*(reproduc|vistas|views|reacc|reactions|me gusta|likes|comentarios|comments)/i.test(titulo) ? texto(titulo.replace(/ [|·-] Facebook$/, ""), 120) : texto(nombreDelTitulo, 120),
    paginaId: /"pageID":"(\d{5,25})"/.exec(html)?.[1] ?? /"owner":\{"__typename":"[A-Za-z]+","id":"(\d{5,25})"/.exec(html)?.[1] ?? null,
  };
  return Object.values(salida).some((v) => v !== null) ? salida : null;
}

/** La vista previa de la página de un anunciante en Facebook (`facebook.com/<id>`): su nombre y su nombre de usuario. Null si pide iniciar sesión. */
export function interpretarPaginaFacebook(html: string): DatosPaginaFacebook | null {
  const og: Record<string, string> = {};
  for (const m of html.matchAll(META)) if (!(m[1] in og)) og[m[1]] = decodificarHtml(m[2]);
  const titulo = texto(og.title, 200);
  if (!titulo || /inicia sesi[oó]n|log in|log into|sign up|reg[ií]strate|facebook - (log|inicia)/i.test(titulo)) return null;
  const ruta = og.url && /^https:\/\/(www\.|m\.|web\.)?facebook\.com\//.test(og.url) ? new URL(og.url).pathname : "";
  const candidato = /^\/([A-Za-z][\w.-]{1,79})\/?$/.exec(ruta)?.[1] ?? null;
  // `profile.php?id=…` y otras rutas de Facebook (`.php`) no son un nombre de usuario.
  const usuario = candidato && !/\.php$/i.test(candidato) ? candidato : null;
  return { nombre: titulo, usuario };
}

/** Solo se descarga un video de la red de archivos de Facebook (https), nunca de otro sitio que ponga el bloque de datos. */
export function archivoFacebookPermitido(url: unknown): string | null {
  if (typeof url !== "string" || url.length > 6000) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(^|\.)(fbcdn\.net|fbsbx\.com|facebook\.com)$/i.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Las direcciones del video que trae la página de «insertar» de Facebook (`plugins/video.php`): la de alta calidad y la normal. */
export function archivosDeEmbedFacebook(html: string): { hd: string | null; sd: string | null } {
  // El valor es una cadena JSON (con `\/` y `&`): se lee tal cual y se decodifica con JSON.parse.
  const leer = (m: RegExpExecArray | null): string | null => {
    if (!m) return null;
    try {
      return archivoFacebookPermitido(JSON.parse(`"${m[1]}"`));
    } catch {
      return null;
    }
  };
  return { hd: leer(/"hd_src":"((?:[^"\\]|\\.)*)"/.exec(html)), sd: leer(/"sd_src":"((?:[^"\\]|\\.)*)"/.exec(html)) };
}
