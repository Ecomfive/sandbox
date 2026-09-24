import type { DefTabla } from "@/lib/tabla/motor";

export const PROPIEDADES = ["normal", "danado", "inspeccion", "retenido"] as const;
export type Propiedad = (typeof PROPIEDADES)[number];
export const ETIQUETA_PROPIEDAD: Record<Propiedad, string> = { normal: "Normal", danado: "Dañado", inspeccion: "En inspección", retenido: "Retenido" };
export const TONO_PROPIEDAD: Record<Propiedad, "success" | "destructive" | "info" | "warning"> = {
  normal: "success",
  danado: "destructive",
  inspeccion: "info",
  retenido: "warning",
};

export const TAMANOS = ["pequena", "mediana", "grande"] as const;
export type Tamano = (typeof TAMANOS)[number];
export const ETIQUETA_TAMANO: Record<Tamano, string> = { pequena: "Pequeña", mediana: "Mediana", grande: "Grande" };

export interface FilaUbicacion {
  id: string;
  bodegaId: string;
  bodega: string;
  codigo: string;
  propiedad: string;
  /** Vacío si no se indicó. */
  tamano: string;
  codigoBarras: string;
  notas: string;
  activa: boolean;
  /** Día en que se creó (AAAA-MM-DD). */
  creado: string;
}

/** Cómo se filtra y agrupa la lista de ubicaciones; «Inactivas» es el botón de filas cerradas. */
export const DEF_UBICACIONES: DefTabla<FilaUbicacion> = {
  clave: "wms-ubicaciones",
  campos: [
    { id: "bodega", etiqueta: "Bodega", tipo: "seleccion", valores: (u) => [u.bodega], agrupable: true },
    {
      id: "propiedad",
      etiqueta: "Propiedad",
      tipo: "seleccion",
      valores: (u) => [u.propiedad],
      opciones: () => PROPIEDADES.map((valor) => ({ valor, etiqueta: ETIQUETA_PROPIEDAD[valor] })),
      agrupable: true,
    },
    {
      id: "tamano",
      etiqueta: "Tamaño",
      tipo: "seleccion",
      valores: (u) => [u.tamano || "sin"],
      opciones: () => [...TAMANOS.map((valor) => ({ valor, etiqueta: ETIQUETA_TAMANO[valor] })), { valor: "sin", etiqueta: "Sin tamaño" }],
      agrupable: true,
    },
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (u) => [u.activa ? "activa" : "inactiva"],
      opciones: () => [
        { valor: "activa", etiqueta: "Activa" },
        { valor: "inactiva", etiqueta: "Inactiva" },
      ],
    },
    { id: "codigo", etiqueta: "Código", tipo: "texto", valor: (u) => u.codigo },
    { id: "creado", etiqueta: "Creada el", tipo: "fecha", valor: (u) => u.creado },
  ],
  cerrados: {
    etiqueta: "Inactivas",
    esCerrado: (u) => !u.activa,
    campoEstado: "estado",
    valoresCerrados: ["inactiva"],
    ocultosPorDefecto: true,
  },
};
