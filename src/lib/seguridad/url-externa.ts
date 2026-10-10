import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Descargar algo de una dirección que escribió (o arrastró) una persona es peligroso: podría apuntar a la red interna del
 * servidor (localhost, 10.x, 169.254.169.254 de la nube…) y usarnos para leerla (SSRF). Aquí solo se admite http(s) a
 * hosts públicos —también tras cada redirección, revisada a mano—, con tiempo y tamaño máximos.
 */

/** Si una IP (v4 o v6) es privada, local, reservada o de enlace: no se descarga nada de ella. */
export function esIpPrivada(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split(".").map(Number);
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
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::" || x === "::1") return true;
    const mapeada = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapeada) return esIpPrivada(mapeada[1]);
    return x.startsWith("fc") || x.startsWith("fd") || x.startsWith("fe8") || x.startsWith("fe9") || x.startsWith("fea") || x.startsWith("feb") || x.startsWith("ff");
  }
  return true;
}

/** La dirección, si es http(s) a un host público (resuelto por DNS); si no, el motivo. */
export async function revisarUrlPublica(texto: string): Promise<{ url: URL } | { error: string }> {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return { error: "La dirección no es válida." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { error: "Solo se admiten direcciones http o https." };
  if (url.username || url.password) return { error: "La dirección no es válida." };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return { error: "Esa dirección no es pública." };
  try {
    const ips = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
    if (ips.length === 0 || ips.some((i) => esIpPrivada(i.address))) return { error: "Esa dirección no es pública." };
  } catch {
    return { error: "No se encontró el sitio de esa imagen." };
  }
  return { url };
}

/** Descarga hasta `maxBytes` de una dirección pública, revisando cada redirección. */
export async function descargarPublico(texto: string, maxBytes: number): Promise<{ bytes: Uint8Array } | { error: string }> {
  let actual = texto;
  for (let salto = 0; salto < 4; salto++) {
    const revisada = await revisarUrlPublica(actual);
    if ("error" in revisada) return revisada;
    let r: Response;
    try {
      r = await fetch(revisada.url, { redirect: "manual", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "Mozilla/5.0 (Ecomfive)", accept: "image/*" } });
    } catch {
      return { error: "No se pudo descargar la imagen." };
    }
    if (r.status >= 300 && r.status < 400) {
      const destino = r.headers.get("location");
      if (!destino) return { error: "No se pudo descargar la imagen." };
      actual = new URL(destino, revisada.url).toString();
      continue;
    }
    if (!r.ok || !r.body) return { error: "El sitio no entregó la imagen." };
    if (Number(r.headers.get("content-length") ?? 0) > maxBytes) return { error: "La imagen pesa demasiado." };
    const partes: Uint8Array[] = [];
    let total = 0;
    const lector = r.body.getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) {
        await lector.cancel();
        return { error: "La imagen pesa demasiado." };
      }
      partes.push(value);
    }
    const bytes = new Uint8Array(total);
    let i = 0;
    for (const p of partes) {
      bytes.set(p, i);
      i += p.length;
    }
    return { bytes };
  }
  return { error: "Demasiadas redirecciones." };
}
