// Confirmación con IA: lo que contestan las dos IA (ChatGPT y Claude) sobre una dirección y cómo se juntan en una sola decisión. Lógica pura, con su prueba.

import type { Zona } from "./zonas";

export type ProveedorModelo = "openai" | "anthropic";

/** Lo que una IA dice de una dirección. `no_se`: no alcanza para decidir la zona. */
export interface RespuestaModelo {
  zona: Zona | "no_se";
  completa: boolean;
  /** Lo único que falta, escrito para pedirlo al cliente («el número de casa o un punto de referencia»); null si está completa. */
  falta: string | null;
  motivo: string;
}

export interface ResultadoModelo {
  proveedor: ProveedorModelo;
  ok: boolean;
  respuesta?: RespuestaModelo;
  error?: string;
}

/** `adelantado`: la dirección es de una zona de pago por adelantado («En espera de pago»): no se propone etiqueta hasta que el asesor verifique el pago. */
export type EstadoAnalisis = "listo" | "falta_dato" | "revisar" | "error" | "adelantado";

export interface Combinado {
  estado: EstadoAnalisis;
  zona: Zona | null;
  /** Quién decidió la zona: una palabra de zona del equipo o las IA. */
  zonaPor: "regla" | "ia" | null;
  completa: boolean | null;
  falta: string | null;
  /** Las dos IA coinciden (en si está completa y, si hacía falta, en la zona); null si solo contestó una. */
  acuerdo: boolean | null;
  motivo: string;
}

/** Lo que falta, limpio para ponerlo en un mensaje: sin enlaces ni teléfonos, sin punto final y de hasta 160 letras. */
export function limpiarFalta(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?;:,\s]+$/g, "")
    .slice(0, 160)
    .trim();
  return t.length >= 3 ? t.charAt(0).toLowerCase() + t.slice(1) : null;
}

/** Lee la respuesta de una IA (un JSON, a veces con texto alrededor o en un bloque de código). Null si no sirve. */
export function leerRespuesta(texto: string): RespuestaModelo | null {
  const t = String(texto ?? "");
  const ini = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (ini < 0 || fin <= ini) return null;
  let j: Record<string, unknown>;
  try {
    j = JSON.parse(t.slice(ini, fin + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  const zona = String(j.zona ?? "").toLowerCase().trim();
  if (zona !== "ciudad" && zona !== "interior" && zona !== "no_se" && zona !== "no_aplica") return null;
  if (typeof j.completa !== "boolean") return null;
  const falta = j.completa ? null : limpiarFalta(j.falta);
  return { zona: zona === "no_aplica" ? "no_se" : zona, completa: j.completa, falta, motivo: String(j.motivo ?? "").trim().slice(0, 400) };
}

/**
 * La decisión final. La zona la deciden primero las palabras de zona del equipo (`zonaPorReglas`) y, si no hay, las dos IA si coinciden; si una dice otra cosa o no sabe, queda para revisar.
 * Una dirección está completa solo si todas las IA que contestaron la ven completa; si no, se pide lo que falta (antes que decidir la zona).
 */
export function combinar({ distingueZona, zonaReglas, modelos }: { distingueZona: boolean; zonaReglas: Zona | null; modelos: ResultadoModelo[] }): Combinado {
  const buenos = modelos.filter((m): m is ResultadoModelo & { respuesta: RespuestaModelo } => m.ok && !!m.respuesta);
  if (!buenos.length) return { estado: "error", zona: null, zonaPor: null, completa: null, falta: null, acuerdo: null, motivo: modelos.map((m) => m.error).filter(Boolean).join(" · ") || "Ninguna IA contestó." };

  const completa = buenos.every((m) => m.respuesta.completa);
  const incompleta = buenos.find((m) => !m.respuesta.completa && m.respuesta.falta) ?? buenos.find((m) => !m.respuesta.completa);
  const falta = completa ? null : (incompleta?.respuesta.falta ?? "los datos que faltan de la dirección");

  let zona: Zona | null = null;
  let zonaPor: "regla" | "ia" | null = null;
  if (distingueZona) {
    if (zonaReglas) {
      zona = zonaReglas;
      zonaPor = "regla";
    } else {
      const zonas = buenos.map((m) => m.respuesta.zona);
      if (zonas.every((z) => z === "ciudad" || z === "interior") && new Set(zonas).size === 1) {
        zona = zonas[0] as Zona;
        zonaPor = "ia";
      }
    }
  }

  const mismaCompleta = new Set(buenos.map((m) => m.respuesta.completa)).size === 1;
  const mismaZona = !distingueZona || zonaReglas !== null || new Set(buenos.map((m) => m.respuesta.zona)).size === 1;
  const acuerdo = buenos.length < 2 ? null : mismaCompleta && mismaZona;
  const motivo = buenos.map((m) => m.respuesta.motivo).filter(Boolean)[0] ?? "";

  if (!completa) return { estado: "falta_dato", zona, zonaPor, completa, falta, acuerdo, motivo };
  if (distingueZona && !zona) return { estado: "revisar", zona: null, zonaPor: null, completa, falta: null, acuerdo, motivo };
  return { estado: "listo", zona, zonaPor, completa, falta: null, acuerdo, motivo };
}

/** El mensaje que pide solo lo que falta de la dirección. */
export function mensajePedirDetalle({ nombre, numero, tienda, falta }: { nombre: string | null; numero: string | null; tienda: string | null; falta: string }): string {
  const primero = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  const saludo = primero ? `Hola ${primero.charAt(0).toUpperCase()}${primero.slice(1).toLowerCase()} 👋` : "Hola 👋";
  const pedido = numero ? `tu pedido ${numero}${tienda ? ` de ${tienda}` : ""}` : "tu pedido";
  return `${saludo} Para poder enviar ${pedido} necesitamos completar tu dirección. ¿Nos puedes escribir ${falta}? ¡Gracias! 🙏`;
}

/**
 * El mensaje que le avisa al cliente que su pedido es de una zona de pago por adelantado y cómo pagar (17 nov 2026). Los métodos de pago son los que se registran por tienda; sin ellos, el mensaje
 * pide el comprobante y dice que un asesor le indica cómo pagar. Lo envía el asesor con un botón (nunca solo).
 */
export function mensajePagoAdelantado({ nombre, numero, tienda, metodos }: { nombre: string | null; numero: string | null; tienda: string | null; metodos: string | null }): string {
  const primero = (nombre ?? "").trim().split(/\s+/)[0] ?? "";
  const saludo = primero ? `Hola ${primero.charAt(0).toUpperCase()}${primero.slice(1).toLowerCase()} 👋` : "Hola 👋";
  const pedido = numero ? `tu pedido ${numero}${tienda ? ` de ${tienda}` : ""}` : "tu pedido";
  const como = metodos?.trim() ? `\n\nPuedes pagar así:\n${metodos.trim()}\n\n` : " Un asesor te indicará cómo pagar. ";
  return `${saludo} ${pedido[0].toUpperCase()}${pedido.slice(1)} es para una zona con pago por adelantado. Para poder enviarlo necesitamos que realices el pago y nos envíes el comprobante por este chat.${como}Apenas lo recibamos, lo confirmamos y lo despachamos. ¡Gracias! 🙏`;
}

/** La etiqueta de Shopify que corresponde a una zona, según lo configurado en el país; null si el país no la tiene definida. */
export function etiquetaDeZona(zona: Zona | null, config: { etiquetaCiudad: string | null; etiquetaInterior: string | null }): string | null {
  if (!zona) return null;
  return (zona === "ciudad" ? config.etiquetaCiudad : config.etiquetaInterior)?.trim() || null;
}
