import type { DefTabla } from "@/lib/tabla/motor";

/** Un lote con unidades y su estado de vencimiento. */
export interface FilaVencimiento {
  id: string;
  skuId: string;
  sku: string;
  producto: string;
  lote: string;
  /** Fecha de vencimiento (AAAA-MM-DD). */
  vence: string;
  /** Días que faltan (negativo si ya venció). */
  dias: number;
  cantidad: number;
  estado: "vencido" | "por_vencer" | "vigente";
}

export const ETIQUETA_ESTADO_VENCIMIENTO: Record<string, string> = { vencido: "Vencido", por_vencer: "Por vencer", vigente: "Vigente" };

export const DEF_VENCIMIENTOS: DefTabla<FilaVencimiento> = {
  clave: "wms-vencimientos",
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (f) => [f.estado],
      opciones: () => Object.entries(ETIQUETA_ESTADO_VENCIMIENTO).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      agrupable: true,
      ordenGrupos: ["vencido", "por_vencer", "vigente"],
    },
    { id: "sku", etiqueta: "SKU", tipo: "texto", valor: (f) => `${f.sku} ${f.producto}` },
    { id: "lote", etiqueta: "Lote", tipo: "texto", valor: (f) => f.lote },
    { id: "vence", etiqueta: "Vence", tipo: "fecha", valor: (f) => f.vence },
    { id: "cantidad", etiqueta: "Unidades", tipo: "numero", valor: (f) => f.cantidad },
  ],
};
