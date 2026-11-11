// Definición de la tabla de una cartera (Cuentas por cobrar / por pagar) para la barra de herramientas común. Una
// constante por cartera (la `clave` decide lo que se guarda en el navegador). Vive en un archivo de cliente porque una
// `DefTabla` con funciones no cruza de un Server Component a uno de cliente.

import type { DefTabla } from "@/lib/tabla/motor";
import { ETIQUETA_ESTADO, ETIQUETA_TRAMO, TRAMOS, type Clase, type Estado } from "@/lib/finanzas/cxc-cxp";
import type { FilaCartera } from "@/lib/finanzas/cargar-cartera";

export const ORDEN_ESTADOS: Estado[] = ["pendiente", "parcial", "pagado", "incobrable", "anulado"];
const CERRADOS: Estado[] = ["pagado", "incobrable", "anulado"];

export const VENCIDO = "Vencido";
export const AL_DIA = "Al día";

function definir(clase: Clase): DefTabla<FilaCartera> {
  const quien = clase === "cobrar" ? "Cliente / deudor" : "Acreedor";
  return {
    clave: clase === "cobrar" ? "cuentas-por-cobrar" : "cuentas-por-pagar",
    campos: [
      {
        id: "estado",
        etiqueta: "Estado",
        tipo: "seleccion",
        valores: (f) => [ETIQUETA_ESTADO[f.estado]],
        opciones: () => ORDEN_ESTADOS.map((e) => ({ valor: ETIQUETA_ESTADO[e], etiqueta: ETIQUETA_ESTADO[e] })),
        agrupable: true,
        ordenGrupos: ORDEN_ESTADOS.map((e) => ETIQUETA_ESTADO[e]),
      },
      { id: "contraparte", etiqueta: quien, tipo: "seleccion", valores: (f) => [f.contraparte], agrupable: true },
      {
        id: "tramo",
        etiqueta: "Antigüedad",
        tipo: "seleccion",
        valores: (f) => [ETIQUETA_TRAMO[f.tramo]],
        opciones: () => TRAMOS.map((t) => ({ valor: t.etiqueta, etiqueta: t.etiqueta })),
        agrupable: true,
        ordenGrupos: TRAMOS.map((t) => t.etiqueta),
      },
      { id: "vencido", etiqueta: "Vencimiento", tipo: "seleccion", valores: (f) => [f.vencido ? VENCIDO : AL_DIA], agrupable: true },
      { id: "unidad", etiqueta: "Tienda", tipo: "seleccion", valores: (f) => [f.unidad], agrupable: true },
      { id: "documento", etiqueta: "Documento", tipo: "texto", valor: (f) => f.documento },
      { id: "motivo", etiqueta: "Motivo", tipo: "texto", valor: (f) => f.motivo },
      { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (f) => f.monto },
      { id: "abonado", etiqueta: "Abonado", tipo: "numero", valor: (f) => f.abonado },
      { id: "saldo", etiqueta: "Saldo", tipo: "numero", valor: (f) => f.saldo },
      { id: "fecha", etiqueta: "Fecha", tipo: "fecha", valor: (f) => f.fecha },
      { id: "vence", etiqueta: "Vence", tipo: "fecha", valor: (f) => f.vence },
      { id: "origen", etiqueta: "Origen", tipo: "seleccion", valores: (f) => [f.origen === "excel" ? `Excel · ${f.origenHoja ?? ""}`.trim() : "Portal"] },
    ],
    cerrados: {
      etiqueta: "Cerrados",
      esCerrado: (f) => CERRADOS.includes(f.estado),
      campoEstado: "estado",
      valoresCerrados: CERRADOS.map((e) => ETIQUETA_ESTADO[e]),
      ocultosPorDefecto: true,
    },
    total: (f) => f.saldo,
    vistaInicial: { agrupar: "contraparte" },
  };
}

export const DEF_COBRAR = definir("cobrar");
export const DEF_PAGAR = definir("pagar");
export const defDe = (clase: Clase) => (clase === "cobrar" ? DEF_COBRAR : DEF_PAGAR);
