import { confiable, cpa } from "@/lib/meta-ads/metricas";
import type { ProductoVista } from "@/lib/meta-ads/vistas";
import type { DefTabla } from "@/lib/tabla/motor";
import { campoPrioridad } from "./def-prioridad";
import { NOMBRE_VEREDICTO, veredictoDeResultados, type Veredicto } from "./def-campanas";

/**
 * Los productos con la barra común (buscar, filtrar y agrupar por cómo les va o si tienen campañas activas) y rangos de gasto, compras y CPA (23 nov 2026, vista por producto pedida por Alcides). El orden lo elige
 * el selector «Ordenar por» de la lista.
 */
export const DEF_PRODUCTOS: DefTabla<ProductoVista> = {
  clave: "anuncios-meta-productos",
  campos: [
    { id: "nombre", etiqueta: "Nombre del producto", tipo: "texto", valor: (p) => p.nombre },
    campoPrioridad<ProductoVista>((p) => p.pendiente),
    { id: "veredicto", etiqueta: "Cómo le va", tipo: "seleccion", valores: (p) => [veredictoDeResultados(p.r, p.tope)], opciones: () => (Object.keys(NOMBRE_VEREDICTO) as Veredicto[]).map((x) => ({ valor: x, etiqueta: NOMBRE_VEREDICTO[x] })), agrupable: true },
    { id: "datos", etiqueta: "Cantidad de datos", tipo: "seleccion", valores: (p) => [confiable(p.r) ? "suficiente" : "poca"], opciones: () => [{ valor: "suficiente", etiqueta: "Data suficiente" }, { valor: "poca", etiqueta: "Poca data" }], agrupable: true },
    { id: "activas", etiqueta: "Campañas activas", tipo: "seleccion", valores: (p) => [p.enMarcha ? "si" : "no"], opciones: () => [{ valor: "si", etiqueta: "Con campañas activas" }, { valor: "no", etiqueta: "Sin campañas activas" }], agrupable: true },
    { id: "gasto", etiqueta: "Gasto", tipo: "numero", sinCsv: true, valor: (p) => p.r.gasto },
    { id: "compras", etiqueta: "Compras", tipo: "numero", sinCsv: true, valor: (p) => p.r.compras },
    { id: "cpa", etiqueta: "CPA", tipo: "numero", sinCsv: true, valor: (p) => cpa(p.r) },
    { id: "campanas", etiqueta: "Campañas", tipo: "numero", sinCsv: true, valor: (p) => p.campanas },
    { id: "videos", etiqueta: "Videos", tipo: "numero", sinCsv: true, valor: (p) => p.videos },
  ],
  csvAntes: [
    { etiqueta: "Producto", valor: (p) => p.nombre },
    { etiqueta: "Gasto del periodo", valor: (p) => Number(p.r.gasto.toFixed(2)) },
    { etiqueta: "Compras", valor: (p) => p.r.compras },
    { etiqueta: "CPA", valor: (p) => { const c = cpa(p.r); return c === null ? null : Number(c.toFixed(2)); } },
    { etiqueta: "CPA tope", valor: (p) => p.tope },
    { etiqueta: "Campañas", valor: (p) => p.campanas },
    { etiqueta: "Campañas activas", valor: (p) => p.activas },
    { etiqueta: "Videos", valor: (p) => p.videos },
  ],
};
