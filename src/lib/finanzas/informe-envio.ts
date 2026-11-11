// Informe mensual por correo, resumen semanal por WhatsApp y versiones de los informes (mejoras 89, 90 y 95). Lógica pura:
// el contenido del informe se guarda como «foto» (`SnapshotInforme`, jsonb en `fin_informes_versiones`) y de esa foto
// salen el texto, el correo (HTML con todo escapado) y la vista de una versión anterior. La carga vive en
// `cargar-informe-envio.ts`; prueba en `informe-envio.test.ts`.

import { dinero, porcentaje, puntos } from "@/lib/af4/formato";
import { mesCorto, mesLargo } from "@/lib/af4/fecha";
import type { Accion, Causa, CifrasMes, Implicancias, TiendaMes } from "./informe";
import { variacion } from "./eerr";

/** La foto del informe mensual: todo lo que se muestra o se envía, ya calculado. */
export interface SnapshotInforme {
  version: 1;
  mes: string;
  anterior: string;
  actual: CifrasMes;
  previo: CifrasMes;
  causas: Causa[];
  tiendas: TiendaMes[];
  implicancias: Implicancias;
  multiplo: number;
  acciones: Accion[];
  /** La explicación de la variación (escrita o revisada por una persona), si la hay. */
  explicacion: string | null;
  generadoEn: string;
}

/** La foto del resumen semanal de WhatsApp. */
export interface SnapshotSemanal {
  version: 1;
  semana: string;
  hasta: string;
  ventas: { ordenes: number; total: number; entregadas: number } | null;
  caja: { saldo: number; fecha: string | null } | null;
  alertas: { total: number; criticas: number; titulos: string[] };
  generadoEn: string;
}

const pct = (v: number | null) => (v === null ? "—" : porcentaje(v, { conSigno: true }));
const pts = (a: number | null, b: number | null) => (a === null || b === null ? "—" : puntos(a - b));

/** Escapa un texto para meterlo en HTML (también en atributos). */
export const escaparHtml = (t: string): string =>
  t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const asuntoInforme = (s: SnapshotInforme) => `Informe financiero · ${mesLargo(s.mes)}`;

/** El informe en texto (para copiar, para la versión y como respaldo del correo). */
export function textoInforme(s: SnapshotInforme): string {
  const a = s.actual;
  const p = s.previo;
  return [
    `Informe financiero · ${mesCorto(s.mes)} (vs. ${mesCorto(s.anterior)}) · USD`,
    "",
    "1. Desempeño",
    `- Ingresos netos: ${dinero(a.ingresos)} (${pct(variacion(a.ingresos, p.ingresos))})`,
    `- Margen bruto: ${dinero(a.margenBruto)} · ${porcentaje(a.margenBrutoPct)} (${pts(a.margenBrutoPct, p.margenBrutoPct)})`,
    `- EBITDA: ${dinero(a.ebitda)} · ${porcentaje(a.margenEbitdaPct)} (${pct(variacion(a.ebitda, p.ebitda))})`,
    `- Resultado neto: ${dinero(a.resultadoNeto)}`,
    ...(s.explicacion ? ["", s.explicacion] : []),
    "",
    "2. Qué lo explica",
    ...(s.causas.length
      ? s.causas.map((c) => `- ${c.tipo} (${c.etiqueta}): ${dinero(c.anterior)} → ${dinero(c.actual)}, ${c.impacto >= 0 ? "suma" : "resta"} ${dinero(Math.abs(c.impacto))}`)
      : ["- Ninguna línea cambió."]),
    ...(s.tiendas.length ? ["", "Por tienda (EBITDA):", ...s.tiendas.map((t) => `- ${t.nombre}: ${dinero(t.ebitda)} (antes ${dinero(t.ebitdaAnterior)})`)] : []),
    "",
    "3. Qué significa",
    `- Al ritmo de este mes: EBITDA anual ${dinero(s.implicancias.ebitdaAnualMes)}, valor de empresa ${dinero(s.implicancias.valorEmpresaMes)} (${s.multiplo}×).`,
    `- Contra el ritmo del mes anterior: ${dinero(s.implicancias.valorCreado, "USD", { conSigno: true })} de valor.`,
    "",
    "4. Qué hacer",
    ...(s.acciones.length ? s.acciones.map((x) => `- ${x.texto}`) : ["- Sin alertas este mes."]),
  ].join("\n");
}

const fila = (etiqueta: string, valor: string, detalle = "") =>
  `<tr><td style="padding:6px 12px 6px 0;color:#555">${escaparHtml(etiqueta)}</td><td style="padding:6px 0;text-align:right;font-variant-numeric:tabular-nums"><strong>${escaparHtml(valor)}</strong></td><td style="padding:6px 0 6px 12px;color:#777;text-align:right">${escaparHtml(detalle)}</td></tr>`;

/**
 * El correo del informe: un resumen (desempeño, causas, tiendas, acciones) y el enlace al portal. Todo lo que viene de
 * datos (nombres de tipos y tiendas, la explicación escrita por una persona) va escapado; el enlace se acepta solo si es
 * https.
 */
export function htmlInformeCorreo(s: SnapshotInforme, enlace: string): string {
  const a = s.actual;
  const p = s.previo;
  const url = /^https:\/\/[^\s"'<>]+$/.test(enlace) ? enlace : null;
  const lista = (items: string[]) => (items.length ? `<ul style="padding-left:18px;margin:8px 0">${items.map((i) => `<li style="margin:4px 0">${escaparHtml(i)}</li>`).join("")}</ul>` : "");
  const h2 = (t: string) => `<h2 style="font-size:15px;margin:24px 0 8px">${escaparHtml(t)}</h2>`;
  return [
    `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1a1a1a;max-width:640px">`,
    `<h1 style="font-size:20px;margin:0 0 4px">${escaparHtml(asuntoInforme(s))}</h1>`,
    `<p style="margin:0 0 16px;color:#666">Comparado con ${escaparHtml(mesLargo(s.anterior))} · USD</p>`,
    h2("Desempeño"),
    `<table style="border-collapse:collapse;width:100%;font-size:14px">`,
    fila("Ingresos netos", dinero(a.ingresos), pct(variacion(a.ingresos, p.ingresos))),
    fila("Margen bruto", dinero(a.margenBruto), porcentaje(a.margenBrutoPct)),
    fila("EBITDA", dinero(a.ebitda), pct(variacion(a.ebitda, p.ebitda))),
    fila("Resultado neto", dinero(a.resultadoNeto)),
    fila("Valor de empresa (ritmo del mes)", dinero(s.implicancias.valorEmpresaMes), `${s.multiplo}× EBITDA`),
    `</table>`,
    s.explicacion ? `<p style="margin:12px 0;white-space:pre-line">${escaparHtml(s.explicacion)}</p>` : "",
    s.causas.length ? h2("Qué lo explica") + lista(s.causas.map((c) => `${c.tipo}: ${dinero(c.anterior)} → ${dinero(c.actual)} (${c.impacto >= 0 ? "suma" : "resta"} ${dinero(Math.abs(c.impacto))})`)) : "",
    s.tiendas.length ? h2("EBITDA por tienda") + lista(s.tiendas.map((t) => `${t.nombre}: ${dinero(t.ebitda)} (antes ${dinero(t.ebitdaAnterior)})`)) : "",
    h2("Qué hacer"),
    lista(s.acciones.length ? s.acciones.map((x) => x.texto) : ["Sin alertas este mes."]),
    url ? `<p style="margin:24px 0"><a href="${escaparHtml(url)}" style="color:#b91c1c">Abrir el informe completo en el portal</a></p>` : "",
    `</div>`,
  ].join("");
}

/** El resumen semanal en texto, para WhatsApp. Solo cifras agregadas. */
export function textoSemanal(s: SnapshotSemanal): string {
  const lineas = [`*Resumen semanal · ${s.semana} al ${s.hasta}*`, ""];
  if (s.ventas) lineas.push(`Ventas: ${dinero(s.ventas.total)} en ${s.ventas.ordenes} órdenes (${s.ventas.entregadas} entregadas)`);
  if (s.caja) lineas.push(`Caja: ${dinero(s.caja.saldo)}${s.caja.fecha ? ` al ${s.caja.fecha}` : ""}`);
  lineas.push(s.alertas.total ? `Alertas abiertas: ${s.alertas.total}${s.alertas.criticas ? ` (${s.alertas.criticas} críticas)` : ""}` : "Sin alertas abiertas");
  for (const t of s.alertas.titulos.slice(0, 5)) lineas.push(`- ${t}`);
  return lineas.join("\n");
}

/** El enlace para mandar un texto a mano por WhatsApp (sin número: la persona elige a quién). */
export const enlaceWhatsapp = (texto: string, numero?: string) =>
  `https://wa.me/${numero ? numero.replace(/\D/g, "") : ""}?text=${encodeURIComponent(texto)}`;

const CORREO = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[a-z]{2,24}$/i;

/** Una lista de correos (texto separado por comas, saltos o «;», o un arreglo) limpia: válidos, sin repetir, hasta 30. */
export function leerCorreos(v: unknown): string[] {
  const partes = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/[\s,;]+/) : [];
  return [...new Set(partes.map((x) => x.trim().toLowerCase()).filter((x) => CORREO.test(x)))].slice(0, 30);
}

/** Una lista de teléfonos para WhatsApp en formato internacional sin «+» (8 a 15 cifras), sin repetir, hasta 20. */
export function leerTelefonos(v: unknown): string[] {
  const partes = Array.isArray(v) ? v.map(String) : typeof v === "string" ? v.split(/[\n,;]+/) : [];
  return [...new Set(partes.map((x) => x.replace(/[\s()+.-]/g, "")).filter((x) => /^\d{8,15}$/.test(x)))].slice(0, 20);
}

/** Lo mínimo que tiene que tener una foto guardada para mostrarla (una versión vieja o rota no rompe la página). */
export function esSnapshotInforme(v: unknown): v is SnapshotInforme {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<SnapshotInforme>;
  return s.version === 1 && typeof s.mes === "string" && typeof s.anterior === "string" && !!s.actual && !!s.previo && Array.isArray(s.causas) && Array.isArray(s.acciones);
}

export function esSnapshotSemanal(v: unknown): v is SnapshotSemanal {
  if (!v || typeof v !== "object") return false;
  const s = v as Partial<SnapshotSemanal>;
  return s.version === 1 && typeof s.semana === "string" && !!s.alertas;
}

/** ¿Hay que mandar el informe hoy? El día 5 del mes (o el que se configure), del mes anterior. */
export const DIA_INFORME = 5;
export function mesAInformar(hoy: string): string {
  const [a, m] = hoy.split("-").map(Number);
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10);
}

/** Envío por WhatsApp con la API compatible con Evolution API: POST {url}/message/sendText/{instancia}. */
export interface ConfigWhatsapp {
  url: string;
  token: string;
  instancia: string;
}

/** La configuración de WhatsApp desde las variables de entorno, o null (sin ella, se manda a mano con wa.me). */
export function configWhatsapp(env: Record<string, string | undefined>): ConfigWhatsapp | null {
  const url = (env.WHATSAPP_API_URL ?? "").trim().replace(/\/+$/, "");
  const token = (env.WHATSAPP_API_TOKEN ?? "").trim();
  const instancia = (env.WHATSAPP_INSTANCIA ?? "ecomfive").trim();
  if (!/^https:\/\/[^\s]+$/.test(url) || !token || !/^[\w-]{1,60}$/.test(instancia)) return null;
  return { url, token, instancia };
}
