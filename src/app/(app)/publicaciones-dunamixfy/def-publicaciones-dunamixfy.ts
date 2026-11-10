import type { EtapaCotizacion } from "@/lib/compras/en-camino";
import type { CambioPrecioEsperando } from "@/lib/publicaciones/precios-plataforma-actions";
import { MARGEN_BAJO } from "@/lib/publicaciones/publicacion";
import type { DefTabla } from "@/lib/tabla/motor";

/** Por debajo de esto, un producto tiene «Poco stock» (las mismas 100 unidades de Gestión de IDs Dropi, Drop y Effi). */
export const POCO_STOCK_DUNAMIXFY = 100;

export interface ProductoDunamixfy {
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
 * Un producto de Dunamixfy (migración 0264, 9 nov 2026): lo que da la lectura de la cuenta de proveedor más el producto de Producto con que se vinculó y el margen. Los
 * montos van en colones. El stock es el de nuestra bodega en Dunamixfy, solo de los inventarios activos.
 */
export interface FilaPublicacionDunamixfy {
  id: string;
  /** El número del producto en Dunamixfy («837»). */
  idDunamixfy: string;
  nombre: string;
  /** El SKU de Dunamixfy (EFV01…). */
  skuDunamixfy: string;
  categoria: string;
  fotoUrl: string | null;
  /** Lo que paga el dropshipper. */
  precio: number | null;
  precioSugerido: number | null;
  /** El cambio de precio que espera «Aplicar precios» (o que falló la última vez; migración 0266). */
  cambioPrecio: CambioPrecioEsperando | null;
  /** El costo del producto: el de su publicación de Gestión de IDs Dropi del país (Dunamixfy no lo sabe). */
  costo: number | null;
  /** El fulfillment de Dunamixfy que cuenta en el margen; null si no está puesto o si lo paga el dropshipper. */
  fulfillment: number | null;
  fulfillmentPaga: "nosotros" | "dropshipper";
  utilidad: number | null;
  margen: number | null;
  stock: number | null;
  reservado: number | null;
  /** Activo en Dunamixfy (lo pueden vender) y si es privado. */
  activo: boolean;
  privado: boolean;
  /** Si la última lectura lo encontró; false = ya no aparece en Dunamixfy. */
  conectado: boolean;
  ultimaVez: string;
  producto: ProductoDunamixfy | null;
  sugerido: ProductoDunamixfy | null;
  sugerencia: string | null;
  enCamino: number;
  llegadaCamino: string | null;
  sinFechaCamino: number;
  sinEnvioCamino: number;
  enCotizacion: number;
  etapaCotizacion: EtapaCotizacion | null;
}

export const estadoVinculoDunamixfy = (f: FilaPublicacionDunamixfy): "vinculado" | "sugerido" | "sin_vincular" => (f.producto ? "vinculado" : f.sugerido ? "sugerido" : "sin_vincular");

export const sinStockDunamixfy = (f: FilaPublicacionDunamixfy) => f.conectado && f.stock === 0;
export const pocoStockDunamixfy = (f: FilaPublicacionDunamixfy) => f.conectado && f.stock !== null && f.stock > 0 && f.stock < POCO_STOCK_DUNAMIXFY;
export const margenBajoDunamixfy = (f: FilaPublicacionDunamixfy) => f.margen !== null && f.margen < MARGEN_BAJO;

export const DEF_PUBLICACIONES_DUNAMIXFY: DefTabla<FilaPublicacionDunamixfy> = {
  clave: "publicaciones-dunamixfy",
  campos: [
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (f) => f.nombre },
    { id: "idDunamixfy", etiqueta: "ID de Dunamixfy", tipo: "texto", valor: (f) => f.idDunamixfy },
    { id: "skuDunamixfy", etiqueta: "SKU en Dunamixfy", tipo: "texto", valor: (f) => f.skuDunamixfy },
    { id: "categoria", etiqueta: "Categoría", tipo: "texto", valor: (f) => f.categoria },
    {
      id: "conexion",
      etiqueta: "Conexión con Dunamixfy",
      tipo: "seleccion",
      valores: (f) => [f.conectado ? (f.activo ? "conectado" : "inactivo") : "no_aparece"],
      opciones: () => [
        { valor: "conectado", etiqueta: "Activo en Dunamixfy" },
        { valor: "inactivo", etiqueta: "Inactivo en Dunamixfy" },
        { valor: "no_aparece", etiqueta: "Ya no aparece en Dunamixfy" },
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
      valores: (f) => [estadoVinculoDunamixfy(f)],
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
      valores: (f) => [sinStockDunamixfy(f) ? "sin_stock" : pocoStockDunamixfy(f) ? "poco" : "con_stock"],
      opciones: () => [
        { valor: "sin_stock", etiqueta: "Sin stock" },
        { valor: "poco", etiqueta: `Menos de ${POCO_STOCK_DUNAMIXFY} unidades` },
        { valor: "con_stock", etiqueta: "Con stock" },
      ],
    },
    {
      id: "margenNivel",
      etiqueta: "Margen",
      tipo: "seleccion",
      valores: (f) => [f.margen === null ? "sin_dato" : margenBajoDunamixfy(f) ? "bajo" : "bien"],
      opciones: () => [
        { valor: "bajo", etiqueta: `Bajo (menos de ${Math.round(MARGEN_BAJO * 100)} %)` },
        { valor: "bien", etiqueta: "Bien" },
        { valor: "sin_dato", etiqueta: "Sin costo o sin precio" },
      ],
    },
    { id: "precio", etiqueta: "Precio", tipo: "numero", valor: (f) => f.precio },
    { id: "stock", etiqueta: "Unidades en Dunamixfy", tipo: "numero", valor: (f) => f.stock },
  ],
};
