import type { DefTabla } from "@/lib/tabla/motor";

export interface FilaPlataforma {
  id: string;
  nombre: string;
  /** Aparece en el botón «+ Crear» de Retiros. */
  disponible: boolean;
  /** Fulfillment por pedido (migración 0213), en `fulfillmentMoneda`, o null. */
  fulfillment: number | null;
  /** «USD», «CRC», «MXN»: la moneda en que lo factura el proveedor. */
  fulfillmentMoneda: string;
  /** El mismo monto en la otra moneda del país («≈ US$2.00», «≈ ₡1 011»), o null. */
  fulfillmentEquivalente: string | null;
}

/** Filtros y agrupación de las plataformas del país; «Ocultas» son las que no salen en «+ Crear». */
export const DEF_PLATAFORMAS: DefTabla<FilaPlataforma> = {
  clave: "configuracion-plataformas",
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (p) => [p.disponible ? "disponible" : "oculta"],
      opciones: () => [
        { valor: "disponible", etiqueta: "Disponible" },
        { valor: "oculta", etiqueta: "Oculta" },
      ],
      agrupable: true,
      ordenGrupos: ["disponible", "oculta"],
    },
    { id: "nombre", etiqueta: "Plataforma", tipo: "texto", valor: (p) => p.nombre },
  ],
  cerrados: {
    etiqueta: "Ocultas",
    esCerrado: (p) => !p.disponible,
    campoEstado: "estado",
    valoresCerrados: ["oculta"],
    ocultosPorDefecto: false,
  },
};
