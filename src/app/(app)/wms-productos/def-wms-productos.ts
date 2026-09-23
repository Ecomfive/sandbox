import type { DefTabla } from "@/lib/tabla/motor";
import { ESTADOS_PRODUCTO, ETIQUETA_ESTADO_PRODUCTO } from "@/lib/wms/producto";

export interface FilaProductoWms {
  id: string;
  titulo: string;
  estado: string;
  categoria: string;
  tipo: string;
  proveedor: string;
  /** Ruta (en el bucket) de la primera imagen, si tiene. */
  portada: string | null;
  variantes: number;
  /** Suma de «en existencia» de todas sus variantes y sucursales. */
  existencias: number;
  /** «$39.99» o «$29.99 – $49.99»; vacío si no tiene precio. */
  precio: string;
  /** Día en que se creó (AAAA-MM-DD). */
  creado: string;
}

/** Cómo se filtra y agrupa la lista de productos de la ficha Shopify (WMS). */
export const DEF_WMS_PRODUCTOS: DefTabla<FilaProductoWms> = {
  clave: "wms-productos",
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (p) => [p.estado],
      opciones: () => ESTADOS_PRODUCTO.map((valor) => ({ valor, etiqueta: ETIQUETA_ESTADO_PRODUCTO[valor] })),
      agrupable: true,
      ordenGrupos: [...ESTADOS_PRODUCTO],
    },
    { id: "titulo", etiqueta: "Producto", tipo: "texto", valor: (p) => p.titulo },
    { id: "categoria", etiqueta: "Categoría", tipo: "texto", valor: (p) => p.categoria },
    { id: "tipo", etiqueta: "Tipo", tipo: "texto", valor: (p) => p.tipo },
    { id: "proveedor", etiqueta: "Proveedor", tipo: "texto", valor: (p) => p.proveedor },
    { id: "existencias", etiqueta: "En existencia", tipo: "numero", valor: (p) => p.existencias },
    { id: "creado", etiqueta: "Creado el", tipo: "fecha", valor: (p) => p.creado },
  ],
};
