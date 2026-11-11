import type { DefTabla } from "@/lib/tabla/motor";

export interface FilaBien {
  id: string;
  descripcion: string;
  tipo: string;
  tienda: string;
  unidadId: string | null;
  fechaAlta: string;
  /** Mes de alta (AAAA-MM), para filtrar y agrupar. */
  alta: string;
  importe: number;
  mesesVida: number;
  valorResidual: number;
  fechaBaja: string | null;
  motivoBaja: string;
  notas: string;
  origen: string;
  editado: boolean;
  cuota: number;
  acumulada: number;
  neto: number;
  mesesRestantes: number;
  delMes: number;
  estado: "En uso" | "Depreciado" | "De baja";
}

const seleccion = <K extends keyof FilaBien>(id: K, etiqueta: string) => ({
  id,
  etiqueta,
  tipo: "seleccion" as const,
  valores: (b: FilaBien) => [String(b[id])],
  agrupable: true,
});

/** Bienes de uso: se filtran y agrupan por estado, tipo y tienda; por grupo se suma el valor neto en libros. */
export const DEF_BIENES: DefTabla<FilaBien> = {
  clave: "bienes-de-uso",
  campos: [
    seleccion("estado", "Estado"),
    seleccion("tipo", "Tipo de bien"),
    seleccion("tienda", "Tienda"),
    { id: "descripcion", etiqueta: "Descripción", tipo: "texto", valor: (b) => b.descripcion },
    { id: "alta", etiqueta: "Alta", tipo: "fecha", valor: (b) => b.fechaAlta },
    { id: "importe", etiqueta: "Valor de origen", tipo: "numero", valor: (b) => b.importe },
    { id: "acumulada", etiqueta: "Depreciación acumulada", tipo: "numero", valor: (b) => b.acumulada },
    { id: "neto", etiqueta: "Valor neto", tipo: "numero", valor: (b) => b.neto },
    { id: "mesesRestantes", etiqueta: "Meses restantes", tipo: "numero", valor: (b) => b.mesesRestantes },
  ],
  cerrados: {
    etiqueta: "De baja",
    esCerrado: (b) => b.estado === "De baja",
    campoEstado: "estado",
    valoresCerrados: ["De baja"],
    ocultosPorDefecto: true,
  },
  total: (b) => b.neto,
};
