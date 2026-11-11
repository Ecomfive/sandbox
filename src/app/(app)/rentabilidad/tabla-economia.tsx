"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { economia, sumarCascadas, type Cascada, type Economia } from "@/lib/finanzas/rentabilidad";
import { EnvioIcon, GastoIcon, PedidoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { entero, pct, usd, usd2 } from "../ventas-tiendas/formato";
import { numero } from "./formato";

export interface FilaEconomia {
  id: string;
  etiqueta: string;
  c: Cascada;
  e: Economia;
}

const DEF: DefTabla<FilaEconomia> = {
  clave: "rentabilidad-economia",
  campos: [
    { id: "etiqueta", etiqueta: "Tienda", tipo: "texto", valor: (f) => f.etiqueta },
    { id: "entregadas", etiqueta: "Entregadas", tipo: "numero", valor: (f) => f.e.entregadas },
    { id: "ticket", etiqueta: "Ticket", tipo: "numero", valor: (f) => f.e.ticket ?? 0 },
    { id: "marketing", etiqueta: "Marketing por entregada", tipo: "numero", valor: (f) => f.e.marketingPorEntregada ?? 0 },
    { id: "contribucion", etiqueta: "Contribución por entregada", tipo: "numero", valor: (f) => f.e.contribucionPorEntregada ?? 0 },
  ],
};
const NOMBRE: NombreFilas = { singular: "fila", plural: "filas" };
const ICONOS: Record<string, IconoComp> = { etiqueta: TiendaIcon, entregadas: EnvioIcon, ticket: GastoIcon, marketing: GastoIcon, contribucion: GastoIcon };

const num = "text-right tabular-nums whitespace-nowrap";
const dinero2 = (v: number | null) => (v === null ? "—" : usd2(v));
const tot = (f: (e: Economia) => React.ReactNode) => (filas: FilaEconomia[]) => f(economia(sumarCascadas(filas.map((x) => x.c))));

/** Punto rojo cuando las entregas del mes no llegan al punto de equilibrio. */
function Equilibrio({ e }: { e: Economia }) {
  if (e.equilibrioMes === null) return <>{e.fijosMes > 0 ? "No se alcanza" : "—"}</>;
  const debajo = e.entregadasMes < e.equilibrioMes;
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {debajo && (
        <>
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
          <span className="sr-only">Debajo del equilibrio: </span>
        </>
      )}
      {numero(e.equilibrioMes)}
    </span>
  );
}

const COLUMNAS: ColumnaTabla<FilaEconomia, null>[] = [
  { id: "etiqueta", label: "Tienda", ocultable: false, clase: "whitespace-nowrap font-medium", render: (f) => f.etiqueta },
  { id: "ordenes", label: "Órdenes", ocultable: true, clase: num, render: (f) => entero(f.e.ordenes), total: tot((e) => entero(e.ordenes)) },
  { id: "entregadas", label: "Entregadas", ocultable: false, clase: num, render: (f) => entero(f.e.entregadas), total: tot((e) => entero(e.entregadas)) },
  { id: "tasa", label: "Tasa de entrega", ocultable: false, clase: num, render: (f) => pct(f.e.tasaEntrega), total: tot((e) => pct(e.tasaEntrega)) },
  { id: "ticket", label: "Ticket", ocultable: false, clase: num, render: (f) => dinero2(f.e.ticket), total: tot((e) => dinero2(e.ticket)) },
  { id: "envio", label: "Envío por enviada", ocultable: true, clase: num, render: (f) => dinero2(f.e.costoEnvioPorEnviada), total: tot((e) => dinero2(e.costoEnvioPorEnviada)) },
  { id: "marketing", label: "Marketing por entregada", ocultable: false, clase: num, render: (f) => dinero2(f.e.marketingPorEntregada), total: tot((e) => dinero2(e.marketingPorEntregada)) },
  { id: "contribucion", label: "Contribución por entregada", ocultable: false, clase: num, render: (f) => dinero2(f.e.contribucionPorEntregada), total: tot((e) => dinero2(e.contribucionPorEntregada)) },
  { id: "fijos", label: "Fijos por mes", ocultable: true, clase: num, render: (f) => usd(f.e.fijosMes), total: tot((e) => usd(e.fijosMes)) },
  { id: "entregadasMes", label: "Entregadas por mes", ocultable: true, clase: num, render: (f) => numero(f.e.entregadasMes), total: tot((e) => numero(e.entregadasMes)) },
  { id: "equilibrio", label: "Equilibrio (entregadas por mes)", ocultable: false, clase: num, render: (f) => <Equilibrio e={f.e} />, total: tot((e) => <Equilibrio e={e} />) },
];

/** Economía unitaria de cada tienda (o de cada mes de una tienda). */
export function TablaEconomia({ filas, porMes }: { filas: FilaEconomia[]; porMes: boolean }) {
  const columnas = porMes ? COLUMNAS.map((c) => (c.id === "etiqueta" ? { ...c, label: "Mes" } : c)) : COLUMNAS;
  return (
    <TablaDatos
      def={porMes ? { ...DEF, clave: "rentabilidad-economia-mes" } : DEF}
      filas={filas}
      columnas={columnas}
      contexto={null}
      iconos={{ ...ICONOS, ordenes: PedidoIcon }}
      nombre={NOMBRE}
      claveFila={(f) => f.id}
      ariaLabel="Economía unitaria"
      anchoMinimo="56rem"
      vacio="No hay órdenes en este período."
    />
  );
}
