"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero, entero, porcentaje } from "@/lib/af4/formato";
import type { DiferenciaTP } from "@/lib/finanzas/precio-transferencia";
import { CalendarioIcon, PedidoIcon, WalletIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";

export type FilaDiferenciaTP = DiferenciaTP & { id: string; tienda: string };

const DEF: DefTabla<FilaDiferenciaTP> = {
  clave: "fin-tp-diferencias",
  campos: [
    { id: "tienda", etiqueta: "Tienda", tipo: "seleccion", valores: (f) => [f.tienda], agrupable: true },
    { id: "periodo", etiqueta: "Mes", tipo: "seleccion", valores: (f) => [f.periodo.slice(0, 7)], agrupable: true },
    { id: "unidades", etiqueta: "Unidades entregadas", tipo: "numero", valor: (f) => f.unidades },
    { id: "ventas", etiqueta: "Ventas", tipo: "numero", valor: (f) => f.ventas },
    { id: "registrado", etiqueta: "Mercancía en el libro", tipo: "numero", valor: (f) => f.registrado },
    { id: "esperado", etiqueta: "A precio de transferencia", tipo: "numero", valor: (f) => f.esperado },
    { id: "costoNoCargado", etiqueta: "Costo no cargado", tipo: "numero", valor: (f) => f.costoNoCargado },
    { id: "margenImportadora", etiqueta: "Margen de la importadora", tipo: "numero", valor: (f) => f.margenImportadora },
    { id: "diferencia", etiqueta: "Diferencia", tipo: "numero", valor: (f) => f.diferencia },
  ],
  vistaInicial: { agrupar: "tienda" },
};

const ICONOS: Record<string, IconoComp> = {
  tienda: PedidoIcon,
  periodo: CalendarioIcon,
  unidades: PedidoIcon,
  ventas: WalletIcon,
  registrado: WalletIcon,
  esperado: WalletIcon,
  costoNoCargado: WalletIcon,
  margenImportadora: WalletIcon,
  diferencia: WalletIcon,
};

const num = "text-right tabular-nums whitespace-nowrap";
const usd = (v: number) => dinero(v, "USD");
const suma = (fs: FilaDiferenciaTP[], f: (x: FilaDiferenciaTP) => number) => fs.reduce((a, x) => a + f(x), 0);
const pct = (parte: number, total: number) => (total > 0 ? porcentaje((parte / total) * 100) : "—");

const COLUMNAS: ColumnaTabla<FilaDiferenciaTP, null>[] = [
  {
    id: "periodo",
    label: "Mes",
    ocultable: false,
    clase: "whitespace-nowrap",
    render: (f) =>
      f.sinCosto > 0 ? (
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
          {mesCorto(f.periodo)}
          <span className="sr-only">: {entero(f.sinCosto)} unidades sin costo</span>
        </span>
      ) : (
        mesCorto(f.periodo)
      ),
  },
  { id: "tienda", label: "Tienda", ocultable: false, clase: "whitespace-nowrap", render: (f) => f.tienda },
  { id: "unidades", label: "Unidades", ocultable: true, clase: num, render: (f) => entero(f.unidades), total: (fs) => entero(suma(fs, (x) => x.unidades)) },
  { id: "sinCosto", label: "Sin costo", ocultable: true, oculta: true, clase: num, render: (f) => entero(f.sinCosto), total: (fs) => entero(suma(fs, (x) => x.sinCosto)) },
  { id: "ventas", label: "Ventas", ocultable: true, clase: num, render: (f) => usd(f.ventas), total: (fs) => usd(suma(fs, (x) => x.ventas)) },
  { id: "registrado", label: "En el libro", ocultable: false, clase: num, render: (f) => usd(f.registrado), total: (fs) => usd(suma(fs, (x) => x.registrado)) },
  {
    id: "pctRegistrado",
    label: "% ventas",
    ocultable: true,
    clase: num,
    render: (f) => (f.pctRegistrado === null ? "—" : porcentaje(f.pctRegistrado)),
    total: (fs) => pct(suma(fs, (x) => x.registrado), suma(fs, (x) => x.ventas)),
  },
  { id: "costo", label: "Costo puesto", ocultable: true, clase: num, render: (f) => usd(f.costo), total: (fs) => usd(suma(fs, (x) => x.costo)) },
  { id: "esperado", label: "A precio de transferencia", ocultable: false, clase: num, render: (f) => usd(f.esperado), total: (fs) => usd(suma(fs, (x) => x.esperado)) },
  {
    id: "pctEsperado",
    label: "% ventas",
    ocultable: true,
    clase: num,
    render: (f) => (f.pctEsperado === null ? "—" : porcentaje(f.pctEsperado)),
    total: (fs) => pct(suma(fs, (x) => x.esperado), suma(fs, (x) => x.ventas)),
  },
  { id: "costoNoCargado", label: "Costo no cargado", ocultable: true, clase: num, render: (f) => usd(f.costoNoCargado), total: (fs) => usd(suma(fs, (x) => x.costoNoCargado)) },
  { id: "margenImportadora", label: "Margen importadora", ocultable: true, clase: num, render: (f) => usd(f.margenImportadora), total: (fs) => usd(suma(fs, (x) => x.margenImportadora)) },
  { id: "diferencia", label: "Diferencia", ocultable: false, clase: `${num} font-medium`, render: (f) => usd(f.diferencia), total: (fs) => usd(suma(fs, (x) => x.diferencia)) },
];

/** La diferencia de cada tienda y mes: lo que el libro le cargó contra la mercancía a precio de transferencia. */
export function TablaDiferenciasTP({ filas }: { filas: FilaDiferenciaTP[] }) {
  return (
    <TablaDatos
      def={DEF}
      filas={filas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={{ singular: "tienda y mes", plural: "tiendas y meses" }}
      claveFila={(f) => f.id}
      ariaLabel="Diferencia de mercancía por tienda y mes"
      vacio="No hay entregas ni mercancía cargada a las tiendas en este período."
    />
  );
}
