import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Teléfonos de dropshippers. El WhatsApp es lo que identifica a la persona (con él se enlaza su chat), así que se guarda
 * siempre en formato internacional (E.164: «+573001112233»). De ese formato sale también el país de origen.
 */

export interface TelefonoNormalizado {
  /** «+573001112233». */
  e164: string;
  /** País del número, código ISO de 2 letras («CO»), o null si no se pudo saber. */
  pais: string | null;
}

/**
 * Normaliza un teléfono escrito de cualquier manera («+57 300 111 2233», «300-111-2233», «00573001112233»).
 * Si no trae el prefijo del país, se usa `paisPorDefecto` (el código ISO del país donde vive o vende, si se conoce).
 * Devuelve null si no es un número válido: es mejor revisarlo a mano que guardar uno equivocado.
 */
export function normalizarTelefono(texto: string | null | undefined, paisPorDefecto?: string | null): TelefonoNormalizado | null {
  const limpio = String(texto ?? "")
    .trim()
    .replace(/^00/, "+")
    .replace(/[^\d+]/g, "");
  if (limpio.length < 7) return null;
  const defecto = paisPorDefecto && /^[A-Z]{2}$/.test(paisPorDefecto) ? (paisPorDefecto as CountryCode) : undefined;
  const numero = parsePhoneNumberFromString(limpio, defecto);
  if (!numero || !numero.isValid()) return null;
  return { e164: numero.number, pais: numero.country ?? null };
}

/** Nombres de país (y variantes comunes) → código ISO, para los países de Latinoamérica con los que se trabaja. */
const PAISES: Record<string, string> = {
  argentina: "AR", bolivia: "BO", brasil: "BR", brazil: "BR", chile: "CL", colombia: "CO", "costa rica": "CR", cr: "CR",
  ecuador: "EC", "el salvador": "SV", guatemala: "GT", honduras: "HN", mexico: "MX", méxico: "MX", nicaragua: "NI",
  panama: "PA", panamá: "PA", pa: "PA", paraguay: "PY", peru: "PE", perú: "PE", "republica dominicana": "DO",
  "república dominicana": "DO", uruguay: "UY", venezuela: "VE", usa: "US", "estados unidos": "US", españa: "ES",
};

/** «Panamá», «panama», «PA» → «PA». Devuelve null si no se reconoce. */
export function codigoPais(texto: string | null | undefined): string | null {
  const t = String(texto ?? "").trim().toLowerCase();
  if (!t) return null;
  if (PAISES[t]) return PAISES[t];
  return /^[a-z]{2}$/.test(t) ? t.toUpperCase() : null;
}

/** Separa una lista de países escrita de cualquier manera («Panamá, Costa Rica», «PA / CR», «Panamá y Costa Rica»). */
export function listaDePaises(texto: string | null | undefined): { codigos: string[]; noReconocidos: string[] } {
  const partes = String(texto ?? "")
    .split(/[,;/|\n]| y /i)
    .map((p) => p.trim())
    .filter(Boolean);
  const codigos: string[] = [];
  const noReconocidos: string[] = [];
  for (const parte of partes) {
    const c = codigoPais(parte);
    if (c) {
      if (!codigos.includes(c)) codigos.push(c);
    } else {
      noReconocidos.push(parte);
    }
  }
  return { codigos, noReconocidos };
}

/**
 * Cómo puede estar guardado en los chats de WhatsApp el teléfono de un pedido (auditoría de seguridad, 18 nov 2026): el formato internacional y las formas en que WhatsApp
 * escribe ese mismo número. México: los celulares llegan con un 1 después del 52 (+521…, que libphonenumber ya no da por válido). Argentina: con el 9 de celular (+549…) o sin
 * él (+54…), el mismo abonado. Escrito con el prefijo («+…» o «00…»), también tal cual, como lo guarda el webhook si no lo pudo normalizar. Nunca por los últimos dígitos.
 */
export function telefonosDeChatPosibles(texto: string | null | undefined, paisPorDefecto?: string | null): string[] {
  const limpio = String(texto ?? "").trim().replace(/^00/, "+").replace(/[^\d+]/g, "");
  const digitos = limpio.replace(/\D/g, "");
  const internacional = limpio.startsWith("+");
  const salida = new Set<string>();
  // México con el 1 de WhatsApp: escrito con el prefijo, o sin él si el pedido es de México.
  const mx = /^521(\d{10})$/.exec(digitos);
  const base = mx && (internacional || paisPorDefecto === "MX") ? normalizarTelefono(`+52${mx[1]}`) : normalizarTelefono(texto, paisPorDefecto);
  if (base) {
    salida.add(base.e164);
    if (/^\+52\d{10}$/.test(base.e164)) salida.add(`+521${base.e164.slice(3)}`);
    const ar = /^\+54(9?)(\d{10})$/.exec(base.e164);
    if (ar) {
      salida.add(`+54${ar[2]}`);
      salida.add(`+549${ar[2]}`);
    }
  }
  if (internacional && digitos.length >= 8 && digitos.length <= 15) salida.add(`+${digitos}`);
  return [...salida];
}
