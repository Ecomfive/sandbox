import { margenActual, type ProductoFila } from "@/lib/margen";
import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

export type EstadoMargen = "bajo" | "ok" | "sin-datos";

/** Dónde está el producto frente a su margen mínimo (sin costo o precio no hay margen que comparar). */
export function estadoMargen(p: ProductoFila): EstadoMargen {
  const margen = margenActual(p);
  if (margen === null) return "sin-datos";
  return margen < p.margen_minimo ? "bajo" : "ok";
}

const ETIQUETAS_ESTADO: Record<EstadoMargen, string> = {
  bajo: "Bajo el mínimo",
  ok: "Sobre el mínimo",
  "sin-datos": "Sin datos",
};

/** Cómo se filtra y agrupa la lista de productos y márgenes. */
export const DEF_PRODUCTOS: DefTabla<ProductoFila> = {
  clave: "productos",
  campos: [
    {
      id: "estado",
      etiqueta: "Margen",
      tipo: "seleccion",
      valores: (p) => [estadoMargen(p)],
      opciones: () => (["bajo", "ok", "sin-datos"] as const).map((valor) => ({ valor, etiqueta: ETIQUETAS_ESTADO[valor] })),
      agrupable: true,
      ordenGrupos: ["bajo", "ok", "sin-datos"],
    },
    {
      id: "plataforma",
      etiqueta: "Plataforma",
      tipo: "seleccion",
      valores: (p) => [p.plataforma_nombre ?? SIN_VALOR],
      etiquetaSinValor: "Sin plataforma",
      agrupable: true,
    },
    {
      id: "vinculo",
      etiqueta: "Catálogo maestro",
      tipo: "seleccion",
      valores: (p) => [p.sku_maestro_id ? "vinculado" : "sin-vincular"],
      opciones: () => [
        { valor: "sin-vincular", etiqueta: "Sin vincular" },
        { valor: "vinculado", etiqueta: "Vinculado" },
      ],
      agrupable: true,
    },
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (p) => p.nombre },
    { id: "sku", etiqueta: "SKU", tipo: "texto", valor: (p) => p.sku },
    { id: "costo", etiqueta: "Costo", tipo: "numero", valor: (p) => p.costo },
    { id: "precio", etiqueta: "Precio de venta", tipo: "numero", valor: (p) => p.precio_actual },
    { id: "minimo", etiqueta: "Margen mínimo", tipo: "numero", valor: (p) => p.margen_minimo },
    { id: "margen", etiqueta: "Margen actual", tipo: "numero", valor: (p) => margenActual(p) },
  ],
};
