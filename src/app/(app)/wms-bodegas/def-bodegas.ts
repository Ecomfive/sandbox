import type { DefTabla } from "@/lib/tabla/motor";

export const TIPOS_BODEGA = ["propia", "externa"] as const;
export type TipoBodega = (typeof TIPOS_BODEGA)[number];
export const ETIQUETA_TIPO_BODEGA: Record<TipoBodega, string> = { propia: "Propia", externa: "Externa" };

export interface FilaBodega {
  id: string;
  nombre: string;
  /** Una de las 6 fuentes de la arquitectura (despacho, fulfillment, dropi, effi, boxfull, dunamixfy); vacío en una bodega agregada a mano. */
  codigo: string;
  tipo: string;
  direccion: string;
  contacto: string;
  notas: string;
  activa: boolean;
  orden: number;
  /** Día en que se creó (AAAA-MM-DD). */
  creado: string;
}

/** Cómo se filtra y agrupa la lista de bodegas; «Inactivas» es el botón de filas cerradas. */
export const DEF_BODEGAS: DefTabla<FilaBodega> = {
  clave: "wms-bodegas",
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (b) => [b.activa ? "activa" : "inactiva"],
      opciones: () => [
        { valor: "activa", etiqueta: "Activa" },
        { valor: "inactiva", etiqueta: "Inactiva" },
      ],
      agrupable: true,
    },
    {
      id: "tipo",
      etiqueta: "Tipo",
      tipo: "seleccion",
      valores: (b) => [b.tipo],
      opciones: () => (Object.keys(ETIQUETA_TIPO_BODEGA) as TipoBodega[]).map((valor) => ({ valor, etiqueta: ETIQUETA_TIPO_BODEGA[valor] })),
      agrupable: true,
    },
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (b) => b.nombre },
    { id: "direccion", etiqueta: "Dirección", tipo: "texto", valor: (b) => b.direccion },
    { id: "creado", etiqueta: "Creada el", tipo: "fecha", valor: (b) => b.creado },
  ],
  cerrados: {
    etiqueta: "Inactivas",
    esCerrado: (b) => !b.activa,
    campoEstado: "estado",
    valoresCerrados: ["inactiva"],
    ocultosPorDefecto: true,
  },
};
