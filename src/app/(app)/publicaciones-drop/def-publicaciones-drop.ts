import { ETIQUETA_ESTADO_DROP, type EstadoDrop } from "@/lib/publicaciones-drop/acciones";
import type { DefTabla } from "@/lib/tabla/motor";

/**
 * Una publicación de Drop. Todavía no hay datos conectados (3 nov 2026): la forma de la fila se completa cuando se conecte la aplicación,
 * con los campos que hagan falta de Gestión de IDs Dropi (precio, margen, ventas, stock…).
 */
export interface FilaPublicacionDrop {
  id: string;
  nombre: string;
  /** Activa o inactiva en Drop. No hay archivadas: lo que sobra se elimina. */
  estado: EstadoDrop;
  /** El ID de la publicación en Drop; vacío mientras no se haya conectado. */
  idDrop: string;
  /**
   * El SKU de Drop, tal cual viene de Drop: **no se puede cambiar** ni en Drop ni aquí. Al sincronizar se guarda como «SKU de Drop» y se vincula después con el SKU de
   * nuestro producto (`producto`), buscando parecido entre las palabras de los dos SKU y entre las fotos (ver `src/lib/publicaciones/vincular.ts`).
   */
  skuDrop: string;
  fotoUrl: string | null;
  /** El producto de Producto con que se vinculó el SKU de Drop; null mientras no se vincule. */
  producto: { id: string; codigo: string; nombre: string } | null;
  /** En liquidación: pendiente, Drop todavía no lo usa. */
  liquidacion: boolean;
}

export const DEF_PUBLICACIONES_DROP: DefTabla<FilaPublicacionDrop> = {
  clave: "publicaciones-drop",
  campos: [
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (f) => f.nombre },
    { id: "skuDrop", etiqueta: "SKU de Drop", tipo: "texto", valor: (f) => f.skuDrop },
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (f) => [f.estado],
      opciones: () => (Object.keys(ETIQUETA_ESTADO_DROP) as EstadoDrop[]).map((valor) => ({ valor, etiqueta: ETIQUETA_ESTADO_DROP[valor] })),
      agrupable: true,
    },
    {
      id: "vinculo",
      etiqueta: "Producto vinculado",
      tipo: "seleccion",
      valores: (f) => [f.producto ? "vinculado" : "sin_vincular"],
      opciones: () => [
        { valor: "vinculado", etiqueta: "Vinculado" },
        { valor: "sin_vincular", etiqueta: "Sin vincular" },
      ],
    },
  ],
};
