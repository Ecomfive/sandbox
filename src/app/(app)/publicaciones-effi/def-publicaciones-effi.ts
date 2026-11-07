import type { EtapaCotizacion } from "@/lib/compras/en-camino";
import { MARGEN_BAJO } from "@/lib/publicaciones/publicacion";
import type { DefTabla } from "@/lib/tabla/motor";

/** Por debajo de esto, un artículo tiene «Poco stock» (las mismas 100 unidades de Gestión de IDs Dropi y Drop). */
export const POCO_STOCK_EFFI = 100;

export interface ProductoEffi {
  id: string;
  codigo: string;
  nombre: string;
  foto: string | null;
  /** simple o combo (compuesto). */
  tipo: string;
  /** El N.º correlativo y el código de barras del producto. */
  numero: number | null;
  barras: string | null;
}

/**
 * Un artículo de Effi (migración 0230, 5 nov 2026): lo que da la API más el producto de Producto con que se vinculó y el margen. Los montos van en colones. El
 * stock es solo el de nuestras bodegas: las que tienen nombre de tienda son de cada dropshipper y no se tocan en el sistema.
 */
export interface FilaPublicacionEffi {
  id: string;
  /** El ID del artículo en Effi («121»). */
  idEffi: string;
  nombre: string;
  referencia: string;
  gtin: string;
  categoria: string;
  fotoUrl: string | null;
  /** La tarifa «Dropshipping» de Effi. */
  precio: number | null;
  precioSugerido: number | null;
  precioMinimo: number | null;
  /** El último costo de compra en Effi (si no hay, el manual). */
  costo: number | null;
  /** El fulfillment de Effi que cuenta en el margen; null si no está puesto o si lo paga el dropshipper. */
  fulfillment: number | null;
  /** Quién paga el fulfillment de Effi (migración 0247): con «dropshipper» no se toma en cuenta. */
  fulfillmentPaga: "nosotros" | "dropshipper";
  utilidad: number | null;
  margen: number | null;
  /** Unidades en la bodega Principal; null si Effi no la lista para este artículo. */
  stock: number | null;
  stockGarantias: number | null;
  /** Compartido con los distribuidores de dropshipping. */
  compartido: boolean;
  /** Si la última lectura lo encontró; false = ya no aparece en Effi (se anuló allá). */
  conectado: boolean;
  ultimaVez: string;
  producto: ProductoEffi | null;
  sugerido: ProductoEffi | null;
  sugerencia: string | null;
  enCamino: number;
  llegadaCamino: string | null;
  sinFechaCamino: number;
  sinEnvioCamino: number;
  enCotizacion: number;
  etapaCotizacion: EtapaCotizacion | null;
}

export const estadoVinculoEffi = (f: FilaPublicacionEffi): "vinculado" | "sugerido" | "sin_vincular" => (f.producto ? "vinculado" : f.sugerido ? "sugerido" : "sin_vincular");

export const sinStockEffi = (f: FilaPublicacionEffi) => f.conectado && f.stock === 0;
export const pocoStockEffi = (f: FilaPublicacionEffi) => f.conectado && f.stock !== null && f.stock > 0 && f.stock < POCO_STOCK_EFFI;
export const margenBajoEffi = (f: FilaPublicacionEffi) => f.margen !== null && f.margen < MARGEN_BAJO;

export const DEF_PUBLICACIONES_EFFI: DefTabla<FilaPublicacionEffi> = {
  clave: "publicaciones-effi",
  campos: [
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (f) => f.nombre },
    { id: "idEffi", etiqueta: "ID de Effi", tipo: "texto", valor: (f) => f.idEffi },
    { id: "referencia", etiqueta: "Referencia", tipo: "texto", valor: (f) => f.referencia },
    { id: "categoria", etiqueta: "Categoría", tipo: "texto", valor: (f) => f.categoria },
    {
      id: "conexion",
      etiqueta: "Conexión con Effi",
      tipo: "seleccion",
      valores: (f) => [f.conectado ? "conectado" : "no_aparece"],
      opciones: () => [
        { valor: "conectado", etiqueta: "Conectado con Effi" },
        { valor: "no_aparece", etiqueta: "Ya no aparece en Effi" },
      ],
    },
    {
      id: "compartido",
      etiqueta: "Dropshipping",
      tipo: "seleccion",
      valores: (f) => [f.compartido ? "si" : "no"],
      opciones: () => [
        { valor: "si", etiqueta: "Compartido" },
        { valor: "no", etiqueta: "No compartido" },
      ],
    },
    {
      id: "tipoProducto",
      etiqueta: "Tipo de producto",
      tipo: "seleccion",
      valores: (f) => (f.producto ? [f.producto.tipo === "combo" ? "combo" : "simple"] : []),
      opciones: () => [
        { valor: "simple", etiqueta: "Producto simple" },
        { valor: "combo", etiqueta: "Pack o combo" },
      ],
    },
    {
      id: "vinculo",
      etiqueta: "Producto vinculado",
      tipo: "seleccion",
      valores: (f) => [estadoVinculoEffi(f)],
      opciones: () => [
        { valor: "vinculado", etiqueta: "Vinculado" },
        { valor: "sugerido", etiqueta: "Con sugerencia" },
        { valor: "sin_vincular", etiqueta: "Sin candidato" },
      ],
      agrupable: true,
    },
    {
      id: "stockNivel",
      etiqueta: "Stock",
      tipo: "seleccion",
      valores: (f) => [sinStockEffi(f) ? "sin_stock" : pocoStockEffi(f) ? "poco" : "con_stock"],
      opciones: () => [
        { valor: "sin_stock", etiqueta: "Sin stock" },
        { valor: "poco", etiqueta: `Menos de ${POCO_STOCK_EFFI} unidades` },
        { valor: "con_stock", etiqueta: "Con stock" },
      ],
    },
    {
      id: "margenNivel",
      etiqueta: "Margen",
      tipo: "seleccion",
      valores: (f) => [f.margen === null ? "sin_dato" : margenBajoEffi(f) ? "bajo" : "bien"],
      opciones: () => [
        { valor: "bajo", etiqueta: `Bajo (menos de ${Math.round(MARGEN_BAJO * 100)} %)` },
        { valor: "bien", etiqueta: "Bien" },
        { valor: "sin_dato", etiqueta: "Sin costo o sin precio" },
      ],
    },
    { id: "precio", etiqueta: "Precio", tipo: "numero", valor: (f) => f.precio },
    { id: "stock", etiqueta: "Unidades en Principal", tipo: "numero", valor: (f) => f.stock },
  ],
};
