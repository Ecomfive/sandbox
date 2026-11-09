"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero2, entero, porcentaje } from "@/lib/af4/formato";
import { CalendarioIcon, ConciliacionIcon, EnvioIcon, GastoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { TOLERANCIA_CUADRE, type FilaCuadreLibro } from "@/lib/ventas/resumen";

type Situacion = "cuadra" | "distinto" | "sin_libro";

const situacion = (c: FilaCuadreLibro): Situacion =>
  !c.ingresos_libro ? "sin_libro" : Math.abs(c.diferencia ?? 0) > TOLERANCIA_CUADRE ? "distinto" : "cuadra";

const ETIQUETA_SITUACION: Record<Situacion, string> = { cuadra: "Cuadra", distinto: "No cuadra", sin_libro: "Sin ingresos en el libro" };

const DEF: DefTabla<FilaCuadreLibro> = {
  clave: "ventas-tiendas-cuadre",
  campos: [
    { id: "periodo", etiqueta: "Mes", tipo: "seleccion", valores: (c) => [c.periodo], formatearValor: mesCorto, agrupable: true },
    { id: "tienda", etiqueta: "Tienda", tipo: "seleccion", valores: (c) => [c.tienda], agrupable: true },
    {
      id: "situacion",
      etiqueta: "Cuadre",
      tipo: "seleccion",
      valores: (c) => [situacion(c)],
      opciones: () => (Object.keys(ETIQUETA_SITUACION) as Situacion[]).map((s) => ({ valor: s, etiqueta: ETIQUETA_SITUACION[s] })),
      formatearValor: (v) => ETIQUETA_SITUACION[v as Situacion] ?? v,
      agrupable: true,
    },
    { id: "entregadas", etiqueta: "Entregadas", tipo: "numero", valor: (c) => c.entregadas },
    { id: "ventas", etiqueta: "Ventas entregadas", tipo: "numero", valor: (c) => c.ventas_entregadas },
    { id: "libro", etiqueta: "Ingresos del libro", tipo: "numero", valor: (c) => c.ingresos_libro ?? 0 },
    { id: "diferencia", etiqueta: "Diferencia", tipo: "numero", valor: (c) => c.diferencia ?? 0 },
  ],
};
const NOMBRE: NombreFilas = { singular: "fila", plural: "filas" };
const ICONOS: Record<string, IconoComp> = {
  periodo: CalendarioIcon,
  tienda: TiendaIcon,
  situacion: ConciliacionIcon,
  entregadas: EnvioIcon,
  ventas: GastoIcon,
  libro: GastoIcon,
  diferencia: GastoIcon,
};

const num = "text-right tabular-nums whitespace-nowrap";
const suma = (filas: FilaCuadreLibro[], f: (c: FilaCuadreLibro) => number) => filas.reduce((a, c) => a + f(c), 0);

/** La diferencia con su punto: ámbar si no cuadra, gris si el libro no tiene ingresos de esa tienda en ese mes. */
function Diferencia({ c }: { c: FilaCuadreLibro }) {
  const s = situacion(c);
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {s !== "cuadra" && (
        <>
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${s === "sin_libro" ? "bg-muted-foreground" : "bg-warning"}`} />
          <span className="sr-only">{ETIQUETA_SITUACION[s]}: </span>
        </>
      )}
      {s === "sin_libro" ? "—" : dinero2(c.diferencia)}
      {s === "distinto" && c.diferencia_pct !== null && <span className="text-xs text-muted-foreground">{porcentaje(c.diferencia_pct, { conSigno: true })}</span>}
    </span>
  );
}

const COLUMNAS: ColumnaTabla<FilaCuadreLibro, null>[] = [
  { id: "periodo", label: "Mes", ocultable: false, clase: "whitespace-nowrap", render: (c) => mesCorto(c.periodo) },
  { id: "tienda", label: "Tienda", ocultable: false, clase: "whitespace-nowrap font-medium", render: (c) => c.tienda },
  { id: "entregadas", label: "Entregadas", ocultable: true, clase: num, render: (c) => entero(c.entregadas), total: (fs) => entero(suma(fs, (c) => c.entregadas)) },
  { id: "ventas", label: "Ventas entregadas", ocultable: false, clase: num, render: (c) => dinero2(c.ventas_entregadas), total: (fs) => dinero2(suma(fs, (c) => c.ventas_entregadas)) },
  {
    id: "libro",
    label: "Ingresos del libro",
    ocultable: false,
    clase: num,
    render: (c) => (c.ingresos_libro ? dinero2(c.ingresos_libro) : <span className="text-muted-foreground">Sin ingresos</span>),
    total: (fs) => dinero2(suma(fs, (c) => c.ingresos_libro ?? 0)),
  },
  { id: "diferencia", label: "Diferencia", ocultable: false, clase: num, render: (c) => <Diferencia c={c} />, total: (fs) => dinero2(suma(fs, (c) => c.diferencia ?? 0)) },
  {
    id: "devoluciones",
    label: "Devoluciones del libro",
    ocultable: true,
    clase: `${num} text-muted-foreground`,
    render: (c) => dinero2(c.devoluciones_libro, "USD", { vacioSiCero: true }),
    total: (fs) => dinero2(suma(fs, (c) => c.devoluciones_libro), "USD", { vacioSiCero: true }),
  },
];

/** Ventas entregadas de cada tienda y mes contra los ingresos que el libro le imputa. */
export function TablaCuadre({ filas }: { filas: FilaCuadreLibro[] }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(c) => `${c.periodo}|${c.unidad_id}`}
      ariaLabel="Ventas entregadas contra ingresos del libro"
      vacio="No hay ventas en la ventana."
    />
  );
}
