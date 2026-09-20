import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";
import type { FilaPedido } from "./tabla-pedidos";

/** Un pedido entregado es un estado terminal: el texto llega de Dropi ("ENTREGADO"), por eso se reconoce por regla. */
const esEntregado = (estado: string) => estado.toUpperCase().includes("ENTREGAD");

/** Cómo se filtra, agrupa y oculta lo entregado en la tabla de pedidos de Dropi. */
export const DEF_PEDIDOS: DefTabla<FilaPedido> = {
  clave: "pedidos-dropi",
  campos: [
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (p) => [p.estado],
      agrupable: true,
    },
    {
      id: "producto",
      etiqueta: "Producto",
      tipo: "seleccion",
      valores: (p) => [p.producto ?? SIN_VALOR],
      etiquetaSinValor: "Sin producto",
      agrupable: true,
    },
    {
      id: "alerta",
      etiqueta: "Liquidado sin entregar",
      tipo: "seleccion",
      valores: (p) => [p.alerta ? "si" : "no"],
      opciones: () => [
        { valor: "si", etiqueta: "Sí" },
        { valor: "no", etiqueta: "No" },
      ],
    },
    { id: "orden", etiqueta: "Orden", tipo: "texto", valor: (p) => p.referencia },
    { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (p) => p.fecha },
    { id: "cantidad", etiqueta: "Cantidad", tipo: "numero", valor: (p) => p.cantidad },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (p) => p.monto },
  ],
  // Es un reporte de un período: por defecto se ve todo, y el botón permite esconder lo ya entregado.
  cerrados: {
    etiqueta: "Entregados",
    esCerrado: (p) => esEntregado(p.estado),
    campoEstado: "estado",
    valoresCerrados: esEntregado,
    ocultosPorDefecto: false,
  },
  total: (p) => p.monto,
};
