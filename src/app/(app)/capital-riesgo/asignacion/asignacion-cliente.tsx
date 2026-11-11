"use client";

import { useState, useTransition } from "react";
import { claseCifra, claseSigno } from "@/components/af4/estilos-af4";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { dinero, entero, fraccion, porcentaje, SIN_DATO } from "@/lib/af4/formato";
import { LIMITES_ASIGNACION, type PropuestaTienda, type SupuestosAsignacion } from "@/lib/finanzas/asignacion-capital";
import { EstadoIcon, GastoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { guardarAjustesCapital } from "../actions";

const num = `text-right whitespace-nowrap ${claseCifra}`;
const ETIQUETA_LIMITE: Record<PropuestaTienda["limite"], string> = {
  techo: "Techo de pauta",
  retorno: "Retorno marginal",
  piso: "Piso",
  monto: "Monto agotado",
  sin_datos: "Sin datos",
};

const DEF: DefTabla<PropuestaTienda> = {
  clave: "capital-asignacion",
  campos: [
    { id: "nombre", etiqueta: "Tienda", tipo: "texto", valor: (t) => t.nombre },
    { id: "limite", etiqueta: "Se detiene por", tipo: "seleccion", valores: (t) => [ETIQUETA_LIMITE[t.limite]], agrupable: true },
    { id: "cambio", etiqueta: "Cambio", tipo: "numero", valor: (t) => t.cambio },
  ],
};

const COLUMNAS: ColumnaTabla<PropuestaTienda, null>[] = [
  { id: "nombre", label: "Tienda", ocultable: false, render: (t) => t.nombre },
  { id: "hoy", label: "Pauta hoy", ocultable: false, clase: num, render: (t) => dinero(t.pautaHoy), total: (ts) => dinero(ts.reduce((a, t) => a + t.pautaHoy, 0)) },
  { id: "propuesta", label: "Pauta propuesta", ocultable: false, clase: `${num} font-medium`, render: (t) => dinero(t.pautaPropuesta), total: (ts) => dinero(ts.filter((t) => t.limite !== "sin_datos").reduce((a, t) => a + t.pautaPropuesta, 0)) },
  { id: "cambio", label: "Cambio", ocultable: false, clase: num, render: (t) => <span className={claseSigno(t.cambio)}>{dinero(t.cambio, "USD", { conSigno: true })}</span> },
  { id: "pct", label: "Pauta ÷ ventas", ocultable: true, clase: num, render: (t) => `${porcentaje(t.pctHoy)} → ${porcentaje(t.pctPropuesto)} (techo ${t.techo} %)` },
  { id: "retorno", label: "Retorno del próximo dólar", ocultable: false, clase: num, render: (t) => `${t.retornoHoy === null ? SIN_DATO : fraccion(t.retornoHoy, { conSigno: true })} → ${t.retornoFinal === null ? SIN_DATO : fraccion(t.retornoFinal, { conSigno: true })}` },
  { id: "pedidos", label: "Pedidos por mes", ocultable: true, clase: num, render: (t) => `${entero(t.pedidosHoy)} → ${entero(t.pedidosPropuestos)}` },
  { id: "ebitda", label: "EBITDA por mes", ocultable: false, clase: `${num} font-medium`, render: (t) => <span className={claseSigno(t.ebitdaIncremental)}>{dinero(t.ebitdaIncremental, "USD", { conSigno: true })}</span>, total: (ts) => dinero(ts.reduce((a, t) => a + t.ebitdaIncremental, 0), "USD", { conSigno: true }) },
  { id: "inventario", label: "Capital en inventario", ocultable: true, clase: num, render: (t) => dinero(t.capitalInventario, "USD", { vacioSiCero: true }), total: (ts) => dinero(ts.reduce((a, t) => a + t.capitalInventario, 0)) },
  { id: "porque", label: "Por qué", ocultable: true, clase: "min-w-[22rem] max-w-xl text-xs text-muted-foreground", render: (t) => t.explicacion },
];

const ICONOS: Record<string, IconoComp> = { nombre: TiendaIcon, limite: EstadoIcon, cambio: GastoIcon };
const NOMBRE: NombreFilas = { singular: "tienda", plural: "tiendas" };

export function TablaAsignacion({ tiendas }: { tiendas: PropuestaTienda[] }) {
  return (
    <TablaDatos
      def={DEF}
      filas={tiendas}
      columnas={COLUMNAS}
      contexto={null}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(t) => t.unidadId}
      ariaLabel="Reparto de la pauta por tienda"
      anchoMinimo="64rem"
      vacio="No hay tiendas con pauta y pedidos en los últimos 3 meses."
    />
  );
}

/** Elasticidad, piso por tienda y días de inventario. «Guardar» aparece solo con un cambio. */
export function SupuestosAsignacionForm({ supuestos }: { supuestos: SupuestosAsignacion }) {
  const inicial = { elasticidad: String(supuestos.elasticidad), pisoPct: String(supuestos.pisoPct), diasInventario: String(supuestos.diasInventario) };
  const [v, setV] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const { mostrarToast } = useToast();
  const cambio = (Object.keys(inicial) as (keyof typeof inicial)[]).some((k) => v[k].trim() !== inicial[k]);
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        empezar(async () => {
          const r = await guardarAjustesCapital(v).catch(() => ({ error: "Se cortó la conexión." }));
          if (r.error) setError(r.error);
          else mostrarToast("Supuestos guardados");
        });
      }}
    >
      {(Object.keys(inicial) as (keyof typeof inicial)[]).map((k) => (
        <label key={k} className="flex flex-col gap-1">
          <span className={labelClassSm}>{LIMITES_ASIGNACION[k].etiqueta}</span>
          <input
            inputMode="decimal"
            value={v[k]}
            onChange={(e) => setV({ ...v, [k]: e.target.value })}
            className={`${fieldClassSm} w-28 text-right ${claseCifra}`}
            placeholder={`Ej: ${k === "elasticidad" ? "0.5" : k === "pisoPct" ? "50" : "45"}`}
          />
        </label>
      ))}
      {cambio && (
        <button type="submit" disabled={pendiente} className={`inline-flex h-8 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}>
          Guardar
        </button>
      )}
      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
          {error}
        </p>
      )}
    </form>
  );
}
