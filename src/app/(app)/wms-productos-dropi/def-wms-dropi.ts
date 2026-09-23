import type { DefTabla } from "@/lib/tabla/motor";
import { CATEGORIAS_DROPI, ETIQUETA_TIPO_DROPI, TIPOS_DROPI } from "@/lib/wms/producto-dropi";

export interface FilaProductoDropi {
  id: string;
  numero: number;
  nombre: string;
  tipo: string;
  stock: number;
  /** «$18.49» o «$3.49 – $9.99» si es variable. */
  precio: string;
  precioSugerido: string;
  precioNumero: number | null;
  categorias: string[];
  /** Nombres de las bodegas donde tiene stock, con su cantidad: «Proveedor Ecomfive: 300». */
  bodegas: string[];
  bodegasNombres: string[];
  aprobado: boolean;
  privado: boolean;
  archivado: boolean;
  /** Ruta (en el bucket) de la primera imagen, si tiene. */
  portada: string | null;
  /** Día en que se creó (AAAA-MM-DD). */
  creado: string;
}

const SI_NO = [
  { valor: "si", etiqueta: "Sí" },
  { valor: "no", etiqueta: "No" },
];

/** Cómo se filtra y agrupa la lista de productos de Dropi (WMS). «Archivados» es el botón de filas cerradas (como la pestaña Archivados de Dropi). */
export const DEF_WMS_DROPI: DefTabla<FilaProductoDropi> = {
  clave: "wms-productos-dropi",
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (p) => [p.archivado ? "archivado" : "activo"],
      opciones: () => [
        { valor: "activo", etiqueta: "Activo" },
        { valor: "archivado", etiqueta: "Archivado" },
      ],
      agrupable: true,
    },
    { id: "privado", etiqueta: "Privado", tipo: "seleccion", valores: (p) => [p.privado ? "si" : "no"], opciones: () => SI_NO, agrupable: true },
    { id: "aprobado", etiqueta: "Aprobado", tipo: "seleccion", valores: (p) => [p.aprobado ? "si" : "no"], opciones: () => SI_NO, agrupable: true },
    {
      id: "tipo",
      etiqueta: "Tipo",
      tipo: "seleccion",
      valores: (p) => [p.tipo],
      opciones: () => TIPOS_DROPI.map((t) => ({ valor: t, etiqueta: ETIQUETA_TIPO_DROPI[t] })),
      agrupable: true,
    },
    {
      id: "categoria",
      etiqueta: "Categoría",
      tipo: "seleccion",
      valores: (p) => (p.categorias.length > 0 ? p.categorias : ["(sin categoría)"]),
      opciones: () => CATEGORIAS_DROPI.map((c) => ({ valor: c, etiqueta: c })),
    },
    { id: "bodega", etiqueta: "Bodega", tipo: "seleccion", valores: (p) => (p.bodegasNombres.length > 0 ? p.bodegasNombres : ["(sin bodega)"]) },
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (p) => p.nombre },
    { id: "stock", etiqueta: "Stock", tipo: "numero", valor: (p) => p.stock },
    { id: "precio", etiqueta: "Precio", tipo: "numero", valor: (p) => p.precioNumero },
    { id: "creado", etiqueta: "Creado el", tipo: "fecha", valor: (p) => p.creado },
  ],
  cerrados: {
    etiqueta: "Archivados",
    esCerrado: (p) => p.archivado,
    campoEstado: "estado",
    valoresCerrados: ["archivado"],
    ocultosPorDefecto: true,
    exclusivo: true,
  },
};
