import type { DefTabla } from "@/lib/tabla/motor";

export const ETIQUETA_ESTADO: Record<string, string> = {
  propuesto: "Propuesto",
  en_revision: "En revisión",
  aprobado: "Aprobado",
};

export const TONO_ESTADO: Record<string, "warning" | "info" | "success"> = {
  propuesto: "warning",
  en_revision: "info",
  aprobado: "success",
};

export const ETIQUETA_TIPO: Record<string, string> = { simple: "Simple", combo: "Combo" };

export interface FilaSku {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  estado: string;
  /** Solo los combos: "2× MSK-0001, 1× MSK-0002". */
  componentes: string;
  /** Día en que se propuso (AAAA-MM-DD). */
  creado: string;
}

/** Cómo se filtra y agrupa el catálogo de SKU maestros; "Aprobados" es lo terminado, pero se ve por defecto. */
export const DEF_CATALOGO: DefTabla<FilaSku> = {
  clave: "catalogo-maestro",
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (s) => [s.estado],
      opciones: () => Object.entries(ETIQUETA_ESTADO).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      agrupable: true,
      ordenGrupos: ["propuesto", "en_revision", "aprobado"],
    },
    {
      id: "tipo",
      etiqueta: "Tipo",
      tipo: "seleccion",
      valores: (s) => [s.tipo],
      opciones: () => Object.entries(ETIQUETA_TIPO).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      agrupable: true,
    },
    { id: "codigo", etiqueta: "Código", tipo: "texto", valor: (s) => s.codigo },
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (s) => s.nombre },
    { id: "componentes", etiqueta: "Componentes", tipo: "texto", valor: (s) => s.componentes },
    { id: "creado", etiqueta: "Propuesto el", tipo: "fecha", valor: (s) => s.creado },
  ],
  cerrados: {
    etiqueta: "Aprobados",
    esCerrado: (s) => s.estado === "aprobado",
    campoEstado: "estado",
    valoresCerrados: ["aprobado"],
    ocultosPorDefecto: false,
  },
};
