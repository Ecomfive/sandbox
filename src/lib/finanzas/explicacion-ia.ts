// Explicación en texto de la variación del mes con la API de Anthropic (mejora 96). Solo cifras agregadas del informe
// (ingresos, márgenes, EBITDA y las líneas del EERR que más movieron el resultado): nunca nombres de personas, clientes
// ni proveedores. Sin `ANTHROPIC_API_KEY` la función queda apagada. La persona revisa y edita el borrador antes de
// guardarlo en el informe. Prueba en `explicacion-ia.test.ts`.

import { dinero, porcentaje } from "@/lib/af4/formato";
import { mesLargo } from "@/lib/af4/fecha";
import { variacion } from "./eerr";
import type { SnapshotInforme } from "./informe-envio";

export const MODELO_PREDETERMINADO = "claude-sonnet-4-5";
const URL_API = "https://api.anthropic.com/v1/messages";

export interface ConfigAnthropic {
  clave: string;
  modelo: string;
}

export function configAnthropic(env: Record<string, string | undefined>): ConfigAnthropic | null {
  const clave = (env.ANTHROPIC_API_KEY ?? "").trim();
  if (!clave) return null;
  const modelo = (env.ANTHROPIC_MODEL ?? "").trim();
  return { clave, modelo: /^[\w.-]{3,80}$/.test(modelo) ? modelo : MODELO_PREDETERMINADO };
}

const pct = (v: number | null) => (v === null ? "sin dato" : porcentaje(v, { conSigno: true }));

/** Lo que se le manda al modelo: solo cifras agregadas del mes y del anterior. */
export function datosParaExplicar(s: SnapshotInforme): string {
  const a = s.actual;
  const p = s.previo;
  return [
    `Mes: ${mesLargo(s.mes)} (comparado con ${mesLargo(s.anterior)}), en dólares.`,
    `Ingresos netos: ${dinero(a.ingresos)} (antes ${dinero(p.ingresos)}, ${pct(variacion(a.ingresos, p.ingresos))}).`,
    `Margen bruto: ${dinero(a.margenBruto)} = ${porcentaje(a.margenBrutoPct)} de los ingresos (antes ${porcentaje(p.margenBrutoPct)}).`,
    `EBITDA: ${dinero(a.ebitda)} = ${porcentaje(a.margenEbitdaPct)} (antes ${dinero(p.ebitda)}, ${pct(variacion(a.ebitda, p.ebitda))}).`,
    `Resultado neto: ${dinero(a.resultadoNeto)} (antes ${dinero(p.resultadoNeto)}).`,
    `Peso sobre ingresos: costo de ventas ${porcentaje(a.costoVentasPct)} (antes ${porcentaje(p.costoVentasPct)}), marketing ${porcentaje(a.marketingPct)} (antes ${porcentaje(p.marketingPct)}), administración ${porcentaje(a.administracionPct)} (antes ${porcentaje(p.administracionPct)}).`,
    "Líneas que más movieron el resultado (efecto positivo = mejora):",
    ...s.causas.map((c) => `- ${c.etiqueta} / ${c.tipo}: ${dinero(c.anterior)} → ${dinero(c.actual)}, efecto ${dinero(c.impacto, "USD", { conSigno: true })}`),
  ].join("\n");
}

export const INSTRUCCIONES =
  "Eres el CFO de una empresa de comercio electrónico en Panamá. Explica en español, en 3 a 5 frases claras y sin " +
  "viñetas, por qué cambió el resultado del mes contra el anterior: qué movió los ingresos, el margen y el EBITDA y qué " +
  "conviene mirar. Usa solo las cifras que te doy, sin inventar otras ni nombres. No uses títulos ni saludos.";

/** El cuerpo del pedido a /v1/messages. */
export function cuerpoPedido(s: SnapshotInforme, modelo: string) {
  return {
    model: modelo,
    max_tokens: 600,
    system: INSTRUCCIONES,
    messages: [{ role: "user", content: datosParaExplicar(s) }],
  };
}

/** El texto de la respuesta (los bloques de texto unidos), recortado al largo que admite el informe. */
export function textoDeRespuesta(r: unknown): string | null {
  const contenido = (r as { content?: unknown } | null)?.content;
  if (!Array.isArray(contenido)) return null;
  const t = contenido
    .filter((b): b is { type: string; text: string } => !!b && typeof b === "object" && (b as { type?: unknown }).type === "text" && typeof (b as { text?: unknown }).text === "string")
    .map((b) => b.text)
    .join("\n")
    .trim();
  return t ? t.slice(0, 4000) : null;
}

/** Pide la explicación (30 s como máximo). Devuelve el texto o el motivo por el que no se pudo. */
export async function pedirExplicacion(s: SnapshotInforme, cfg: ConfigAnthropic): Promise<{ texto: string } | { error: string }> {
  try {
    const r = await fetch(URL_API, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": cfg.clave, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(cuerpoPedido(s, cfg.modelo)),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) return { error: `La API de Anthropic respondió ${r.status}.` };
    const texto = textoDeRespuesta(await r.json());
    return texto ? { texto } : { error: "La respuesta llegó vacía." };
  } catch (e) {
    return { error: e instanceof Error && e.name === "TimeoutError" ? "La API de Anthropic tardó demasiado." : "No se pudo llamar a la API de Anthropic." };
  }
}
