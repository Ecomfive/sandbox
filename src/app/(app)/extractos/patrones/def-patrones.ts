import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

export interface FilaPatron {
  id: string;
  fragmento: string;
  plataforma: string | null;
}

/** Filtros y agrupación del diccionario de patrones bancarios. */
export const DEF_PATRONES: DefTabla<FilaPatron> = {
  clave: "extractos-patrones",
  campos: [
    {
      id: "plataforma",
      etiqueta: "Plataforma",
      tipo: "seleccion",
      valores: (p) => [p.plataforma ?? SIN_VALOR],
      etiquetaSinValor: "Sin plataforma",
      agrupable: true,
    },
    { id: "fragmento", etiqueta: "Texto a buscar", tipo: "texto", valor: (p) => p.fragmento },
  ],
};
