import type { LineaMes } from "@/lib/nomina/cargar";
import type { DefTabla } from "@/lib/tabla/motor";

export type FilaNomina = LineaMes;

export const ETIQUETA_TIPO = { formal: "Planilla", externa: "Externa" } as const;

const textoPagado = (f: FilaNomina) => (f.pagado === true ? "Sí" : f.pagado === false ? "No" : "Sin dato");

/**
 * Las líneas de un mes: se agrupan por tienda, tipo o cargo y por grupo se suma el costo (total asignaciones de la
 * planilla y total USDT de la externa; 1 USDT = 1 USD). El documento va enmascarado y no está en la descarga.
 */
export const DEF_NOMINA: DefTabla<FilaNomina> = {
  clave: "nomina-lineas",
  campos: [
    { id: "tienda", etiqueta: "Tienda", tipo: "seleccion", valores: (f) => [f.unidad], agrupable: true },
    { id: "tipo", etiqueta: "Tipo", tipo: "seleccion", valores: (f) => [ETIQUETA_TIPO[f.tipo]], agrupable: true },
    { id: "cargo", etiqueta: "Cargo o rol", tipo: "seleccion", valores: (f) => [f.cargo], agrupable: true },
    { id: "tramo", etiqueta: "Pago", tipo: "seleccion", valores: (f) => [f.tramo || "—"], agrupable: true },
    { id: "pagado", etiqueta: "Pagado", tipo: "seleccion", valores: (f) => [textoPagado(f)], agrupable: true },
    { id: "cuadra", etiqueta: "Fórmula", tipo: "seleccion", valores: (f) => [f.diferencia ? "No cuadra" : "Cuadra"], agrupable: true },
    { id: "nombre", etiqueta: "Persona", tipo: "texto", valor: (f) => f.nombre },
    { id: "bruto", etiqueta: "Costo", tipo: "numero", valor: (f) => f.bruto },
    { id: "neto", etiqueta: "Neto pagado", tipo: "numero", valor: (f) => f.neto },
    { id: "fecha", etiqueta: "Fecha de pago", tipo: "fecha", valor: (f) => f.fechaPago ?? "" },
  ],
  total: (f) => f.bruto,
  vistaInicial: { agrupar: "tienda" },
};
