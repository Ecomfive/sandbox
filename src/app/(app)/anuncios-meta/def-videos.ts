import { confiable, cpa, ctr, holdRate, hookRate, llegaAlLlamado } from "@/lib/meta-ads/metricas";
import { NOMBRE_ETAPA } from "@/lib/meta-ads/nombre";
import { VERSION_ANALISIS } from "@/lib/meta-ads/video-angulo";
import type { VideoVista } from "@/lib/meta-ads/vistas";
import type { DefTabla } from "@/lib/tabla/motor";
import { NOMBRE_VEREDICTO, veredictoDeResultados, type Veredicto } from "./def-campanas";

const SIN = "__sin_valor__";

/** El ángulo que se le conoce al video: el del análisis (o el corregido a mano) y, si no, el que traían sus campañas. */
export const anguloDeVideo = (v: VideoVista): string | null => v.analisis?.angulo ?? v.angulo ?? null;

/** Los nombres de las campañas donde corre el video, sin repetir. */
export const campanasDeVideo = (v: VideoVista): string[] => [...new Set(v.anunciosDetalle.map((a) => a.campanaNombre).filter(Boolean))];

type EstadoAnalisis = "analizado" | "provisional" | "error" | "sin_analizar";
const NOMBRE_ANALISIS: Record<EstadoAnalisis, string> = { analizado: "Analizado con el video", provisional: "Provisional (solo el texto)", error: "Con error", sin_analizar: "Sin analizar" };
const estadoAnalisis = (v: VideoVista): EstadoAnalisis => (!v.analisis ? "sin_analizar" : v.analisis.estado === "analizado" ? "analizado" : v.analisis.estado === "sin_archivo" ? "provisional" : "error");

/**
 * Los videos con la barra común: se filtran, buscan y agrupan por ángulo, producto, campaña, etapa, formato, cómo les va o si ya los vio la IA, y por rangos de gasto, compras, CPA, hook, CTR… (18 nov 2026,
 * pedido de Alcides). El orden de las filas no lo hace la barra: lo elige el selector «Ordenar por» de la lista (`orden-videos.ts`).
 */
export const DEF_VIDEOS: DefTabla<VideoVista> = {
  clave: "anuncios-meta-videos",
  campos: [
    { id: "nombre", etiqueta: "Nombre del video", tipo: "texto", valor: (v) => `${v.numero ?? ""} ${v.nombre} ${v.producto ?? ""} ${anguloDeVideo(v) ?? ""}` },
    { id: "campanaTexto", etiqueta: "Nombre de la campaña", tipo: "texto", sinCsv: true, valor: (v) => campanasDeVideo(v).join(" ") },
    { id: "angulo", etiqueta: "Ángulo", tipo: "seleccion", valores: (v) => [anguloDeVideo(v) ?? SIN], etiquetaSinValor: "Sin ángulo", agrupable: true },
    { id: "producto", etiqueta: "Producto", tipo: "seleccion", valores: (v) => [v.producto ?? SIN], etiquetaSinValor: "Sin producto", agrupable: true },
    { id: "campana", etiqueta: "Campaña donde se usa", tipo: "seleccion", valores: (v) => (campanasDeVideo(v).length ? campanasDeVideo(v) : [SIN]), etiquetaSinValor: "Sin campaña", agrupable: true },
    { id: "etapa", etiqueta: "Etapa de la campaña", tipo: "seleccion", valores: (v) => { const e = [...new Set(v.anunciosDetalle.map((a) => a.etapa).filter((x): x is NonNullable<typeof x> => !!x))]; return e.length ? e : [SIN]; }, opciones: () => [...(Object.keys(NOMBRE_ETAPA) as (keyof typeof NOMBRE_ETAPA)[]).map((e) => ({ valor: e, etiqueta: NOMBRE_ETAPA[e] })), { valor: SIN, etiqueta: "Sin etapa" }], agrupable: true, ordenGrupos: ["testing", "escala", "retargeting"] },
    { id: "veredicto", etiqueta: "Cómo le va", tipo: "seleccion", valores: (v) => [veredictoDeResultados(v.r, v.tope)], opciones: () => (Object.keys(NOMBRE_VEREDICTO) as Veredicto[]).map((x) => ({ valor: x, etiqueta: NOMBRE_VEREDICTO[x] })), agrupable: true, ordenGrupos: ["deja", "pierde", "poca_data", "sin_gasto"] },
    { id: "datos", etiqueta: "Cantidad de datos", tipo: "seleccion", valores: (v) => [confiable(v.r) ? "suficiente" : "poca"], opciones: () => [{ valor: "suficiente", etiqueta: "Data suficiente" }, { valor: "poca", etiqueta: "Poca data" }], agrupable: true },
    { id: "analisis", etiqueta: "Análisis de la IA", tipo: "seleccion", valores: (v) => [estadoAnalisis(v)], opciones: () => (Object.keys(NOMBRE_ANALISIS) as EstadoAnalisis[]).map((x) => ({ valor: x, etiqueta: NOMBRE_ANALISIS[x] })), agrupable: true },
    { id: "gancho", etiqueta: "Tipo de gancho", tipo: "seleccion", valores: (v) => [v.analisis?.ganchoTipo ?? SIN], etiquetaSinValor: "Sin clasificar", agrupable: true },
    { id: "formato", etiqueta: "Formato del video", tipo: "seleccion", valores: (v) => [v.analisis?.formato ?? SIN], etiquetaSinValor: "Sin dato", agrupable: true },
    { id: "ctaTipo", etiqueta: "Tipo de llamado a la acción", tipo: "seleccion", valores: (v) => [v.analisis?.estado === "analizado" && v.analisis.version >= VERSION_ANALISIS ? (v.analisis.ctaTipo ?? SIN) : SIN], etiquetaSinValor: "Sin dato", agrupable: true },
    { id: "recurso", etiqueta: "Recursos que usa", tipo: "seleccion", valores: (v) => (v.analisis?.recursos.length ? v.analisis.recursos : [SIN]), etiquetaSinValor: "Sin dato", agrupable: true },
    { id: "activo", etiqueta: "En anuncios activos", tipo: "seleccion", valores: (v) => [v.anunciosDetalle.some((a) => a.activo) ? "si" : "no"], opciones: () => [{ valor: "si", etiqueta: "Sí, hay anuncios activos" }, { valor: "no", etiqueta: "No, todos apagados" }], agrupable: true },
    { id: "gasto", etiqueta: "Gasto", tipo: "numero", sinCsv: true, valor: (v) => v.r.gasto },
    { id: "compras", etiqueta: "Compras", tipo: "numero", sinCsv: true, valor: (v) => v.r.compras },
    { id: "cpa", etiqueta: "CPA", tipo: "numero", sinCsv: true, valor: (v) => cpa(v.r) },
    { id: "hook", etiqueta: "Hook (3 s) en %", tipo: "numero", sinCsv: true, valor: (v) => hookRate(v.r) },
    { id: "hold", etiqueta: "Pasan 15 s en %", tipo: "numero", sinCsv: true, valor: (v) => holdRate(v.r) },
    { id: "llegaCta", etiqueta: "Llegan al llamado en %", tipo: "numero", sinCsv: true, valor: (v) => llegaAlLlamado(v.r, v.analisis?.ctaSegundo ?? null, v.analisis?.duracionS ?? null) },
    { id: "ctr", etiqueta: "CTR del enlace en %", tipo: "numero", sinCsv: true, valor: (v) => ctr(v.r) },
    { id: "campanas", etiqueta: "Campañas donde se usa", tipo: "numero", sinCsv: true, valor: (v) => v.campanas },
    { id: "anuncios", etiqueta: "Anuncios donde se usa", tipo: "numero", sinCsv: true, valor: (v) => v.anuncios },
  ],
  csvAntes: [
    { etiqueta: "Video", valor: (v) => v.nombre },
    { etiqueta: "Número", valor: (v) => v.numero },
    { etiqueta: "Gasto del periodo", valor: (v) => Number(v.r.gasto.toFixed(2)) },
    { etiqueta: "Compras", valor: (v) => v.r.compras },
    { etiqueta: "CPA", valor: (v) => { const c = cpa(v.r); return c === null ? null : Number(c.toFixed(2)); } },
    { etiqueta: "CPA tope", valor: (v) => v.tope },
    { etiqueta: "Hook (3 s) %", valor: (v) => { const h = hookRate(v.r); return h === null ? null : Number(h.toFixed(1)); } },
    { etiqueta: "Pasan 15 s %", valor: (v) => { const h = holdRate(v.r); return h === null ? null : Number(h.toFixed(1)); } },
    { etiqueta: "CTR del enlace %", valor: (v) => { const c = ctr(v.r); return c === null ? null : Number(c.toFixed(2)); } },
    { etiqueta: "Campañas", valor: (v) => campanasDeVideo(v).join(" | ") },
  ],
  pdf: ["Video", "Producto", "Ángulo", "Gasto del periodo", "Compras", "CPA", "Hook (3 s) %", "Campañas"],
};
