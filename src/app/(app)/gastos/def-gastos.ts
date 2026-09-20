import type { DefTabla } from "@/lib/tabla/motor";

export interface FilaGasto {
  id: string;
  categoria: string;
  descripcion: string;
  monto: number;
  fecha: string;
}

export const CATEGORIAS = [
  { valor: "nomina", etiqueta: "Nómina" },
  { valor: "alquiler", etiqueta: "Alquiler" },
  { valor: "servicios", etiqueta: "Servicios" },
  { valor: "marketing", etiqueta: "Marketing" },
  { valor: "logistica", etiqueta: "Logística" },
  { valor: "otros", etiqueta: "Otros" },
] as const;

export const etiquetaCategoria = (valor: string) => CATEGORIAS.find((c) => c.valor === valor)?.etiqueta ?? valor;

/** Cómo se filtra y agrupa la tabla de gastos recientes; por grupo se suma el monto. */
export const DEF_GASTOS: DefTabla<FilaGasto> = {
  clave: "gastos",
  campos: [
    {
      id: "categoria",
      etiqueta: "Categoría",
      tipo: "seleccion",
      valores: (g) => [g.categoria],
      opciones: () => CATEGORIAS.map((c) => ({ valor: c.valor, etiqueta: c.etiqueta })),
      agrupable: true,
    },
    { id: "descripcion", etiqueta: "Descripción", tipo: "texto", valor: (g) => g.descripcion },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (g) => g.monto },
    { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (g) => g.fecha },
  ],
  total: (g) => g.monto,
};
