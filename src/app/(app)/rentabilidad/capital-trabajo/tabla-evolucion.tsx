"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import type { PuntoCapital } from "@/lib/finanzas/rentabilidad";
import { CalendarioIcon, GastoIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { claseCifra } from "@/components/af4/estilos-af4";
import { dias, dinero } from "@/lib/af4/formato";

export interface FilaEvolucion extends PuntoCapital {
  etiqueta: string;
}

const DEF: DefTabla<FilaEvolucion> = {
  clave: "rentabilidad-capital-evolucion",
  campos: [
    { id: "etiqueta", etiqueta: "Mes", tipo: "texto", valor: (f) => f.periodo },
    { id: "cxc", etiqueta: "Por cobrar", tipo: "numero", valor: (f) => f.cxc },
    { id: "cxp", etiqueta: "Por pagar", tipo: "numero", valor: (f) => f.cxp },
  ],
};
const NOMBRE: NombreFilas = { singular: "mes", plural: "meses" };
const ICONOS: Record<string, IconoComp> = { etiqueta: CalendarioIcon, cxc: GastoIcon, cxp: GastoIcon };
const num = `text-right whitespace-nowrap ${claseCifra}`;

const COLUMNAS: ColumnaTabla<FilaEvolucion, null>[] = [
  { id: "etiqueta", label: "Mes", ocultable: false, clase: "whitespace-nowrap font-medium", render: (f) => f.etiqueta },
  { id: "cxc", label: "Por cobrar al cierre", ocultable: false, clase: num, render: (f) => dinero(f.cxc) },
  { id: "dso", label: "DSO", ocultable: false, clase: num, render: (f) => dias(f.dso) },
  { id: "cxp", label: "Por pagar al cierre", ocultable: false, clase: num, render: (f) => dinero(f.cxp) },
  { id: "dpo", label: "DPO", ocultable: false, clase: num, render: (f) => dias(f.dpo) },
  { id: "neto", label: "DSO − DPO", ocultable: true, clase: num, render: (f) => dias(f.dso !== null && f.dpo !== null ? f.dso - f.dpo : null) },
];

/** Por cobrar y por pagar al cierre de cada mes, con sus días sobre los 3 meses que terminan en él. */
export function TablaEvolucion({ filas }: { filas: FilaEvolucion[] }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.periodo}
      ariaLabel="Evolución de las carteras"
      vacio="No hay cartera cargada."
    />
  );
}
