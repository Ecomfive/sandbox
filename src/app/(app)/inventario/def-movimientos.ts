import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

export interface FilaMovimiento {
  id: string;
  fecha: string;
  sku: string;
  producto: string;
  tipo: string;
  cantidad: number;
  fuente: string | null;
}

/** Filtros y agrupación de los movimientos de inventario (sin total por grupo: mezclaría entradas y salidas). */
export const DEF_MOVIMIENTOS: DefTabla<FilaMovimiento> = {
  clave: "inventario-movimientos",
  campos: [
    {
      id: "tipo",
      etiqueta: "Tipo",
      tipo: "seleccion",
      valores: (m) => [m.tipo],
      agrupable: true,
    },
    {
      id: "fuente",
      etiqueta: "Fuente",
      tipo: "seleccion",
      valores: (m) => [m.fuente || SIN_VALOR],
      etiquetaSinValor: "Sin fuente",
      agrupable: true,
    },
    { id: "sku", etiqueta: "SKU", tipo: "texto", valor: (m) => m.sku },
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (m) => m.producto },
    { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (m) => m.fecha },
    { id: "cantidad", etiqueta: "Cantidad", tipo: "numero", valor: (m) => m.cantidad },
  ],
};
