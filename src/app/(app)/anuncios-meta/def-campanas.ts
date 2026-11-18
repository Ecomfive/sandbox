import { confiable, resultado, type Resultados } from "@/lib/meta-ads/metricas";
import { NOMBRE_ETAPA, NOMBRE_PUJA } from "@/lib/meta-ads/nombre";
import type { CampanaVista } from "@/lib/meta-ads/vistas";
import type { DefTabla } from "@/lib/tabla/motor";
import { nombreEstado } from "./piezas";

/** Cómo le va a una campaña en el periodo: deja, pierde, o todavía no hay datos para decirlo. */
export type Veredicto = "deja" | "pierde" | "poca_data" | "sin_gasto";
export const veredictoDeResultados = (r: Resultados, tope: number): Veredicto => (r.gasto === 0 ? "sin_gasto" : !confiable(r) ? "poca_data" : resultado(r, tope) >= 0 ? "deja" : "pierde");
export const veredictoDe = (c: CampanaVista): Veredicto => veredictoDeResultados(c.r, c.tope);
export const NOMBRE_VEREDICTO: Record<Veredicto, string> = { deja: "Deja ganancia", pierde: "Está perdiendo", poca_data: "Poca data", sin_gasto: "Sin gasto en el periodo" };

const SIN = "__sin_valor__";

export const DEF_CAMPANAS: DefTabla<CampanaVista> = {
  clave: "anuncios-meta-campanas",
  vistaInicial: { agrupar: "etapa" },
  campos: [
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (c) => c.nombre },
    { id: "veredicto", etiqueta: "Cómo le va", tipo: "seleccion", valores: (c) => [veredictoDe(c)], opciones: () => (Object.keys(NOMBRE_VEREDICTO) as Veredicto[]).map((v) => ({ valor: v, etiqueta: NOMBRE_VEREDICTO[v] })), agrupable: true, ordenGrupos: ["pierde", "deja", "poca_data", "sin_gasto"] },
    { id: "etapa", etiqueta: "Etapa", tipo: "seleccion", valores: (c) => [c.etapa ?? SIN], opciones: () => [...(Object.keys(NOMBRE_ETAPA) as (keyof typeof NOMBRE_ETAPA)[]).map((e) => ({ valor: e, etiqueta: NOMBRE_ETAPA[e] })), { valor: SIN, etiqueta: "Sin etapa" }], agrupable: true, ordenGrupos: ["testing", "escala", "retargeting"] },
    { id: "estado", etiqueta: "Estado en Meta", tipo: "seleccion", valores: (c) => [c.activa ? "activa" : "apagada"], opciones: () => [{ valor: "activa", etiqueta: "Activa" }, { valor: "apagada", etiqueta: "Pausada o archivada" }], agrupable: true },
    { id: "estructura", etiqueta: "CBO o ABO", tipo: "seleccion", valores: (c) => [c.estructura ?? SIN], etiquetaSinValor: "Sin dato", agrupable: true },
    { id: "puja", etiqueta: "Puja", tipo: "seleccion", valores: (c) => [c.puja ? NOMBRE_PUJA[c.puja] : SIN], etiquetaSinValor: "Sin dato", agrupable: true },
    { id: "producto", etiqueta: "Producto", tipo: "seleccion", valores: (c) => [c.producto ?? SIN], etiquetaSinValor: "Sin producto", agrupable: true },
    { id: "angulo", etiqueta: "Ángulo", tipo: "seleccion", valores: (c) => [c.angulo ?? SIN], etiquetaSinValor: "Sin ángulo", agrupable: true },
    { id: "mercado", etiqueta: "Audiencia y país", tipo: "seleccion", valores: (c) => [c.mercado ?? SIN], etiquetaSinValor: "Sin dato", agrupable: true },
    { id: "videos", etiqueta: "Tanda de videos", tipo: "seleccion", valores: (c) => [c.videos ?? SIN], etiquetaSinValor: "Sin tanda", agrupable: true },
    { id: "cuenta", etiqueta: "Cuenta publicitaria", tipo: "seleccion", valores: (c) => [c.cuentaNombre || SIN], agrupable: true },
    { id: "persona", etiqueta: "Quién la montó (por el nombre)", tipo: "seleccion", valores: (c) => [c.persona ?? SIN], etiquetaSinValor: "No se sabe", agrupable: true },
    { id: "meta", etiqueta: "Estado exacto", tipo: "seleccion", valores: (c) => [nombreEstado(c.estado)], agrupable: false, sinCsv: true },
    { id: "gasto", etiqueta: "Gasto del periodo", tipo: "numero", sinCsv: true, valor: (c) => c.r.gasto },
    { id: "compras", etiqueta: "Compras del periodo", tipo: "numero", sinCsv: true, valor: (c) => c.r.compras },
    { id: "creada", etiqueta: "Creada", tipo: "fecha", valor: (c) => (c.creadaEn ? c.creadaEn.slice(0, 10) : null) },
  ],
  csvAntes: [
    { etiqueta: "Campaña", valor: (c) => c.nombre },
    { etiqueta: "Gasto", valor: (c) => Number(c.r.gasto.toFixed(2)) },
    { etiqueta: "Compras", valor: (c) => c.r.compras },
    { etiqueta: "CPA", valor: (c) => (c.r.compras > 0 ? Number((c.r.gasto / c.r.compras).toFixed(2)) : null) },
    { etiqueta: "CPA tope", valor: (c) => c.tope },
    { etiqueta: "Resultado estimado", valor: (c) => Number(resultado(c.r, c.tope).toFixed(2)) },
  ],
  pdf: ["Campaña", "Cómo le va", "Etapa", "Producto", "Gasto", "Compras", "CPA", "Resultado estimado"],
  total: (c) => c.r.gasto,
};
