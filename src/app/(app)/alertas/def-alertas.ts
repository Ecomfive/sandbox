import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";
import type { AlertaFila } from "./tabla-alertas";

export const ETIQUETA_ESTADO_ALERTA: Record<AlertaFila["estado"], string> = {
  abierta: "Abierta",
  reclamada: "Reclamada",
  resuelta: "Resuelta",
};

/** Cómo se filtra, agrupa y oculta lo resuelto en la tabla de alertas de inventario. */
export const DEF_ALERTAS: DefTabla<AlertaFila> = {
  clave: "alertas",
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (a) => [a.estado],
      opciones: () => Object.entries(ETIQUETA_ESTADO_ALERTA).map(([valor, etiqueta]) => ({ valor, etiqueta })),
      agrupable: true,
      ordenGrupos: ["abierta", "reclamada", "resuelta"],
    },
    {
      id: "producto",
      etiqueta: "Producto",
      tipo: "seleccion",
      valores: (a) => [a.nombre || SIN_VALOR],
      etiquetaSinValor: "Sin producto",
      agrupable: true,
    },
    { id: "sku", etiqueta: "SKU", tipo: "texto", valor: (a) => a.sku },
    { id: "cantidad", etiqueta: "Cantidad", tipo: "numero", valor: (a) => a.cantidad },
    { id: "detectada", etiqueta: "Fecha detectada", tipo: "fecha", valor: (a) => a.fecha_deteccion },
    { id: "reclamada", etiqueta: "Fecha reclamada", tipo: "fecha", valor: (a) => a.fecha_reclamo },
  ],
  cerrados: {
    etiqueta: "Resueltas",
    esCerrado: (a) => a.estado === "resuelta",
    campoEstado: "estado",
    valoresCerrados: ["resuelta"],
    ocultosPorDefecto: true,
  },
  // Por grupo se suman las unidades pendientes de retorno.
  total: (a) => a.cantidad,
};
