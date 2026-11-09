"use client";

import { useRouter } from "next/navigation";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Badge, type Tone } from "@/components/ui/badge";
import { CalendarioIcon, EstadoIcon, EtiquetaIcon, ResultadosIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import type { EstadoPresupuesto } from "@/lib/finanzas/presupuesto";
import { claseSigno } from "@/components/af4/estilos-af4";
import { dinero as formatoDinero, porcentaje } from "@/lib/af4/formato";
import { CrearPresupuestoPanel } from "./crear-presupuesto-panel";
import type { DatosGenerar } from "./campos-generar";

export interface FilaPresupuesto {
  id: string;
  nombre: string;
  anio: number;
  estado: EstadoPresupuesto;
  nivel: string;
  ingresos: number;
  ebitda: number;
  margenEbitda: number | null;
  valorEmpresa: number;
}

export const ETIQUETA_ESTADO: Record<EstadoPresupuesto, string> = { borrador: "Borrador", aprobado: "Aprobado", cerrado: "Cerrado" };
export const TONO_ESTADO: Record<EstadoPresupuesto, Tone> = { borrador: "neutral", aprobado: "success", cerrado: "info" };

const DEF: DefTabla<FilaPresupuesto> = {
  clave: "presupuesto-lista",
  campos: [
    { id: "nombre", etiqueta: "Presupuesto", tipo: "texto", valor: (r) => r.nombre },
    { id: "anio", etiqueta: "Año", tipo: "seleccion", valores: (r) => [String(r.anio)], agrupable: true },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (r) => [ETIQUETA_ESTADO[r.estado]], agrupable: true },
    { id: "nivel", etiqueta: "Nivel", tipo: "seleccion", valores: (r) => [r.nivel], agrupable: true },
    { id: "ingresos", etiqueta: "Ingresos (base)", tipo: "numero", valor: (r) => r.ingresos },
    { id: "ebitda", etiqueta: "EBITDA (base)", tipo: "numero", valor: (r) => r.ebitda },
  ],
  cerrados: { etiqueta: "Cerrados", esCerrado: (r) => r.estado === "cerrado", campoEstado: "estado", valoresCerrados: ["Cerrado"], ocultosPorDefecto: true },
};
const NOMBRE: NombreFilas = { singular: "presupuesto", plural: "presupuestos" };
const ICONOS: Record<string, IconoComp> = { nombre: EtiquetaIcon, anio: CalendarioIcon, estado: EstadoIcon, nivel: TiendaIcon, ingresos: ResultadosIcon, ebitda: ResultadosIcon };
const dinero = (v: number) => formatoDinero(v);

const COLUMNAS: ColumnaTabla<FilaPresupuesto, null>[] = [
  { id: "nombre", label: "Presupuesto", ocultable: false, render: (r) => r.nombre },
  { id: "anio", label: "Año", ocultable: true, clase: "tabular-nums", render: (r) => r.anio },
  { id: "estado", label: "Estado", ocultable: true, render: (r) => <Badge tone={TONO_ESTADO[r.estado]}>{ETIQUETA_ESTADO[r.estado]}</Badge> },
  { id: "nivel", label: "Nivel", ocultable: true, render: (r) => r.nivel },
  { id: "ingresos", label: "Ingresos (base)", ocultable: true, clase: "text-right tabular-nums", render: (r) => dinero(r.ingresos) },
  { id: "ebitda", label: "EBITDA (base)", ocultable: true, clase: "text-right tabular-nums", render: (r) => <span className={claseSigno(r.ebitda)}>{dinero(r.ebitda)}</span> },
  { id: "margen", label: "Margen EBITDA", ocultable: true, clase: "text-right tabular-nums", render: (r) => porcentaje(r.margenEbitda) },
  { id: "valor", label: "Valor de empresa", ocultable: true, clase: "text-right tabular-nums", render: (r) => dinero(r.valorEmpresa) },
];

export function TablaPresupuestos({ filas, datos, puedeEscribir }: { filas: FilaPresupuesto[]; datos: DatosGenerar | null; puedeEscribir: boolean }) {
  const router = useRouter();
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(r) => r.id}
      abrirFila={{ etiqueta: (r) => `Abrir ${r.nombre}`, alAbrir: (r) => router.push(`/presupuesto/${r.id}`) }}
      accionPrincipal={puedeEscribir && datos ? <CrearPresupuestoPanel datos={datos} /> : undefined}
      ariaLabel="Presupuestos"
      vacio="Todavía no hay presupuestos. Genera uno desde el real con «Agregar»."
    />
  );
}
