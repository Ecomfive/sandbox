"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import type { FilaPalanca } from "@/lib/finanzas/rentabilidad";
import { GastoIcon, ResultadosIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { claseCifra } from "@/components/af4/estilos-af4";
import { dinero } from "@/lib/af4/formato";

export interface FilaTablaPalanca extends FilaPalanca {
  id: string;
  tienda: string;
}

const DEF: DefTabla<FilaTablaPalanca> = {
  clave: "rentabilidad-palancas",
  campos: [
    { id: "tienda", etiqueta: "Tienda", tipo: "seleccion", valores: (f) => [f.tienda], agrupable: true },
    { id: "palanca", etiqueta: "Palanca", tipo: "seleccion", valores: (f) => [f.etiqueta], agrupable: true },
    { id: "ebitda", etiqueta: "EBITDA anual", tipo: "numero", valor: (f) => f.ebitdaAnual },
    { id: "valor", etiqueta: "Valor de empresa", tipo: "numero", valor: (f) => f.valorEmpresa },
  ],
};
const NOMBRE: NombreFilas = { singular: "palanca", plural: "palancas" };
const ICONOS: Record<string, IconoComp> = { tienda: TiendaIcon, palanca: ResultadosIcon, ebitda: GastoIcon, valor: GastoIcon };
const num = `text-right whitespace-nowrap ${claseCifra}`;
const mas = (v: number) => dinero(v, "USD", { conSigno: true });

const COLUMNAS: ColumnaTabla<FilaTablaPalanca, null>[] = [
  { id: "tienda", label: "Tienda", ocultable: false, clase: "whitespace-nowrap font-medium", render: (f) => f.tienda },
  { id: "palanca", label: "Palanca", ocultable: false, clase: "whitespace-nowrap", render: (f) => f.etiqueta },
  { id: "ebitda", label: "EBITDA anual", ocultable: false, clase: num, render: (f) => mas(f.ebitdaAnual), total: (fs) => mas(fs.reduce((a, f) => a + f.ebitdaAnual, 0)) },
  { id: "valor", label: "Valor de empresa", ocultable: false, clase: `${num} font-semibold`, render: (f) => mas(f.valorEmpresa), total: (fs) => mas(fs.reduce((a, f) => a + f.valorEmpresa, 0)) },
];

/** Cada palanca de cada tienda, de la que más valor crea a la que menos. */
export function TablaPalancas({ filas }: { filas: FilaTablaPalanca[] }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.id}
      ariaLabel="Palancas de valor"
      vacio="No hay palancas en este período."
    />
  );
}
