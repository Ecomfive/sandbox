"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { Bandera } from "@/components/paises/bandera";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { CrearPaisPanel } from "@/components/paises/crear-pais-panel";
import { ConfiguracionIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";

export interface FilaPais {
  id: string;
  codigo: string;
  nombre: string;
}

const DEF_PAISES: DefTabla<FilaPais> = {
  clave: "configuracion-paises",
  campos: [
    { id: "nombre", etiqueta: "País", tipo: "texto", valor: (p) => p.nombre },
    { id: "codigo", etiqueta: "Código", tipo: "texto", valor: (p) => p.codigo },
  ],
};
const NOMBRE: NombreFilas = { singular: "país", plural: "países" };
const ICONOS: Record<string, IconoComp> = { nombre: ConfiguracionIcon, codigo: ConfiguracionIcon };
const COLUMNAS: ColumnaTabla<FilaPais>[] = [
  {
    id: "nombre",
    label: "País",
    ocultable: false,
    clase: "font-medium",
    render: (p) => (
      <span className="flex items-center gap-2">
        <Bandera codigo={p.codigo} />
        {p.nombre}
      </span>
    ),
  },
  { id: "codigo", label: "Código", ocultable: true, clase: "text-muted-foreground tabular-nums", render: (p) => p.codigo },
];

/** Los países del sistema, con «Agregar» para sumar uno nuevo (queda disponible en Compras, el CRM, etc.). */
export function TablaPaises({ paises, puedeEscribir }: { paises: FilaPais[]; puedeEscribir: boolean }) {
  return (
    <TablaDatos
      def={DEF_PAISES}
      filas={paises}
      columnas={COLUMNAS}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(p) => p.id}
      accionPrincipal={puedeEscribir ? <CrearPaisPanel /> : undefined}
      anchoMinimo="24rem"
      ariaLabel="Países del sistema"
      vacio="No hay países."
    />
  );
}
