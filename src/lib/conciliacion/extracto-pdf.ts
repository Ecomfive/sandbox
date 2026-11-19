// Leer un extracto bancario en PDF con la API de Anthropic (mejora 11). Lógica pura (sin red): el pedido, cómo se lee la
// respuesta y el cuadre con los saldos. La llamada vive en `conciliacion-bancaria/importar/actions.ts`. El resultado es
// una hoja «generico» igual a la de un Excel, con la misma huella: el mismo extracto subido en PDF y en Excel no se duplica.
// Prueba en `extracto-pdf.test.ts`.

import { huella } from "@/lib/finanzas/libro-excel";
import type { HojaLeida, LineaLeida } from "./leer-excel";

export const MODELO_EXTRACTO = "claude-sonnet-5-5";
/** Más líneas que esto no caben en una respuesta: el extracto se parte por meses. */
export const MAX_LINEAS_PDF = 400;

export const INSTRUCCIONES_EXTRACTO = `Eres un asistente contable. El archivo adjunto es un estado de cuenta bancario. Responde SOLO un objeto JSON, sin texto antes ni después:
{"banco": string|null, "cuenta": string|null, "moneda": "USD"|"CRC"|string|null, "saldo_inicial": number|null, "saldo_final": number|null, "lineas": [{"fecha": "AAAA-MM-DD", "descripcion": string, "referencia": string|null, "debito": number|null, "credito": number|null, "saldo": number|null}]}
- Una entrada en "lineas" por cada movimiento, en el orden del extracto. No incluyas el saldo anterior, subtotales ni totales.
- "debito": lo que sale de la cuenta (positivo). "credito": lo que entra (positivo). Uno de los dos, el otro null.
- "referencia": el número de referencia, documento o cheque si aparece; si no, null.
- "saldo": el saldo después del movimiento si el extracto lo muestra.
- "cuenta": solo los últimos 4 dígitos del número de cuenta.
- Números con punto decimal, sin símbolos ni separadores de miles. Si un dato no se lee, null. No inventes movimientos.`;

/** El cuerpo del pedido a la API de mensajes, con el PDF en base64. */
export function pedidoExtracto(base64: string, modelo = MODELO_EXTRACTO) {
  return {
    model: modelo,
    max_tokens: 32000,
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
          { type: "text", text: INSTRUCCIONES_EXTRACTO },
        ],
      },
    ],
  };
}

const texto = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.-]/g, "")) : NaN;
  return Number.isFinite(n) && Math.abs(n) < 1_000_000_000 ? Math.round(n * 100) / 100 : null;
};
const fecha = (v: unknown) => {
  const s = typeof v === "string" ? v.trim() : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
};

export interface ExtractoPdf {
  hoja: HojaLeida;
  banco: string | null;
  cuenta: string | null;
  moneda: string | null;
  saldoInicial: number | null;
  saldoFinal: number | null;
  /** Saldo inicial + movimientos − saldo final (0 = cuadra; null = no hay saldos para comprobar). */
  diferencia: number | null;
}

/** Saca el JSON del texto del modelo (tolera bloques ```json). */
function jsonDe(respuesta: unknown): Record<string, unknown> | null {
  const contenido = (respuesta as { content?: { type?: string; text?: string }[] } | null)?.content;
  const t = Array.isArray(contenido) ? contenido.filter((c) => c?.type === "text").map((c) => c.text ?? "").join("") : "";
  const ini = t.indexOf("{");
  const fin = t.lastIndexOf("}");
  if (ini < 0 || fin <= ini) return null;
  try {
    const v = JSON.parse(t.slice(ini, fin + 1));
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** La respuesta del modelo como hoja de extracto. `nombre` es el del archivo (va como nombre de la hoja). */
export function leerRespuestaExtracto(respuesta: unknown, nombre: string): ExtractoPdf | { error: string } {
  const j = jsonDe(respuesta);
  if (!j) return { error: "No pude leer el extracto. ¿Es un estado de cuenta en PDF con texto legible?" };
  const crudas = Array.isArray(j.lineas) ? (j.lineas as unknown[]) : [];
  const hojaNombre = (texto(nombre.replace(/\.pdf$/i, ""), 60) ?? "Extracto PDF").slice(0, 60);
  const hoja: HojaLeida = { hoja: hojaNombre, formato: "generico", lineas: [], cobros: [], ordenes: [], descartadas: [] };
  const vistas = new Map<string, number>();
  crudas.slice(0, MAX_LINEAS_PDF).forEach((c, i) => {
    const m = (c && typeof c === "object" ? c : {}) as Record<string, unknown>;
    const f = fecha(m.fecha);
    const credito = numero(m.credito) ?? 0;
    const debito = numero(m.debito) ?? 0;
    const valor = Math.round((Math.abs(credito) - Math.abs(debito)) * 100) / 100;
    if (!f) return void hoja.descartadas.push({ hoja: hojaNombre, fila: i + 1, motivo: "sin fecha" });
    if (!valor) return void hoja.descartadas.push({ hoja: hojaNombre, fila: i + 1, motivo: "sin monto" });
    const descripcion = texto(m.descripcion, 300) ?? "";
    const referencia = texto(m.referencia, 80);
    // El mismo contenido que una línea leída del Excel (`leerExtracto`): misma huella.
    const contenido = [f, referencia, null, null, descripcion, valor.toFixed(2)].join("|");
    const ordinal = (vistas.get(contenido) ?? 0) + 1;
    vistas.set(contenido, ordinal);
    const linea: LineaLeida = {
      hoja: hojaNombre,
      fila: i + 1,
      orden: hoja.lineas.length + 1,
      fecha: f,
      descripcion,
      referencia,
      referencia_extra: null,
      codigo: null,
      monto: valor,
      saldo: numero(m.saldo),
      tienda: null,
      estado_excel: null,
      huella: `${huella(contenido)}#${ordinal}`,
    };
    hoja.lineas.push(linea);
  });
  if (crudas.length > MAX_LINEAS_PDF) hoja.descartadas.push({ hoja: hojaNombre, fila: MAX_LINEAS_PDF + 1, motivo: `más de ${MAX_LINEAS_PDF} líneas: sube el extracto por meses` });
  if (!hoja.lineas.length) return { error: "El PDF no trae movimientos que se puedan leer." };
  const saldoInicial = numero(j.saldo_inicial);
  const saldoFinal = numero(j.saldo_final);
  return {
    hoja,
    banco: texto(j.banco, 60),
    cuenta: texto(j.cuenta, 12),
    moneda: texto(j.moneda, 3),
    saldoInicial,
    saldoFinal,
    diferencia: cuadreSaldos(saldoInicial, saldoFinal, hoja.lineas),
  };
}

/** Saldo inicial + movimientos − saldo final, redondeado (null si falta un saldo). */
export function cuadreSaldos(inicial: number | null, final: number | null, lineas: { monto: number }[]): number | null {
  if (inicial === null || final === null) return null;
  return Math.round((inicial + lineas.reduce((a, l) => a + l.monto, 0) - final) * 100) / 100;
}
