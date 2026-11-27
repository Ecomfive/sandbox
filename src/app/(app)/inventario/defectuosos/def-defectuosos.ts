import type { DefTabla } from "@/lib/tabla/motor";
import { textoCodigos } from "@/lib/wms/codigos-producto";

/** Un producto con unidades dañadas en una bodega. */
export interface FilaDefectuoso {
  id: string;
  skuId: string;
  sku: string;
  producto: string;
  foto: string | null;
  numero: number | null;
  barras: string | null;
  bodegaId: string;
  bodega: string;
  /** Unidades dañadas en esa bodega. */
  danado: number;
  /** La última vez que entraron unidades a dañado (ISO) y la primera; null si el libro no lo tiene. */
  marcadoEn: string | null;
  primeraEn: string | null;
  /** Días desde la última marca. */
  dias: number | null;
  motivo: string | null;
  /** Lo que dice el libro de esa marca («Defectuoso», «Defectuoso: traslado desde …»). */
  referencia: string | null;
  por: string | null;
  /** El producto maneja vencimiento: sus lotes se mueven con un traslado por lote. */
  conVencimiento: boolean;
}

export const DEF_DEFECTUOSOS: DefTabla<FilaDefectuoso> = {
  clave: "wms-defectuosos",
  campos: [
    { id: "bodega", etiqueta: "Bodega", tipo: "seleccion", valores: (f) => [f.bodega], agrupable: true },
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (f) => `${f.sku} ${f.producto} ${textoCodigos(f)}` },
    { id: "danado", etiqueta: "Unidades dañadas", tipo: "numero", valor: (f) => f.danado },
    { id: "marcado", etiqueta: "Marcado el", tipo: "fecha", valor: (f) => f.marcadoEn?.slice(0, 10) ?? null },
    { id: "motivo", etiqueta: "Motivo", tipo: "texto", valor: (f) => f.motivo ?? "" },
    { id: "por", etiqueta: "Marcado por", tipo: "seleccion", valores: (f) => (f.por ? [f.por] : []), agrupable: true },
  ],
};
