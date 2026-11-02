import type { EtapaCotizacion } from "@/lib/compras/en-camino";
import { ETIQUETA_ESTADO_DROP, type EstadoDrop } from "@/lib/publicaciones-drop/acciones";
import { MARGEN_BAJO } from "@/lib/publicaciones/publicacion";
import type { DefTabla } from "@/lib/tabla/motor";

/** Por debajo de esto, una publicación activa tiene «Poco stock» (las mismas 100 unidades de Gestión de IDs Dropi; Drop no da las ventas). */
export const POCO_STOCK_DROP = 100;

/** Un producto de Producto, como lo muestra la fila. */
export interface ProductoDrop {
  id: string;
  codigo: string;
  nombre: string;
  foto: string | null;
  /** simple o combo (compuesto). */
  tipo: string;
}

/**
 * Una publicación de Drop (datos desde la migración 0221, 3 nov 2026): lo que se lee de «Mis productos» de Drop (scripts/drop-guardar.ts) más el producto
 * de Producto con que se vinculó y el margen, calculado con el costo de ese producto en Gestión de IDs Dropi del mismo país y el fulfillment de Drop de
 * Configuración. Los montos van en la moneda de Drop del país (colones en Costa Rica).
 */
export interface FilaPublicacionDrop {
  id: string;
  nombre: string;
  /** Activa o inactiva en Drop. No hay archivadas: lo que sobra se elimina. */
  estado: EstadoDrop;
  /** El ID corto de la publicación en Drop («ID-ONWAG»); vacío si Drop no lo mostró. */
  idDrop: string;
  /** El id interno de Drop, para abrir su página de inventario. */
  dropInterno: string;
  /**
   * El SKU de Drop, tal cual viene de Drop: **no se puede cambiar** ni en Drop ni aquí. Se vincula después con el SKU de nuestro producto (`producto`): la
   * lectura deja una sugerencia (`sugerido`, por el nombre y la foto, `src/lib/publicaciones/vincular.ts`) y una persona la confirma.
   */
  skuDrop: string;
  fotoUrl: string | null;
  precio: number | null;
  inventario: number | null;
  /** El producto de Producto con que se vinculó el SKU de Drop; null mientras no se vincule. */
  producto: ProductoDrop | null;
  /** El producto que sugirió la lectura, mientras no esté vinculada. */
  sugerido: ProductoDrop | null;
  /** Cómo se sugirió: «seguro» (coincidencia exacta), «sugerido», «varios», «falta_compuesto» o «ninguno». */
  sugerencia: string | null;
  /** Si la última lectura de Drop la encontró (como «Conectado con Dropi»); false = ya no aparece en Drop (se eliminó allá). */
  conectado: boolean;
  /** Cuándo se creó en Drop y cuándo la vio la última lectura. */
  creadoEnDrop: string | null;
  ultimaVez: string;
  /** El costo del producto vinculado (de su publicación de Dropi del mismo país); null si no hay. */
  costo: number | null;
  /** El fulfillment de Drop del país (Configuración), en la moneda de Drop; null si no está puesto. */
  fulfillment: number | null;
  utilidad: number | null;
  margen: number | null;
  /** En liquidación: pendiente, Drop todavía no lo usa. */
  liquidacion: boolean;
  /** Lo que viene en camino del producto vinculado, en compras del país (como en Gestión de IDs Dropi). */
  enCamino: number;
  llegadaCamino: string | null;
  sinFechaCamino: number;
  sinEnvioCamino: number;
  /** Lo que todavía se cotiza (01 - Cotizar y 02 - Cotizado) y su etapa. */
  enCotizacion: number;
  etapaCotizacion: EtapaCotizacion | null;
}

export const estadoVinculoDrop = (f: FilaPublicacionDrop): "vinculado" | "sugerido" | "sin_vincular" => (f.producto ? "vinculado" : f.sugerido ? "sugerido" : "sin_vincular");

/** Activa en Drop (y todavía en Drop). */
export const activaDrop = (f: FilaPublicacionDrop) => f.conectado && f.estado === "activo";
/** Activa en Drop sin unidades. */
export const sinStockDrop = (f: FilaPublicacionDrop) => activaDrop(f) && f.inventario === 0;
/** Activa en Drop con menos de `POCO_STOCK_DROP` unidades. */
export const pocoStockDrop = (f: FilaPublicacionDrop) => activaDrop(f) && f.inventario !== null && f.inventario > 0 && f.inventario < POCO_STOCK_DROP;
export const margenBajoDrop = (f: FilaPublicacionDrop) => f.margen !== null && f.margen < MARGEN_BAJO;

export const DEF_PUBLICACIONES_DROP: DefTabla<FilaPublicacionDrop> = {
  clave: "publicaciones-drop",
  campos: [
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (f) => f.nombre },
    { id: "skuDrop", etiqueta: "SKU de Drop", tipo: "texto", valor: (f) => f.skuDrop },
    {
      id: "idDrop",
      etiqueta: "ID de Drop",
      tipo: "seleccion",
      valores: (f) => [f.idDrop.trim() ? "con_id" : "sin_id"],
      opciones: () => [
        { valor: "con_id", etiqueta: "Con ID de Drop" },
        { valor: "sin_id", etiqueta: "Sin ID de Drop" },
      ],
    },
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (f) => [f.estado],
      opciones: () => (Object.keys(ETIQUETA_ESTADO_DROP) as EstadoDrop[]).map((valor) => ({ valor, etiqueta: ETIQUETA_ESTADO_DROP[valor] })),
      agrupable: true,
    },
    {
      id: "conexion",
      etiqueta: "Conexión con Drop",
      tipo: "seleccion",
      valores: (f) => [f.conectado ? "conectado" : "no_aparece"],
      opciones: () => [
        { valor: "conectado", etiqueta: "Conectado con Drop" },
        { valor: "no_aparece", etiqueta: "Ya no aparece en Drop" },
      ],
    },
    {
      id: "vinculo",
      etiqueta: "Producto vinculado",
      tipo: "seleccion",
      valores: (f) => [estadoVinculoDrop(f)],
      opciones: () => [
        { valor: "vinculado", etiqueta: "Vinculado" },
        { valor: "sugerido", etiqueta: "Con sugerencia" },
        { valor: "sin_vincular", etiqueta: "Sin candidato" },
      ],
      agrupable: true,
    },
    {
      id: "stock",
      etiqueta: "Stock",
      tipo: "seleccion",
      valores: (f) => [sinStockDrop(f) ? "sin_stock" : pocoStockDrop(f) ? "poco" : "con_stock"],
      opciones: () => [
        { valor: "sin_stock", etiqueta: "Sin stock" },
        { valor: "poco", etiqueta: `Menos de ${POCO_STOCK_DROP} unidades` },
        { valor: "con_stock", etiqueta: "Con stock" },
      ],
    },
    {
      id: "margen",
      etiqueta: "Margen",
      tipo: "seleccion",
      valores: (f) => [f.margen === null ? "sin_dato" : margenBajoDrop(f) ? "bajo" : "bien"],
      opciones: () => [
        { valor: "bajo", etiqueta: `Bajo (menos de ${Math.round(MARGEN_BAJO * 100)} %)` },
        { valor: "bien", etiqueta: "Bien" },
        { valor: "sin_dato", etiqueta: "Sin costo" },
      ],
    },
    { id: "precio", etiqueta: "Precio", tipo: "numero", valor: (f) => f.precio },
    { id: "inventario", etiqueta: "Inventario", tipo: "numero", valor: (f) => f.inventario },
  ],
};
