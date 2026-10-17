import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

/** Una sugerencia: un producto que un dropshipper nos recomendó (migración 0109). No es un producto de Producto. */
export interface FilaSugerencia {
  id: string;
  /** SUG-0001: el mismo código que lleva en Selección. */
  codigo: string;
  nombre: string;
  estado: string;
  fotoUrl: string | null;
  notas: string | null;
  categoria: string | null;
  /** Código ISO del país donde el cliente vio el producto. */
  paisDetectado: string | null;
  dropshipperId: string;
  /** «DS-0014 · David». */
  dropshipper: string;
  /** La fila de Selección que nació al marcarla Seleccionado (SEL-0001), si ya pasó. */
  seleccionNumero: number | null;
  /** Días de exclusividad para quien lo recomendó (30, 60 o 90), desde que quede disponible para vender. */
  exclusividadDias: number;
  creadoEn: string;
}

/** Cae **Nuevo** (desde el CRM o a mano); **Seleccionado** la manda a Selección de productos; **Descartado** la cierra. */
export const ESTADOS_SUGERENCIA = [
  { valor: "nuevo", etiqueta: "Nuevo", color: "#8D8D8D" },
  { valor: "seleccionado", etiqueta: "Seleccionado", color: "#1bbc9c" },
  { valor: "descartado", etiqueta: "Descartado", color: "#e50000" },
] as const;

export const etiquetaEstadoSugerencia = (v: string) => ESTADOS_SUGERENCIA.find((e) => e.valor === v)?.etiqueta ?? v;
export const colorEstadoSugerencia = (v: string) => ESTADOS_SUGERENCIA.find((e) => e.valor === v)?.color ?? "#8D8D8D";

/** El nombre de un país por su código ISO, en español («MX» → «México»). */
export function nombrePaisIso(codigo: string | null): string {
  if (!codigo) return "—";
  try {
    return new Intl.DisplayNames(["es"], { type: "region" }).of(codigo) ?? codigo;
  } catch {
    return codigo;
  }
}

export const DEF_SUGERENCIAS: DefTabla<FilaSugerencia> = {
  clave: "sugerencias-clientes",
  campos: [
    { id: "producto", etiqueta: "Producto", tipo: "texto", valor: (f) => `${f.codigo} ${f.nombre} ${f.dropshipper}` },
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (f) => [f.estado],
      opciones: () => ESTADOS_SUGERENCIA.map((e) => ({ valor: e.valor, etiqueta: e.etiqueta })),
      agrupable: true,
      ordenGrupos: ESTADOS_SUGERENCIA.map((e) => e.valor),
      colorValor: colorEstadoSugerencia,
    },
    { id: "dropshipper", etiqueta: "Recomendado por", tipo: "seleccion", valores: (f) => [f.dropshipper], agrupable: true },
    { id: "paisDetectado", etiqueta: "País donde lo vio", tipo: "seleccion", valores: (f) => [f.paisDetectado ?? SIN_VALOR], etiquetaSinValor: "Sin país", formatearValor: nombrePaisIso, agrupable: true },
    { id: "categoria", etiqueta: "Categoría", tipo: "seleccion", valores: (f) => [f.categoria ?? SIN_VALOR], etiquetaSinValor: "Sin categoría", agrupable: true },
    { id: "exclusividad", etiqueta: "Exclusividad", tipo: "seleccion", valores: (f) => [String(f.exclusividadDias)], formatearValor: (v) => `${v} días`, agrupable: true },
    { id: "creadoEn", etiqueta: "Recomendado el", tipo: "fecha", valor: (f) => f.creadoEn.slice(0, 10) },
    { id: "notas", etiqueta: "Notas", tipo: "texto", valor: (f) => f.notas ?? "" },
  ],
  csvAntes: [{ etiqueta: "Código", valor: (f) => f.codigo }],
  cerrados: {
    etiqueta: "Descartados",
    esCerrado: (f) => f.estado === "descartado",
    campoEstado: "estado",
    valoresCerrados: ["descartado"],
    ocultosPorDefecto: true,
    exclusivo: true,
  },
  vistaInicial: { agrupar: "estado" },
};
