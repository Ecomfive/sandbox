import type { DefTabla } from "@/lib/tabla/motor";

/**
 * Una publicación de Drop. Todavía no hay datos conectados (3 nov 2026): la forma de la fila se completa cuando se conecte la aplicación,
 * con los mismos campos que Gestión de IDs Dropi (precio, margen, ventas, stock, estado…).
 */
export interface FilaPublicacionDrop {
  id: string;
  nombre: string;
  /** Estado de la publicación en Drop (activa, archivada…). */
  estado: string;
}

export const DEF_PUBLICACIONES_DROP: DefTabla<FilaPublicacionDrop> = {
  clave: "publicaciones-drop",
  campos: [
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (f) => f.nombre },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (f) => [f.estado], agrupable: true },
  ],
};
