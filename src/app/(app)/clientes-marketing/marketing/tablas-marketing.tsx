"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { PLATAFORMAS, div, poasBajo, type Plataforma } from "@/lib/clientes/metricas";
import { CalendarioIcon, GastoIcon, MargenIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { dinero, dinero2, veces } from "@/lib/af4/formato";
import { ConPunto } from "../formato";

/** Una fila de gasto: una tienda en el período o un mes de la tienda elegida. */
export interface FilaGasto {
  id: string;
  etiqueta: string;
  /** Para ordenar los meses. */
  orden: string;
  gasto: Record<Plataforma, number>;
  total: number;
  ventas: number;
  margen: number;
  nuevos: number;
  sinLibro: boolean;
}

const NOMBRE: NombreFilas = { singular: "fila", plural: "filas" };
const num = "text-right tabular-nums whitespace-nowrap";
const suma = (filas: FilaGasto[], f: (x: FilaGasto) => number) => filas.filter((x) => !x.sinLibro).reduce((a, x) => a + f(x), 0);
const conLibro = (f: FilaGasto, v: React.ReactNode) => (f.sinLibro ? <span className="text-muted-foreground">Sin libro</span> : v);

function columnas(primera: string, plataformas: Plataforma[]): ColumnaTabla<FilaGasto, null>[] {
  return [
    { id: "etiqueta", label: primera, ocultable: false, clase: "whitespace-nowrap font-medium", render: (f) => f.etiqueta },
    ...plataformas.map(
      (p): ColumnaTabla<FilaGasto, null> => ({
        id: p,
        label: PLATAFORMAS.find((x) => x.clave === p)!.etiqueta,
        ocultable: true,
        clase: num,
        render: (f) => conLibro(f, dinero(f.gasto[p])),
        total: (filas) => dinero(suma(filas, (x) => x.gasto[p])),
      }),
    ),
    { id: "total", label: "Marketing", ocultable: false, clase: `${num} font-medium`, render: (f) => conLibro(f, dinero(f.total)), total: (filas) => dinero(suma(filas, (x) => x.total)) },
    { id: "ventas", label: "Ventas entregadas", ocultable: true, clase: num, render: (f) => dinero(f.ventas), total: (filas) => dinero(filas.reduce((a, x) => a + x.ventas, 0)) },
    {
      id: "cac",
      label: "CAC",
      ocultable: false,
      clase: num,
      render: (f) => conLibro(f, dinero2(f.total > 0 ? div(f.total, f.nuevos) : null)),
      total: (filas) => dinero2(div(suma(filas, (x) => x.total), suma(filas, (x) => x.nuevos))),
    },
    {
      id: "roas",
      label: "ROAS",
      ocultable: false,
      clase: num,
      render: (f) => conLibro(f, veces(div(f.ventas, f.total))),
      total: (filas) => veces(div(suma(filas, (x) => x.ventas), suma(filas, (x) => x.total))),
    },
    {
      id: "poas",
      label: "ROAS de margen",
      ocultable: false,
      clase: num,
      render: (f) => {
        const v = div(f.margen, f.total);
        return conLibro(f, <ConPunto alerta={poasBajo(v)}>{veces(v)}</ConPunto>);
      },
      total: (filas) => {
        const v = div(suma(filas, (x) => x.margen), suma(filas, (x) => x.total));
        return <ConPunto alerta={poasBajo(v)}>{veces(v)}</ConPunto>;
      },
    },
  ];
}

function def(clave: string, primera: string, plataformas: Plataforma[]): DefTabla<FilaGasto> {
  return {
    clave,
    campos: [
      { id: "etiqueta", etiqueta: primera, tipo: "texto", valor: (f) => f.etiqueta },
      ...plataformas.map((p) => ({ id: p, etiqueta: PLATAFORMAS.find((x) => x.clave === p)!.etiqueta, tipo: "numero" as const, valor: (f: FilaGasto) => f.gasto[p] })),
      { id: "total", etiqueta: "Marketing", tipo: "numero", valor: (f) => f.total },
      { id: "ventas", etiqueta: "Ventas entregadas", tipo: "numero", valor: (f) => f.ventas },
      { id: "margen", etiqueta: "Margen de contribución", tipo: "numero", valor: (f) => f.margen },
      { id: "nuevos", etiqueta: "Clientes nuevos", tipo: "numero", valor: (f) => f.nuevos },
    ],
  };
}

/** Gasto por plataforma con CAC, ROAS y ROAS de margen: por tienda en el período o por mes de una tienda. */
export function TablaGasto({ filas, porMes, plataformas }: { filas: FilaGasto[]; porMes: boolean; plataformas: Plataforma[] }) {
  const primera = porMes ? "Mes" : "Tienda";
  const iconos: Record<string, IconoComp> = { etiqueta: porMes ? CalendarioIcon : TiendaIcon, total: GastoIcon, ventas: GastoIcon, margen: MargenIcon };
  for (const p of plataformas) iconos[p] = GastoIcon;
  return (
    <TablaDatos
      def={def(porMes ? "clientes-marketing-gasto-mes" : "clientes-marketing-gasto-tienda", primera, plataformas)}
      filas={porMes ? [...filas].sort((a, b) => a.orden.localeCompare(b.orden)) : filas}
      columnas={columnas(primera, plataformas)}
      contexto={null}
      iconos={iconos}
      nombre={NOMBRE}
      claveFila={(f) => f.id}
      ariaLabel={porMes ? "Marketing por mes" : "Marketing por tienda"}
      anchoMinimo="52rem"
      vacio="No hay gasto de marketing en este período."
    />
  );
}
