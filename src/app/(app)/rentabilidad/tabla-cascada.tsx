"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Tooltip } from "@/components/ui/tooltip";
import { sobreVentas, sumarCascadas, type Cascada, type Escalon } from "@/lib/finanzas/rentabilidad";
import type { DescargaCompleta } from "@/components/tabla/boton-descargar";
import { GastoIcon, ResultadosIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { usd } from "../ventas-tiendas/formato";
import { ETIQUETA_FUENTE, pct1 } from "./formato";

export interface FilaCascada {
  id: string;
  etiqueta: string;
  c: Cascada;
}

const DEF: DefTabla<FilaCascada> = {
  clave: "rentabilidad-cascada",
  campos: [
    { id: "etiqueta", etiqueta: "Tienda", tipo: "texto", valor: (f) => f.etiqueta },
    { id: "ventas", etiqueta: "Ventas", tipo: "numero", valor: (f) => f.c.ventas.valor },
    { id: "mercancia", etiqueta: "Mercancía", tipo: "numero", valor: (f) => f.c.mercancia.valor },
    { id: "otros", etiqueta: "Otros costos de venta", tipo: "numero", valor: (f) => f.c.otrosVariables },
    { id: "margen", etiqueta: "Margen bruto", tipo: "numero", valor: (f) => f.c.margenBruto },
    { id: "envio", etiqueta: "Envío y delivery", tipo: "numero", valor: (f) => f.c.envio.valor },
    { id: "marketing", etiqueta: "Marketing", tipo: "numero", valor: (f) => f.c.marketing },
    { id: "contribucion", etiqueta: "Margen de contribución", tipo: "numero", valor: (f) => f.c.contribucion },
    { id: "administracion", etiqueta: "Administración", tipo: "numero", valor: (f) => f.c.administracion },
    { id: "ebitda", etiqueta: "EBITDA", tipo: "numero", valor: (f) => f.c.ebitda },
  ],
};
const NOMBRE: NombreFilas = { singular: "fila", plural: "filas" };
const ICONOS: Record<string, IconoComp> = { etiqueta: TiendaIcon, ebitda: ResultadosIcon, contribucion: ResultadosIcon, margen: ResultadosIcon };

/** Un monto con su % sobre ventas; si viene de un escalón, también su fuente y un punto ámbar si las fuentes difieren. */
function Celda({ valor, c, escalon, fuerte }: { valor: number; c: Cascada; escalon?: Escalon; fuerte?: boolean }) {
  const p = sobreVentas(valor, c);
  const difiere = escalon && escalon.mesesDifieren > 0 && escalon.alterno !== null;
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className={`inline-flex items-center gap-1.5 ${fuerte ? "font-semibold" : ""} ${valor < 0 ? "text-destructive" : ""}`}>
        {difiere && (
          <Tooltip texto={`La otra fuente dice ${usd(escalon.alterno!)}`}>
            <span
              tabIndex={0}
              role="img"
              aria-label={`Las fuentes difieren: la otra dice ${usd(escalon.alterno!)}`}
              className="h-1.5 w-1.5 rounded-full bg-warning"
            />
          </Tooltip>
        )}
        {usd(valor)}
      </span>
      <span className="text-xs text-muted-foreground">
        {pct1(p)}
        {escalon && escalon.fuente !== "sin_datos" ? ` · ${ETIQUETA_FUENTE[escalon.fuente]}` : ""}
      </span>
    </span>
  );
}

const tot = (render: (c: Cascada) => React.ReactNode) => (filas: FilaCascada[]) => render(sumarCascadas(filas.map((f) => f.c)));
const num = "text-right tabular-nums whitespace-nowrap";

const COLUMNAS: ColumnaTabla<FilaCascada, null>[] = [
  { id: "etiqueta", label: "Tienda", ocultable: false, clase: "whitespace-nowrap font-medium", render: (f) => f.etiqueta },
  { id: "ventas", label: "Ventas", ocultable: false, clase: num, render: (f) => <Celda valor={f.c.ventas.valor} c={f.c} escalon={f.c.ventas} />, total: tot((c) => <Celda valor={c.ventas.valor} c={c} escalon={c.ventas} />) },
  { id: "mercancia", label: "Mercancía", ocultable: true, clase: num, render: (f) => <Celda valor={f.c.mercancia.valor} c={f.c} escalon={f.c.mercancia} />, total: tot((c) => <Celda valor={c.mercancia.valor} c={c} escalon={c.mercancia} />) },
  { id: "otros", label: "Otros costos de venta", ocultable: true, clase: num, render: (f) => <Celda valor={f.c.otrosVariables} c={f.c} />, total: tot((c) => <Celda valor={c.otrosVariables} c={c} />) },
  { id: "margen", label: "Margen bruto", ocultable: false, clase: num, render: (f) => <Celda valor={f.c.margenBruto} c={f.c} fuerte />, total: tot((c) => <Celda valor={c.margenBruto} c={c} fuerte />) },
  { id: "envio", label: "Envío y delivery", ocultable: true, clase: num, render: (f) => <Celda valor={f.c.envio.valor} c={f.c} escalon={f.c.envio} />, total: tot((c) => <Celda valor={c.envio.valor} c={c} escalon={c.envio} />) },
  { id: "marketing", label: "Marketing", ocultable: true, clase: num, render: (f) => <Celda valor={f.c.marketing} c={f.c} />, total: tot((c) => <Celda valor={c.marketing} c={c} />) },
  { id: "contribucion", label: "Margen de contribución", ocultable: false, clase: num, render: (f) => <Celda valor={f.c.contribucion} c={f.c} fuerte />, total: tot((c) => <Celda valor={c.contribucion} c={c} fuerte />) },
  { id: "administracion", label: "Administración", ocultable: true, clase: num, render: (f) => <Celda valor={f.c.administracion} c={f.c} />, total: tot((c) => <Celda valor={c.administracion} c={c} />) },
  { id: "ebitda", label: "EBITDA", ocultable: false, clase: num, render: (f) => <Celda valor={f.c.ebitda} c={f.c} fuerte />, total: tot((c) => <Celda valor={c.ebitda} c={c} fuerte />) },
];

/** La cascada de margen: una fila por tienda (o por mes, si se eligió una tienda). */
export function TablaCascada({ filas, porMes, descarga }: { filas: FilaCascada[]; porMes: boolean; descarga: DescargaCompleta }) {
  const columnas = porMes ? COLUMNAS.map((c) => (c.id === "etiqueta" ? { ...c, label: "Mes" } : c)) : COLUMNAS;
  return (
    <TablaDatos
      def={porMes ? { ...DEF, clave: "rentabilidad-cascada-mes" } : DEF}
      filas={filas}
      columnas={columnas}
      contexto={null}
      iconos={{ ...ICONOS, ventas: GastoIcon }}
      nombre={NOMBRE}
      claveFila={(f) => f.id}
      ariaLabel="Cascada de margen"
      anchoMinimo="64rem"
      descargaCompleta={descarga}
      vacio="No hay datos en este período."
    />
  );
}
