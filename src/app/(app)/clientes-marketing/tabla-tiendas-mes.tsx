"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import type { DescargaCompleta } from "@/components/tabla/boton-descargar";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Tooltip } from "@/components/ui/tooltip";
import { ltvCacBajo, poasBajo } from "@/lib/clientes/metricas";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero, dinero2, entero, fraccion, veces } from "@/lib/af4/formato";
import { CalendarioIcon, ClientesIcon, GastoIcon, MargenIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import type { FilaTiendaMes } from "./datos";
import { ConPunto, meses } from "./formato";

const DEF: DefTabla<FilaTiendaMes> = {
  clave: "clientes-marketing-tienda-mes",
  campos: [
    { id: "periodo", etiqueta: "Mes", tipo: "seleccion", valores: (f) => [f.periodo], formatearValor: mesCorto, agrupable: true },
    { id: "tienda", etiqueta: "Tienda", tipo: "seleccion", valores: (f) => [f.tienda], agrupable: true },
    { id: "nuevos", etiqueta: "Clientes nuevos", tipo: "numero", valor: (f) => f.i.nuevos },
    { id: "recurrentes", etiqueta: "Recurrentes", tipo: "numero", valor: (f) => f.i.recurrentes },
    { id: "gasto", etiqueta: "Marketing", tipo: "numero", valor: (f) => f.i.gasto },
    { id: "cac", etiqueta: "CAC", tipo: "numero", valor: (f) => f.i.cac },
    { id: "ltv180", etiqueta: "LTV 180 días", tipo: "numero", valor: (f) => f.i.ltv180 },
    { id: "ltvCac", etiqueta: "LTV/CAC", tipo: "numero", valor: (f) => f.i.ltvCac },
    { id: "roas", etiqueta: "ROAS", tipo: "numero", valor: (f) => f.i.roas },
    { id: "poas", etiqueta: "ROAS de margen", tipo: "numero", valor: (f) => f.i.poas },
  ],
};
const NOMBRE: NombreFilas = { singular: "fila", plural: "filas" };
const ICONOS: Record<string, IconoComp> = {
  periodo: CalendarioIcon,
  tienda: TiendaIcon,
  nuevos: ClientesIcon,
  recurrentes: ClientesIcon,
  gasto: GastoIcon,
  cac: GastoIcon,
  ltv180: MargenIcon,
  ltvCac: MargenIcon,
  roas: MargenIcon,
  poas: MargenIcon,
};

const num = "text-right tabular-nums whitespace-nowrap";
const sinLibro = (f: FilaTiendaMes, v: React.ReactNode) => (f.sinLibro ? <span className="text-muted-foreground">Sin libro</span> : v);

function Nuevos({ f }: { f: FilaTiendaMes }) {
  if (!f.primerMes) return <>{entero(f.i.nuevos)}</>;
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      <Tooltip texto="Primer mes con órdenes: incluye clientes de antes">
        <span tabIndex={0} role="img" aria-label="Primer mes con órdenes: incluye clientes de antes" className="h-1.5 w-1.5 rounded-full bg-warning" />
      </Tooltip>
      {entero(f.i.nuevos)}
    </span>
  );
}

const COLUMNAS: ColumnaTabla<FilaTiendaMes, null>[] = [
  { id: "periodo", label: "Mes", ocultable: false, clase: "whitespace-nowrap", render: (f) => mesCorto(f.periodo) },
  { id: "tienda", label: "Tienda", ocultable: false, clase: "whitespace-nowrap font-medium", render: (f) => f.tienda },
  { id: "nuevos", label: "Clientes nuevos", ocultable: false, clase: num, render: (f) => <Nuevos f={f} /> },
  { id: "recurrentes", label: "Recurrentes", ocultable: true, clase: num, render: (f) => entero(f.i.recurrentes) },
  {
    id: "recompra90",
    label: "Recompra 90 días",
    ocultable: true,
    clase: num,
    render: (f) => <ConPunto estimado={f.i.recompra90Estimado}>{fraccion(f.i.recompra90)}</ConPunto>,
  },
  { id: "ventas", label: "Ventas entregadas", ocultable: true, clase: num, render: (f) => dinero(f.i.ventas) },
  { id: "margen", label: "Margen de contribución", ocultable: true, clase: num, render: (f) => dinero(f.i.margen) },
  { id: "gasto", label: "Marketing", ocultable: false, clase: num, render: (f) => sinLibro(f, dinero(f.i.gasto)) },
  { id: "cac", label: "CAC", ocultable: false, clase: num, render: (f) => sinLibro(f, dinero2(f.i.cac)) },
  {
    id: "ltv180",
    label: "LTV 180 días",
    ocultable: false,
    clase: num,
    render: (f) => <ConPunto estimado={f.i.ltv180Estimado}>{dinero2(f.i.ltv180)}</ConPunto>,
  },
  {
    id: "ltvCac",
    label: "LTV/CAC",
    ocultable: false,
    clase: num,
    render: (f) => sinLibro(f, <ConPunto alerta={ltvCacBajo(f.i.ltvCac)}>{veces(f.i.ltvCac)}</ConPunto>),
  },
  { id: "recuperacion", label: "Recupera el CAC en", ocultable: true, clase: num, render: (f) => sinLibro(f, f.i.sinRecuperar ? "Todavía no" : meses(f.i.recuperacion)) },
  { id: "roas", label: "ROAS", ocultable: false, clase: num, render: (f) => sinLibro(f, veces(f.i.roas)) },
  {
    id: "poas",
    label: "ROAS de margen",
    ocultable: false,
    clase: num,
    render: (f) => sinLibro(f, <ConPunto alerta={poasBajo(f.i.poas)}>{veces(f.i.poas)}</ConPunto>),
  },
];

/** Clientes, CAC, LTV y ROAS de cada tienda en cada mes del período. */
export function TablaTiendasMes({ filas, descarga }: { filas: FilaTiendaMes[]; descarga: DescargaCompleta }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.id}
      ariaLabel="Clientes y marketing por tienda y mes"
      anchoMinimo="72rem"
      descargaCompleta={descarga}
      vacio="No hay órdenes en este período."
    />
  );
}
