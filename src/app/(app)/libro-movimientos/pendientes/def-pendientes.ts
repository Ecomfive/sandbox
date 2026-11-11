import type { DefTabla } from "@/lib/tabla/motor";
import { mesCorto } from "@/lib/af4/fecha";
import type { FilaPendiente } from "@/lib/finanzas/cargar-pendientes";

const sel = (id: keyof FilaPendiente, etiqueta: string, valor: (f: FilaPendiente) => string, formatearValor?: (v: string) => string) => ({
  id,
  etiqueta,
  tipo: "seleccion" as const,
  valores: (f: FilaPendiente) => [valor(f)],
  agrupable: true,
  ...(formatearValor ? { formatearValor } : {}),
});

/** La bandeja de pendientes: se agrupa por sugerencia, mes o lo que falta; por grupo se suma el monto. */
export const DEF_PENDIENTES: DefTabla<FilaPendiente> = {
  clave: "libro-pendientes",
  campos: [
    sel("sugOrigen", "Sugerencia", (f) => f.sugOrigen),
    sel("nivel", "Confianza", (f) => f.nivel),
    sel("falta", "Falta", (f) => f.falta),
    sel("periodo", "Mes", (f) => f.periodo, mesCorto),
    sel("cuenta", "Forma de pago", (f) => f.cuenta),
    sel("tienda", "Tienda", (f) => f.tienda),
    { id: "descripcion", etiqueta: "Descripción", tipo: "texto", valor: (f) => f.descripcion },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (f) => f.monto },
  ],
  total: (f) => f.monto,
  vistaInicial: { agrupar: "nivel" },
};
