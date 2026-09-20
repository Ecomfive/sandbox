import type { DefTabla } from "@/lib/tabla/motor";

/** Un producto con inventario que salió y todavía no volvió (salidas menos entradas). */
export interface FilaPendiente {
  productoId: string;
  paisId: string;
  sku: string;
  nombre: string;
  pendiente: number;
}

/** Filtros del inventario pendiente de retorno; por grupo (si algún día se agrupa) suma lo pendiente. */
export const DEF_PENDIENTES: DefTabla<FilaPendiente> = {
  clave: "alertas-pendientes",
  campos: [
    { id: "sku", etiqueta: "SKU", tipo: "texto", valor: (p) => p.sku },
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (p) => p.nombre },
    { id: "pendiente", etiqueta: "Pendiente", tipo: "numero", valor: (p) => p.pendiente },
  ],
  total: (p) => p.pendiente,
};
