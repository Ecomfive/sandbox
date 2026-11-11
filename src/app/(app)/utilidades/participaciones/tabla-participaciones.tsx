"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Badge } from "@/components/ui/badge";
import { CalendarioIcon, EstadoIcon, PersonaIcon, TiendaIcon } from "@/lib/nav-icons";
import { mesCorto } from "@/lib/af4/fecha";
import { porcentaje } from "@/lib/af4/formato";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { CrearParticipacionPanel, type Opcion } from "./crear-participacion-panel";

export interface FilaParticipacion {
  id: string;
  socio: string;
  tienda: string;
  porcentaje: number;
  desde: string;
  vigente: boolean;
}

const DEF: DefTabla<FilaParticipacion> = {
  clave: "utilidades-participaciones",
  campos: [
    { id: "tienda", etiqueta: "Tienda", tipo: "seleccion", valores: (r) => [r.tienda], agrupable: true },
    { id: "socio", etiqueta: "Socio", tipo: "seleccion", valores: (r) => [r.socio], agrupable: true },
    { id: "porcentaje", etiqueta: "Porcentaje", tipo: "numero", valor: (r) => r.porcentaje },
    { id: "desde", etiqueta: "Rige desde", tipo: "seleccion", valores: (r) => [r.desde.slice(0, 7)], agrupable: true },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (r) => [r.vigente ? "Vigente" : "Historia"], agrupable: true },
  ],
  cerrados: { etiqueta: "Historia", esCerrado: (r) => !r.vigente, campoEstado: "estado", valoresCerrados: ["Historia"], ocultosPorDefecto: true },
  vistaInicial: { agrupar: "tienda" },
};
/** Los decimales que trae un porcentaje (hasta 4, como se guarda): «50 %», «33.3333 %». */
const decimalesDe = (v: number) => Math.min(4, (String(v).split(".")[1] ?? "").length);

const NOMBRE: NombreFilas = { singular: "porcentaje", plural: "porcentajes" };
const ICONOS: Record<string, IconoComp> = { tienda: TiendaIcon, socio: PersonaIcon, porcentaje: EstadoIcon, desde: CalendarioIcon, estado: EstadoIcon };

const COLUMNAS: ColumnaTabla<FilaParticipacion, null>[] = [
  { id: "tienda", label: "Tienda", ocultable: false, render: (r) => r.tienda },
  { id: "socio", label: "Socio", ocultable: false, render: (r) => r.socio },
  {
    id: "porcentaje",
    label: "Porcentaje",
    ocultable: false,
    clase: "text-right tabular-nums",
    render: (r) => porcentaje(r.porcentaje, { decimales: decimalesDe(r.porcentaje) }),
  },
  { id: "desde", label: "Rige desde", ocultable: true, render: (r) => mesCorto(r.desde) },
  { id: "estado", label: "Estado", ocultable: true, render: (r) => <Badge tone={r.vigente ? "success" : "neutral"}>{r.vigente ? "Vigente" : "Historia"}</Badge> },
];

export function TablaParticipaciones({
  filas,
  socios,
  tiendas,
  mesSugerido,
  puedeEscribir,
}: {
  filas: FilaParticipacion[];
  socios: Opcion[];
  tiendas: Opcion[];
  mesSugerido: string;
  puedeEscribir: boolean;
}) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(r) => r.id}
      accionPrincipal={puedeEscribir ? <CrearParticipacionPanel socios={socios} tiendas={tiendas} mesSugerido={mesSugerido} /> : undefined}
      ariaLabel="Porcentaje de la utilidad de cada tienda por socio"
      vacio="Todavía no hay porcentajes. Agrega el de cada socio en cada tienda con «Agregar»."
    />
  );
}
