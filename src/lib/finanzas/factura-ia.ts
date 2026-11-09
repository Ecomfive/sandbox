// Leer una factura (PDF o foto) con la API de Anthropic: el pedido que se manda y cómo se interpreta la respuesta.
// Lógica pura (sin red): la llamada vive en `libro-movimientos/factura-actions.ts`. Prueba en `factura-ia.test.ts`.

import { validarRucDv } from "./ruc-panama";

export const MODELO_PREDETERMINADO = "claude-sonnet-4-5";

/** Lo que se le pide al modelo: solo los datos de la factura, en JSON, sin inventar. */
export const INSTRUCCIONES_FACTURA = `Eres un asistente contable en Panamá. Lee la factura o recibo adjunto y responde SOLO un objeto JSON, sin texto antes ni después, con estas claves:
{"proveedor": string|null, "ruc": string|null, "dv": string|null, "fecha": "AAAA-MM-DD"|null, "numero": string|null, "subtotal": number|null, "itbms": number|null, "total": number|null, "moneda": "USD"|"CRC"|string|null, "concepto": string|null}
- "proveedor": el nombre de quien emite la factura (no el cliente).
- "ruc" y "dv": los del emisor, tal como aparecen (el DV va aparte si viene como "DV").
- "itbms": el impuesto (7 %, 10 % o 15 %) en dinero; 0 si dice exento.
- "total": el monto final a pagar. Números con punto decimal, sin símbolos.
- "concepto": qué se compró, en pocas palabras (máximo 80 caracteres).
- Si un dato no aparece o no se lee, pon null. No inventes.`;

export type MedioFactura = { tipo: "imagen"; mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif" } | { tipo: "pdf" };

/** El cuerpo del pedido a la API de mensajes, con el archivo en base64. */
export function pedidoFactura(medio: MedioFactura, base64: string, modelo = MODELO_PREDETERMINADO) {
  const archivo =
    medio.tipo === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: medio.mime, data: base64 } };
  return {
    model: modelo,
    max_tokens: 800,
    messages: [{ role: "user", content: [archivo, { type: "text", text: INSTRUCCIONES_FACTURA }] }],
  };
}

export interface FacturaLeida {
  proveedor: string | null;
  ruc: string | null;
  dv: string | null;
  /** Error del RUC/DV leído (formato o DV que no coincide). */
  rucError: string | null;
  fecha: string | null;
  numero: string | null;
  subtotal: number | null;
  itbms: number | null;
  total: number | null;
  moneda: string;
  concepto: string | null;
}

const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const numero = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : NaN;
  return Number.isFinite(n) && Math.abs(n) < 100_000_000 ? Math.round(n * 100) / 100 : null;
};
const fecha = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};

/**
 * Saca la factura de la respuesta de la API (el texto del primer bloque, que debe ser JSON; se toleran ``` y texto
 * alrededor). No confía en nada: cada campo se limpia, la fecha se valida y el RUC pasa por la validación de la DGI.
 */
export function leerRespuestaFactura(respuesta: unknown): FacturaLeida | { error: string } {
  const contenido = (respuesta as { content?: { type?: string; text?: string }[] })?.content;
  const crudo = Array.isArray(contenido) ? contenido.filter((c) => c?.type === "text").map((c) => c.text ?? "").join("\n") : "";
  const inicio = crudo.indexOf("{");
  const fin = crudo.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return { error: "La respuesta no trae los datos de la factura." };
  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(crudo.slice(inicio, fin + 1));
  } catch {
    return { error: "La respuesta no se pudo interpretar." };
  }
  const rucTexto = texto(datos.ruc, 40);
  const v = rucTexto ? validarRucDv(rucTexto, texto(datos.dv, 4) ?? "") : null;
  const total = numero(datos.total);
  const itbms = numero(datos.itbms);
  const subtotal = numero(datos.subtotal) ?? (total !== null && itbms !== null ? Math.round((total - itbms) * 100) / 100 : null);
  const moneda = texto(datos.moneda, 3)?.toUpperCase();
  return {
    proveedor: texto(datos.proveedor, 120),
    ruc: v ? v.ruc || rucTexto : null,
    dv: v?.dv ?? null,
    rucError: v?.error ?? null,
    fecha: fecha(datos.fecha),
    numero: texto(datos.numero, 60),
    subtotal,
    itbms,
    total,
    moneda: moneda && /^[A-Z]{3}$/.test(moneda) ? moneda : "USD",
    concepto: texto(datos.concepto, 80),
  };
}

/** La descripción con que se propone el movimiento: «Proveedor · concepto · Fact. 123». */
export function descripcionDeFactura(f: FacturaLeida): string {
  return [f.proveedor, f.concepto, f.numero ? `Fact. ${f.numero}` : null].filter(Boolean).join(" · ").slice(0, 500);
}
