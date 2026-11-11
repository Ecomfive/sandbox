// Cifrado de los tokens de una integración externa (QuickBooks Online) antes de guardarlos en la base: AES-256-GCM con una
// clave de servidor (`QBO_TOKEN_KEY`). Nunca se guarda un token en texto plano ni viaja al navegador. Formato del texto
// cifrado: `v1.<iv>.<tag>.<datos>` en base64url. La clave puede ser 32 bytes en base64/base64url o hexadecimal (64
// caracteres); cualquier otro texto de al menos 32 caracteres se deriva con SHA-256. Prueba en `cifrado-tokens.test.ts`.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const VERSION = "v1";

/** La clave de 32 bytes a partir del texto de la variable, o null si no sirve (vacía o demasiado corta). */
export function claveDesdeTexto(texto: string | undefined | null): Buffer | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  if (/^[0-9a-f]{64}$/i.test(t)) return Buffer.from(t, "hex");
  if (/^[A-Za-z0-9+/_-]{43,44}=?$/.test(t)) {
    const b = Buffer.from(t.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    if (b.length === 32) return b;
  }
  if (t.length >= 32) return createHash("sha256").update(t, "utf8").digest();
  return null;
}

/** Cifra un texto (AES-256-GCM, IV aleatorio de 12 bytes). */
export function cifrar(texto: string, clave: Buffer): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave, iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return [VERSION, iv.toString("base64url"), c.getAuthTag().toString("base64url"), datos.toString("base64url")].join(".");
}

/** Descifra lo que dejó `cifrar`; null si la clave no es la misma o el texto fue alterado. */
export function descifrar(cifrado: string, clave: Buffer): string | null {
  const partes = cifrado.split(".");
  if (partes.length !== 4 || partes[0] !== VERSION) return null;
  try {
    const iv = Buffer.from(partes[1], "base64url");
    const tag = Buffer.from(partes[2], "base64url");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const d = createDecipheriv("aes-256-gcm", clave, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(Buffer.from(partes[3], "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Firma HMAC-SHA256 en base64url (con una clave derivada para no reusar la del cifrado tal cual). */
export function firmarHmac(texto: string, clave: Buffer, proposito: string): string {
  const derivada = createHmac("sha256", clave).update(`proposito:${proposito}`).digest();
  return createHmac("sha256", derivada).update(texto).digest("base64url");
}

/** Compara dos firmas en tiempo constante. */
export function firmasIguales(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
