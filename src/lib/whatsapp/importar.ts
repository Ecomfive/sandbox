// Importar un chat exportado desde el celular (pedido de Hernán, 28 oct 2026): el archivo de texto que da WhatsApp con «Exportar chat»
// (Android o iPhone, en español o en inglés), con o sin archivos. Lee cada mensaje con su fecha, quién lo escribió, el texto y el
// archivo que lo acompaña. Sin base ni red, con prueba.

/** Un mensaje leído del archivo exportado, todavía sin saber si es «nuestro» o del dropshipper. */
export interface MensajeExportado {
  /** Fecha y hora tal como las muestra el celular (sin zona): «2026-10-28T16:13:05». */
  local: string;
  autor: string;
  texto: string | null;
  /** El archivo que lo acompaña (nombre dentro de la exportación), si vino. */
  archivo: string | null;
  /** Lo que es: texto, imagen, audio, video, sticker o documento. */
  tipo: TipoImportado;
  /** Un archivo que WhatsApp no incluyó en la exportación («<Multimedia omitido>», «imagen omitida»). */
  omitido: boolean;
}

export type TipoImportado = "texto" | "imagen" | "audio" | "video" | "sticker" | "documento";

const ESPACIOS = /[   ]/g;
const MARCAS = /[‎‏‪-‮⁦-⁩]/g;

/** El encabezado de cada mensaje: «28/10/26, 4:13 p. m. - Nombre: …» (Android) o «[28/10/26, 4:13:05 p. m.] Nombre: …» (iPhone). */
const ENCABEZADO = /^\[?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s(\d{1,2}):(\d{2})(?::(\d{2}))?\s?([ap]\.?\s?m\.?|[ap]m)?\]?\s?(?:-\s)?(.*)$/i;

/** Un archivo que sí vino: «IMG-20261028-WA0003.jpg (archivo adjunto)» (Android) o «<adjunto: 00000012-PHOTO-….jpg>» (iPhone). */
const ADJUNTO_ANDROID = /^(.+?\.[A-Za-z0-9]{2,5}) \((?:archivo adjunto|file attached|arquivo anexado)\)\s*([\s\S]*)$/i;
const ADJUNTO_IPHONE = /^<(?:adjunto|attached|anexo):\s*(.+?)>\s*([\s\S]*)$/i;

/** Lo que WhatsApp no incluyó: «<Multimedia omitido>», «<Media omitted>», «imagen omitida», «audio omitido»… */
const OMITIDO: { re: RegExp; tipo: TipoImportado }[] = [
  { re: /^<?(?:multimedia omitido|media omitted|arquivo de mídia oculto)>?$/i, tipo: "documento" },
  { re: /^(?:imagen omitida|image omitted|foto omitida)$/i, tipo: "imagen" },
  { re: /^(?:audio omitido|audio omitted|áudio omitido)$/i, tipo: "audio" },
  { re: /^(?:video omitido|video omitted|vídeo omitido)$/i, tipo: "video" },
  { re: /^(?:sticker omitido|sticker omitted|stickers omitidos)$/i, tipo: "sticker" },
  { re: /^(?:documento omitido|document omitted|gif omitido|gif omitted)$/i, tipo: "documento" },
];

/** Lo que el sistema dice en lugar de un archivo que no vino en la exportación. */
export const TEXTO_OMITIDO: Record<TipoImportado, string> = {
  texto: "Archivo que no venía en la exportación",
  imagen: "Foto (no venía en la exportación)",
  audio: "Audio (no venía en la exportación)",
  video: "Video (no venía en la exportación)",
  sticker: "Sticker (no venía en la exportación)",
  documento: "Archivo (no venía en la exportación)",
};

/** Qué es un archivo por su extensión (la revisión de verdad, por su contenido, se hace al servirlo). */
export function tipoDeArchivo(nombre: string): { tipo: TipoImportado; mime: string } {
  const n = nombre.toLowerCase();
  const ext = n.split(".").pop() ?? "";
  if (/^stk-|sticker/.test(n) && ext === "webp") return { tipo: "sticker", mime: "image/webp" };
  const tabla: Record<string, { tipo: TipoImportado; mime: string }> = {
    jpg: { tipo: "imagen", mime: "image/jpeg" },
    jpeg: { tipo: "imagen", mime: "image/jpeg" },
    png: { tipo: "imagen", mime: "image/png" },
    webp: { tipo: "imagen", mime: "image/webp" },
    gif: { tipo: "imagen", mime: "image/gif" },
    opus: { tipo: "audio", mime: "audio/ogg" },
    ogg: { tipo: "audio", mime: "audio/ogg" },
    m4a: { tipo: "audio", mime: "audio/mp4" },
    aac: { tipo: "audio", mime: "audio/aac" },
    mp3: { tipo: "audio", mime: "audio/mpeg" },
    mp4: { tipo: "video", mime: "video/mp4" },
    "3gp": { tipo: "video", mime: "video/3gpp" },
    mov: { tipo: "video", mime: "video/mp4" },
    pdf: { tipo: "documento", mime: "application/pdf" },
  };
  return tabla[ext] ?? { tipo: "documento", mime: "application/octet-stream" };
}

/**
 * Si la fecha va día/mes (español) o mes/día (inglés de EE. UU.): un primer número mayor a 12 dice día primero; un segundo mayor a 12,
 * mes primero. Sin pistas, día primero.
 */
function diaPrimero(lineas: string[]): boolean {
  for (const l of lineas) {
    const m = ENCABEZADO.exec(l);
    if (!m) continue;
    if (Number(m[1]) > 12) return true;
    if (Number(m[2]) > 12) return false;
  }
  return true;
}

const dos = (n: number) => String(n).padStart(2, "0");

/**
 * Lee el texto de un chat exportado. Los mensajes de varias líneas se juntan; los avisos de WhatsApp (cifrado, cambios de número, «X
 * te añadió») se saltan porque no tienen autor. Nunca lanza: lo que no entiende lo deja fuera.
 */
export function leerChatExportado(texto: string): MensajeExportado[] {
  const lineas = String(texto ?? "")
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(MARCAS, "").replace(ESPACIOS, " "));
  const diaVaPrimero = diaPrimero(lineas);
  const crudos: { local: string; autor: string; cuerpo: string }[] = [];
  let actual: { local: string; autor: string; cuerpo: string } | null = null;
  for (const linea of lineas) {
    const m = ENCABEZADO.exec(linea);
    if (m) {
      const [, a, b, c, h, min, seg, ampm, resto] = m;
      const dia = Number(diaVaPrimero ? a : b);
      const mes = Number(diaVaPrimero ? b : a);
      const anio = Number(c.length === 2 ? `20${c}` : c);
      let hora = Number(h);
      const sufijo = (ampm ?? "").toLowerCase().replace(/[.\s]/g, "");
      if (sufijo === "pm" && hora < 12) hora += 12;
      if (sufijo === "am" && hora === 12) hora = 0;
      const valido = dia >= 1 && dia <= 31 && mes >= 1 && mes <= 12 && hora <= 23 && Number(min) <= 59;
      const dosPuntos = resto.indexOf(": ");
      if (valido && dosPuntos > 0) {
        actual = { local: `${anio}-${dos(mes)}-${dos(dia)}T${dos(hora)}:${min}:${seg ?? "00"}`, autor: resto.slice(0, dosPuntos).trim(), cuerpo: resto.slice(dosPuntos + 2) };
        crudos.push(actual);
        continue;
      }
      if (valido) {
        // Un aviso de WhatsApp sin autor: se salta, y lo que siga no se le pega al mensaje anterior.
        actual = null;
        continue;
      }
    }
    if (actual) actual.cuerpo += `\n${linea}`;
  }
  return crudos.map(({ local, autor, cuerpo }) => {
    const limpio = cuerpo.replace(/\s*<(?:se editó este mensaje|this message was edited)\.?>\s*$/i, "").trim();
    const adjunto = ADJUNTO_ANDROID.exec(limpio) ?? ADJUNTO_IPHONE.exec(limpio);
    if (adjunto) {
      const archivo = adjunto[1].trim();
      return { local, autor, texto: adjunto[2].trim() || null, archivo, tipo: tipoDeArchivo(archivo).tipo, omitido: false };
    }
    const omitido = OMITIDO.find((o) => o.re.test(limpio));
    if (omitido) return { local, autor, texto: TEXTO_OMITIDO[omitido.tipo], archivo: null, tipo: "texto", omitido: true };
    return { local, autor, texto: limpio || null, archivo: null, tipo: "texto", omitido: false };
  });
}

/** La hora del celular pasada a UTC con la diferencia de su zona (Venezuela −240, Panamá −300, Costa Rica −360 minutos). */
export function aUtc(local: string, diferenciaMinutos: number): string {
  const [f, h] = local.split("T");
  const [anio, mes, dia] = f.split("-").map(Number);
  const [hora, min, seg] = h.split(":").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia, hora, min, seg) - diferenciaMinutos * 60_000).toISOString();
}

/** Las zonas horarias que se ofrecen al importar, por el país del celular. */
export const ZONAS_IMPORTAR = [
  { valor: -240, etiqueta: "Venezuela (UTC−4)", prefijo: "+58" },
  { valor: -300, etiqueta: "Panamá, Colombia, Perú, Ecuador (UTC−5)", prefijo: "+507" },
  { valor: -360, etiqueta: "Costa Rica, Guatemala, Honduras, El Salvador, Nicaragua, México (UTC−6)", prefijo: "+506" },
];

/** La zona que se propone por el número de la empresa (el celular donde se exportó): Venezuela para un +58, Panamá para un +507… */
export function zonaPorNumero(numero: string): number {
  const n = numero.replace(/\s/g, "");
  return ZONAS_IMPORTAR.find((z) => n.startsWith(z.prefijo))?.valor ?? -300;
}

/**
 * El contacto según el nombre del archivo que da WhatsApp: «Chat de WhatsApp con María G..txt» (Android), «WhatsApp Chat - María G.zip»
 * (iPhone). Si el contacto no estaba guardado, es su número.
 */
export function nombreDelArchivo(nombre: string): string | null {
  const m = /(?:chat de whatsapp con|whatsapp chat with|whatsapp chat -|conversa do whatsapp com)\s*(.+?)(?:\.(?:txt|zip))?$/i.exec(nombre.trim());
  return m?.[1].trim() || null;
}

/**
 * Para cada mensaje, cuántos iguales (misma hora, autor, texto y archivo) hay antes que él: dos «ok» seguidos en el mismo minuto son dos
 * mensajes, y con este número cada uno tiene su propia huella al guardarlo.
 */
export function numerarRepetidos(mensajes: MensajeExportado[]): number[] {
  const vistos = new Map<string, number>();
  return mensajes.map((m) => {
    const clave = [m.local, m.autor, m.texto ?? "", m.archivo ?? ""].join("\u0000");
    const n = vistos.get(clave) ?? 0;
    vistos.set(clave, n + 1);
    return n;
  });
}

/**
 * Quiénes escribieron en el chat y cuántos mensajes cada uno, de más a menos. Sirve para que la persona diga cuál es Ecomfive (los
 * mensajes del celular de la empresa) y cuál el dropshipper.
 */
export function autoresDe(mensajes: MensajeExportado[]): { nombre: string; mensajes: number }[] {
  const cuenta = new Map<string, number>();
  for (const m of mensajes) cuenta.set(m.autor, (cuenta.get(m.autor) ?? 0) + 1);
  return [...cuenta].map(([nombre, n]) => ({ nombre, mensajes: n })).sort((a, b) => b.mensajes - a.mensajes);
}

/**
 * Propone quién es la empresa: con dos autores, el que no se parece al nombre del dropshipper (su perfil de WhatsApp o su nombre en el
 * CRM). Si no se puede saber, ninguno: lo elige la persona.
 */
export function proponerNosotros(autores: string[], nombresDropshipper: (string | null | undefined)[]): string[] {
  if (autores.length !== 2) return [];
  const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9+]/g, "");
  const suyos = nombresDropshipper.filter((x): x is string => !!x && !!normal(x)).map(normal);
  const esSuyo = (a: string) => suyos.some((s) => normal(a) && (normal(a).includes(s) || s.includes(normal(a))));
  const [a, b] = autores;
  if (esSuyo(a) && !esSuyo(b)) return [b];
  if (esSuyo(b) && !esSuyo(a)) return [a];
  return [];
}
