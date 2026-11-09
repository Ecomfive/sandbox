import { ETIQUETA_ESTADO_CIERRE, type FilaCierre } from "@/lib/deliverys/cargar";
import { sentidoNeto, textoSemanaCorto } from "@/lib/deliverys/liquidacion";
import type { DefTabla } from "@/lib/tabla/motor";

const SENTIDO = { pagar: "Se le paga", rendir: "Debe entregar", cero: "Sin saldo" } as const;

/**
 * Los cierres de los repartidores: uno por semana. Se agrupan por semana, estado o repartidor y por grupo se suma el
 * neto. Los pagados son las filas «cerradas» de la tabla. El documento va enmascarado y no está en la descarga.
 */
export const DEF_CIERRES: DefTabla<FilaCierre> = {
  clave: "deliverys-cierres",
  campos: [
    { id: "semana", etiqueta: "Semana", tipo: "seleccion", valores: (f) => [f.semana], agrupable: true, formatearValor: textoSemanaCorto },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (f) => [ETIQUETA_ESTADO_CIERRE[f.estado]], agrupable: true },
    { id: "repartidor", etiqueta: "Repartidor", tipo: "seleccion", valores: (f) => [f.repartidor], agrupable: true },
    { id: "sentido", etiqueta: "Saldo", tipo: "seleccion", valores: (f) => [SENTIDO[sentidoNeto(f.neto)]], agrupable: true },
    { id: "entregas", etiqueta: "Entregas", tipo: "numero", valor: (f) => f.entregas },
    { id: "tasa", etiqueta: "Tasa de entrega (%)", tipo: "numero", valor: (f) => (f.tasaEntrega === null ? null : Math.round(f.tasaEntrega * 100)) },
    { id: "a_pagar", etiqueta: "A pagar", tipo: "numero", valor: (f) => f.aPagar },
    { id: "efectivo", etiqueta: "Efectivo cobrado", tipo: "numero", valor: (f) => f.cobradoEfectivo },
    { id: "neto", etiqueta: "Neto", tipo: "numero", valor: (f) => f.neto },
    { id: "aparte", etiqueta: "Clicksi (aparte)", tipo: "numero", valor: (f) => f.aparte },
    { id: "pago", etiqueta: "Fecha de pago", tipo: "fecha", valor: (f) => f.fechaPago },
  ],
  cerrados: {
    etiqueta: "Pagados",
    esCerrado: (f) => f.estado === "pagado",
    campoEstado: "estado",
    valoresCerrados: [ETIQUETA_ESTADO_CIERRE.pagado],
    ocultosPorDefecto: false,
  },
  total: (f) => f.neto,
};

/** La lista de todos los cierres: arranca agrupada por semana y sin los ya pagados. */
export const DEF_CIERRES_TODOS: DefTabla<FilaCierre> = {
  ...DEF_CIERRES,
  clave: "deliverys-cierres-todos",
  cerrados: { ...DEF_CIERRES.cerrados!, ocultosPorDefecto: true },
  vistaInicial: { agrupar: "semana", orden: "desc" },
};
