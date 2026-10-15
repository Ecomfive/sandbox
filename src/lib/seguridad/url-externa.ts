import { lookup } from "node:dns";
import { lookup as lookupPromesa } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP, type LookupFunction } from "node:net";

/**
 * Descargar algo de una dirección que escribió (o arrastró) una persona es peligroso: podría apuntar a la red interna del
 * servidor (localhost, 10.x, 169.254.169.254 de la nube…) y usarnos para leerla (SSRF). Aquí solo se admite http(s) a
 * hosts públicos, en los puertos 80 o 443 —también tras cada redirección, revisada a mano—, con tiempo y tamaño máximos.
 *
 * Dos cosas que importan (auditoría de seguridad, 13 oct 2026):
 * - Una IPv6 se revisa por sus bytes, no por su texto: `new URL` escribe `[::ffff:127.0.0.1]` como `[::ffff:7f00:1]`, y la
 *   revisión por texto la daba por pública. Se reconocen las IPv4 escondidas en IPv6 (mapeadas, compatibles, NAT64, 6to4).
 * - La IP se revisa en el mismo momento de conectarse (la búsqueda DNS de la conexión es la que se revisa), así un nombre
 *   que primero responde una IP pública y luego una interna (DNS rebinding) no pasa.
 */

/** Los 16 bytes de una IPv6 escrita como texto (admite `::` y una IPv4 al final), o null si no es válida. */
function bytesIpv6(texto: string): number[] | null {
  let ip = texto.toLowerCase().split("%")[0];
  // Una IPv4 al final («::ffff:1.2.3.4») se pasa a dos grupos hexadecimales.
  const v4 = ip.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const n = v4.slice(1).map(Number);
    if (n.some((x) => x > 255)) return null;
    ip = ip.slice(0, v4.index) + ((n[0] << 8) | n[1]).toString(16) + ":" + ((n[2] << 8) | n[3]).toString(16);
  }
  const partes = ip.split("::");
  if (partes.length > 2) return null;
  const izq = partes[0] ? partes[0].split(":") : [];
  const der = partes.length === 2 && partes[1] ? partes[1].split(":") : [];
  const faltan = 8 - izq.length - der.length;
  if (partes.length === 1 ? faltan !== 0 : faltan < 1) return null;
  const grupos = [...izq, ...Array(partes.length === 2 ? faltan : 0).fill("0"), ...der];
  const bytes: number[] = [];
  for (const g of grupos) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const v = parseInt(g, 16);
    bytes.push(v >> 8, v & 255);
  }
  return bytes.length === 16 ? bytes : null;
}

function esIpv4Privada(a: number, b: number): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

/** Si una IP (v4 o v6) es privada, local, reservada o de enlace: no se descarga nada de ella. */
export function esIpPrivada(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
    return esIpv4Privada(a, b);
  }
  if (v !== 6) return true;
  const x = bytesIpv6(ip);
  if (!x) return true;
  const ceros = (desde: number, hasta: number) => x.slice(desde, hasta).every((n) => n === 0);
  // IPv4 escondida en los últimos 4 bytes: mapeada (::ffff:0:0/96), compatible (::/96, incluye :: y ::1) y NAT64 (64:ff9b::/96).
  if (ceros(0, 10) && x[10] === 0xff && x[11] === 0xff) return esIpv4Privada(x[12], x[13]);
  if (ceros(0, 12)) return true;
  // IPv4 «traducida» (::ffff:0:0:0/96, SIIT): también lleva una IPv4 en los últimos 4 bytes.
  if (ceros(0, 8) && x[8] === 0xff && x[9] === 0xff && ceros(10, 12)) return esIpv4Privada(x[12], x[13]);
  if (x[0] === 0x00 && x[1] === 0x64 && x[2] === 0xff && x[3] === 0x9b) return ceros(4, 12) ? esIpv4Privada(x[12], x[13]) : true;
  // 6to4 (2002::/16): la IPv4 va en los bytes 2 a 5.
  if (x[0] === 0x20 && x[1] === 0x02) return esIpv4Privada(x[2], x[3]);
  // Teredo (2001::/32) y documentación (2001:db8::/32): no se usan para imágenes públicas.
  if (x[0] === 0x20 && x[1] === 0x01 && ((x[2] === 0 && x[3] === 0) || (x[2] === 0x0d && x[3] === 0xb8))) return true;
  // Locales únicas (fc00::/7), de enlace (fe80::/10), sitio viejas (fec0::/10), multidifusión (ff00::/8) y descarte (100::/64).
  if ((x[0] & 0xfe) === 0xfc || (x[0] === 0xfe && (x[1] & 0xc0) === 0x80) || (x[0] === 0xfe && (x[1] & 0xc0) === 0xc0) || x[0] === 0xff) return true;
  if (x[0] === 0x01 && x[1] === 0x00 && ceros(2, 8)) return true;
  return false;
}

/** La dirección, si es http(s) a un host público en el puerto 80 o 443 (resuelto por DNS); si no, el motivo. */
export async function revisarUrlPublica(texto: string): Promise<{ url: URL } | { error: string }> {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return { error: "La dirección no es válida." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Solo se admiten direcciones http o https." };
  if (url.username || url.password) return { error: "La dirección no es válida." };
  if (url.port && url.port !== "80" && url.port !== "443") return { error: "Esa dirección no es pública." };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return { error: "Esa dirección no es pública." };
  try {
    const ips = isIP(host) ? [{ address: host }] : await lookupPromesa(host, { all: true });
    if (ips.length === 0 || ips.some((i) => esIpPrivada(i.address))) return { error: "Esa dirección no es pública." };
  } catch {
    return { error: "No se encontró el sitio de esa imagen." };
  }
  return { url };
}

/**
 * La búsqueda DNS que usa la conexión: resuelve el nombre y, si alguna IP es privada, falla. Como es la misma búsqueda con la
 * que se conecta, no hay un segundo momento en que el nombre pueda cambiar a una IP interna.
 */
const lookupPublico: LookupFunction = (hostname, opciones, callback) => {
  lookup(hostname, { ...opciones, all: true }, (error, direcciones) => {
    if (error) return callback(error, "", 0);
    const lista = direcciones as { address: string; family: number }[];
    if (!lista.length || lista.some((d) => esIpPrivada(d.address))) {
      return callback(Object.assign(new Error("Esa dirección no es pública."), { code: "EPRIVADA" }), "", 0);
    }
    if ((opciones as { all?: boolean }).all) return (callback as unknown as (e: null, d: typeof lista) => void)(null, lista);
    callback(null, lista[0].address, lista[0].family);
  });
};

interface Respuesta {
  estado: number;
  ubicacion: string | null;
  largo: number;
  /** Las cookies que puso el sitio (`name=value`), para pedir un archivo que solo entrega a quien vio la página. */
  cookies: string[];
  cuerpo: http.IncomingMessage;
}

/** Un GET con la búsqueda DNS revisada (`lookupPublico`), sin seguir redirecciones. */
function pedir(url: URL, senal: AbortSignal, encabezados?: Record<string, string>): Promise<Respuesta> {
  const cliente = url.protocol === "https:" ? https : http;
  return new Promise((resolver, rechazar) => {
    const solicitud = cliente.get(
      url,
      { lookup: lookupPublico, signal: senal, headers: { "user-agent": "Mozilla/5.0 (Ecomfive)", accept: "image/*", ...encabezados } },
      (r) =>
        resolver({
          estado: r.statusCode ?? 0,
          ubicacion: typeof r.headers.location === "string" ? r.headers.location : null,
          largo: Number(r.headers["content-length"] ?? 0),
          cookies: (r.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]),
          cuerpo: r,
        }),
    );
    solicitud.on("error", rechazar);
  });
}

/**
 * Descarga hasta `maxBytes` de una dirección pública, revisando cada redirección. Por defecto pide una imagen; `encabezados`
 * cambia lo que se pide (otro `accept`, otro agente) sin tocar ninguna de las revisiones de seguridad.
 */
export async function descargarPublico(texto: string, maxBytes: number, encabezados?: Record<string, string>): Promise<{ bytes: Uint8Array } | { error: string }> {
  const r = await descargarConDetalle(texto, maxBytes, encabezados);
  return "error" in r ? r : { bytes: r.bytes };
}

/**
 * Lo mismo que `descargarPublico`, pero además dice **en qué dirección terminó** (tras las redirecciones: un enlace corto de TikTok o
 * Facebook se resuelve así) y **qué cookies puso el sitio** (TikTok solo entrega su video a quien trae las cookies de la página).
 * Cada redirección se revisa igual que antes: ninguna sale a una dirección privada.
 */
export async function descargarConDetalle(
  texto: string,
  maxBytes: number,
  encabezados?: Record<string, string>,
): Promise<{ bytes: Uint8Array; urlFinal: string; cookies: string[] } | { error: string }> {
  const senal = AbortSignal.timeout(10_000);
  let actual = texto;
  const cookies: string[] = [];
  for (let salto = 0; salto < 4; salto++) {
    const revisada = await revisarUrlPublica(actual);
    if ("error" in revisada) return revisada;
    let r: Respuesta;
    try {
      r = await pedir(revisada.url, senal, encabezados);
    } catch (error) {
      if ((error as { code?: string })?.code === "EPRIVADA") return { error: "Esa dirección no es pública." };
      return { error: "No se pudo descargar la imagen." };
    }
    cookies.push(...r.cookies);
    if (r.estado >= 300 && r.estado < 400) {
      r.cuerpo.resume();
      if (!r.ubicacion) return { error: "No se pudo descargar la imagen." };
      actual = new URL(r.ubicacion, revisada.url).toString();
      continue;
    }
    if (r.estado < 200 || r.estado >= 300) {
      r.cuerpo.resume();
      return { error: "El sitio no entregó la imagen." };
    }
    if (r.largo > maxBytes) {
      r.cuerpo.destroy();
      return { error: "La imagen pesa demasiado." };
    }
    const partes: Buffer[] = [];
    let total = 0;
    try {
      for await (const trozo of r.cuerpo as AsyncIterable<Buffer>) {
        total += trozo.length;
        if (total > maxBytes) {
          r.cuerpo.destroy();
          return { error: "La imagen pesa demasiado." };
        }
        partes.push(trozo);
      }
    } catch {
      return { error: "No se pudo descargar la imagen." };
    }
    return { bytes: new Uint8Array(Buffer.concat(partes, total)), urlFinal: revisada.url.toString(), cookies };
  }
  return { error: "Demasiadas redirecciones." };
}
