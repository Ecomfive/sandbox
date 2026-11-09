"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import type { Tono } from "@/components/ui/kpi-card";
import { dinero, fraccion } from "@/lib/af4/formato";
import { ExtractoIcon, WalletIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { tonoError } from "./tono";

export interface FilaRubro {
  rubro: string;
  etiqueta: string;
  /** Entradas, Salidas o Totales. */
  grupo: string;
  proyectado: number;
  real: number;
  diferencia: number;
  error: number | null;
  errorAbsoluto: number | null;
}

const PUNTO: Record<Tono, string> = { neutral: "bg-muted-foreground", info: "bg-accent-foreground", success: "bg-success", warning: "bg-warning", destructive: "bg-destructive" };
const JUICIO: Record<Tono, string> = { neutral: "sin dato", info: "", success: "preciso", warning: "a vigilar", destructive: "impreciso" };

const ORDEN_GRUPOS = ["Entradas", "Salidas", "Totales"];

const DEF: DefTabla<FilaRubro> = {
  clave: "proyeccion-precision-rubros",
  campos: [
    { id: "grupo", etiqueta: "Grupo", tipo: "seleccion", valores: (r) => [r.grupo], agrupable: true, ordenGrupos: ORDEN_GRUPOS },
    { id: "etiqueta", etiqueta: "Concepto", tipo: "texto", valor: (r) => r.etiqueta },
    { id: "proyectado", etiqueta: "Proyectado", tipo: "numero", valor: (r) => r.proyectado },
    { id: "real", etiqueta: "Real", tipo: "numero", valor: (r) => r.real },
    { id: "diferencia", etiqueta: "Diferencia", tipo: "numero", valor: (r) => r.diferencia },
    { id: "error", etiqueta: "Sesgo", tipo: "numero", valor: (r) => (r.error === null ? null : r.error * 100) },
    { id: "errorAbsoluto", etiqueta: "Error", tipo: "numero", valor: (r) => (r.errorAbsoluto === null ? null : r.errorAbsoluto * 100) },
  ],
  vistaInicial: { agrupar: "grupo" },
};
const NOMBRE: NombreFilas = { singular: "concepto", plural: "conceptos" };
const ICONOS: Record<string, IconoComp> = {
  grupo: ExtractoIcon,
  etiqueta: ExtractoIcon,
  proyectado: WalletIcon,
  real: WalletIcon,
  diferencia: WalletIcon,
  error: WalletIcon,
  errorAbsoluto: WalletIcon,
};
const numero = "text-right tabular-nums whitespace-nowrap";

const COLUMNAS: ColumnaTabla<FilaRubro, null>[] = [
  {
    id: "etiqueta",
    label: "Concepto",
    ocultable: false,
    render: (r) => {
      const t = tonoError(r.errorAbsoluto);
      return (
        <span className="inline-flex items-center gap-2">
          <span role="img" aria-label={`Error ${JUICIO[t]}`} className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[t]}`} />
          <span className={r.grupo === "Totales" ? "font-semibold" : ""}>{r.etiqueta}</span>
        </span>
      );
    },
  },
  { id: "proyectado", label: "Proyectado", ocultable: false, clase: numero, render: (r) => dinero(r.proyectado) },
  { id: "real", label: "Real", ocultable: false, clase: numero, render: (r) => dinero(r.real) },
  {
    id: "diferencia",
    label: "Diferencia",
    ocultable: true,
    clase: numero,
    render: (r) => <span className={r.diferencia < -0.005 ? "text-destructive" : ""}>{dinero(r.diferencia, "USD", { conSigno: true })}</span>,
  },
  { id: "error", label: "Sesgo", ocultable: true, clase: numero, render: (r) => fraccion(r.error, { conSigno: true }) },
  { id: "errorAbsoluto", label: "Error", ocultable: false, clase: numero, render: (r) => fraccion(r.errorAbsoluto) },
];

/** Proyectado contra real por concepto, agrupado en entradas, salidas y los totales. */
export function TablaRubros({ filas }: { filas: FilaRubro[] }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(r) => r.rubro}
      claseFila={(r) => (r.grupo === "Totales" ? "font-medium" : "")}
      ariaLabel="Proyectado contra real por concepto"
      vacio="Sin conceptos que comparar."
    />
  );
}
