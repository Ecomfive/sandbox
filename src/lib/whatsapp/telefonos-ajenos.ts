/**
 * Solo se comparten los números de la empresa (31 oct 2026, pedido de Hernán: «limitar compartir números de teléfono, solo los nuestros»).
 * Un mensaje a un dropshipper (texto, pie de un archivo o lo escrito en una plantilla) no sale si lleva un número de teléfono que no es uno
 * de los de WhatsApp de la empresa (`whatsapp_numeros`): así nadie del equipo pasa el número de otro cliente ni el suyo personal.
 *
 * Qué cuenta como teléfono, sin confundirlo con un pedido, una guía o un precio:
 * - con «+» y 8 a 15 cifras («+507 6123-4567»), o con el código del país (507/506 + 8 cifras, 52 + 10);
 * - 8 cifras que empiezan con 5, 6, 7 u 8 (celulares de Panamá y Costa Rica), juntas o partidas («6123-4567»);
 * - 7 cifras partidas como fijo de Panamá («223-4567»); 10 cifras partidas como teléfono de México («55 1234 5678»);
 * - cualquier número de 7 a 15 cifras justo después de «tel», «cel», «WhatsApp», «llama al», «escríbele al»…;
 * - el número de un enlace wa.me.
 * No cuenta si va justo después de «pedido», «guía», «orden», «ID», «#», «factura», «$»… ni un número de 10 o más cifras sin partir.
 */

export interface TelefonoEnTexto {
  /** Como está escrito («6123-4567»). */
  texto: string;
  /** Solo las cifras («61234567»). */
  cifras: string;
}

/** Una secuencia de cifras con los separadores de un teléfono (espacios, guiones, puntos, paréntesis), con o sin «+». */
const CANDIDATO = /(?<![\w$#/=.,-])\+?\(?\d[\d  ().-]{5,22}\d(?![\w%])/g;
/** Lo que dice que viene un teléfono. */
const ANTES_TELEFONO = /(?:^|[^\p{L}])(tel[eé]fono|tel\.?|cel(ular)?\.?|m[oó]vil|whats\s?app|wsp|wpp|wa|n[uú]mero( de contacto| personal| de [eé]l| de ella)?|ll[aá]m[ae]\w*( al)?|escr[ií]be\w*( al)?|contacta\w*( al)?|comun[ií]ca\w*( al)?|marca\w*( al)?)\s*:?\s*$/iu;
/** Lo que dice que NO es un teléfono (un pedido, una guía, un precio…). */
const ANTES_OTRA_COSA = /(?:^|[^\p{L}])(pedido|orden|order|gu[ií]a|tracking|rastreo|id|sku|ref(erencia)?|factura|recibo|ticket|c[eé]dula|ruc|nit|c[oó]digo|cuenta|transacci[oó]n|comprobante|lote|caja|n[°º]|no\.|#|\$|b\/\.?|usd|precio|monto|total|valor|costo)\s*:?\s*$/iu;

const cifrasDe = (s: string) => s.replace(/\D/g, "");
/** Partido como teléfono: grupos de cifras separados (al menos un separador entre cifras). */
const partido = (s: string) => /\d[  ().-]+\d/.test(s);

function esTelefono(escrito: string, antes: string): boolean {
  const cifras = cifrasDe(escrito);
  const n = cifras.length;
  if (n < 7 || n > 15) return false;
  if (ANTES_TELEFONO.test(antes)) return true;
  if (ANTES_OTRA_COSA.test(antes)) return false;
  if (escrito.trim().startsWith("+")) return n >= 8;
  if ((n === 11 && /^50[67]/.test(cifras)) || (n === 12 && cifras.startsWith("52")) || (n === 13 && cifras.startsWith("521"))) return true;
  if (n === 8 && /^[5-8]/.test(cifras)) return true;
  if (n === 7 && /^[2-9]/.test(cifras) && /^\d{3}[ .-]\d{4}$/.test(escrito.trim())) return true;
  if (n === 10 && partido(escrito) && /^\(?\d{2,3}\)?[ .-]?\d{3,4}[ .-]\d{4}$/.test(escrito.trim())) return true;
  return false;
}

/** Los teléfonos que hay en un texto (también el de un enlace wa.me). */
export function telefonosEnTexto(texto: string): TelefonoEnTexto[] {
  const encontrados: TelefonoEnTexto[] = [];
  for (const m of texto.matchAll(/(?:wa\.me|api\.whatsapp\.com\/send\/?\?phone=)\/?\+?(\d{7,15})/gi)) encontrados.push({ texto: m[0], cifras: m[1] });
  for (const m of texto.matchAll(CANDIDATO)) {
    const inicio = m.index ?? 0;
    // Lo de wa.me ya se contó.
    if (/wa\.me\/?$|phone=$/i.test(texto.slice(Math.max(0, inicio - 20), inicio))) continue;
    const escrito = m[0].replace(/^\(?/, (p) => (m[0].includes(")") ? p : "")).trim();
    const antes = texto.slice(Math.max(0, inicio - 40), inicio);
    if (esTelefono(escrito, antes)) encontrados.push({ texto: escrito, cifras: cifrasDe(escrito) });
  }
  return encontrados;
}

/** Las últimas 8 cifras: así «+507 6123-4567», «50761234567» y «6123-4567» son el mismo número. */
const cola = (cifras: string) => cifras.slice(-8);

/** Los teléfonos del texto que no son de la empresa (`propios`: los números de WhatsApp de la empresa, como estén escritos). */
export function telefonosAjenos(texto: string, propios: readonly string[]): TelefonoEnTexto[] {
  const nuestros = new Set(propios.map(cifrasDe).filter((c) => c.length >= 7).map(cola));
  const vistos = new Set<string>();
  return telefonosEnTexto(texto).filter((t) => {
    const clave = cola(t.cifras);
    if (nuestros.has(clave) || vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
}

/** El aviso para el equipo, o null si el texto no lleva números ajenos. */
export function avisoTelefonosAjenos(texto: string, propios: readonly string[]): string | null {
  const ajenos = telefonosAjenos(texto, propios);
  if (!ajenos.length) return null;
  const cuales = ajenos.map((t) => `«${t.texto}»`).join(", ");
  return `${ajenos.length === 1 ? `${cuales} es un número de teléfono que no es` : `${cuales} son números de teléfono que no son`} de la empresa: solo se pueden compartir los números de WhatsApp de Ecomfive. Quítalo para mandar el mensaje.`;
}
