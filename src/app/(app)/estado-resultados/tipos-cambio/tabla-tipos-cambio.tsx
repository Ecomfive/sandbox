"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ActualizarIcon, CalendarioIcon, ExtractoIcon, WalletIcon } from "@/lib/nav-icons";
import { mesCorto } from "@/lib/af4/fecha";
import { entero, numero } from "@/lib/af4/formato";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { completarTiposCambio, eliminarTipoCambio } from "./actions";
import { CrearTipoCambioPanel } from "./crear-tipo-cambio-panel";

export interface FilaTipoCambio {
  /** `moneda:AAAA-MM`. */
  id: string;
  moneda: string;
  mes: string;
  promedio: number | null;
  cierre: number | null;
  origen: "automatico" | "manual" | null;
  dias: number | null;
  /** Movimientos de ese mes en esa moneda que esperan la tasa. */
  sinTasa: number;
  nota: string;
}

const ORIGEN: Record<string, string> = { automatico: "Automático", manual: "Manual" };

const DEF: DefTabla<FilaTipoCambio> = {
  clave: "fin-tipos-cambio",
  campos: [
    { id: "moneda", etiqueta: "Moneda", tipo: "seleccion", valores: (r) => [r.moneda], agrupable: true },
    { id: "mes", etiqueta: "Mes", tipo: "seleccion", valores: (r) => [r.mes.slice(0, 7)], agrupable: true },
    { id: "promedio", etiqueta: "Promedio", tipo: "numero", valor: (r) => r.promedio },
    { id: "cierre", etiqueta: "Cierre", tipo: "numero", valor: (r) => r.cierre },
    { id: "origen", etiqueta: "Origen", tipo: "seleccion", valores: (r) => [r.origen ? ORIGEN[r.origen] : "Falta"], agrupable: true },
    { id: "sinTasa", etiqueta: "Movimientos sin tasa", tipo: "numero", valor: (r) => r.sinTasa },
    { id: "nota", etiqueta: "Nota", tipo: "texto", valor: (r) => r.nota },
  ],
};
const NOMBRE: NombreFilas = { singular: "mes", plural: "meses" };
const ICONOS: Record<string, IconoComp> = {
  moneda: WalletIcon,
  mes: CalendarioIcon,
  promedio: WalletIcon,
  cierre: WalletIcon,
  origen: ExtractoIcon,
  sinTasa: ExtractoIcon,
  nota: ExtractoIcon,
};
/** Unidades de la moneda por 1 US$, con 4 decimales (las columnas quedan alineadas). */
const tasa = (v: number | null) => numero(v, 4);

/** Quitar con confirmación en la misma fila. */
function Quitar({ fila }: { fila: FilaTipoCambio }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const [pendiente, iniciar] = useTransition();
  if (fila.promedio === null) return null;
  if (!confirmar) {
    return (
      <button
        type="button"
        onClick={() => setConfirmar(true)}
        aria-label={`Quitar el tipo de cambio de ${fila.moneda} de ${mesCorto(fila.mes)}`}
        className={`rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted ${anilloFoco}`}
      >
        Quitar
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1">
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await eliminarTipoCambio(fila.moneda, fila.mes.slice(0, 7));
            if (r.error) mostrarToast(r.error, "destructive");
            else mostrarToast("Tipo de cambio quitado");
            setConfirmar(false);
            router.refresh();
          })
        }
        className={`rounded-md border border-destructive/30 bg-destructive-soft px-2 py-0.5 text-xs font-medium text-destructive disabled:opacity-40 ${anilloFoco}`}
      >
        {pendiente ? "Quitando…" : "Sí, quitar"}
      </button>
      <button type="button" onClick={() => setConfirmar(false)} className={`rounded-md border border-border px-2 py-0.5 text-xs ${anilloFoco}`}>
        No
      </button>
    </span>
  );
}

/** Completar desde los tipos de cambio diarios: no pisa lo manual. Va en la barra de contexto AF4 de la página. */
export function CompletarTiposCambio() {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        iniciar(async () => {
          const r = await completarTiposCambio();
          if (r.error) mostrarToast(r.error, "destructive");
          else mostrarToast(r.meses ? `${r.meses} ${r.meses === 1 ? "mes actualizado" : "meses actualizados"}` : "Ya estaba al día");
          router.refresh();
        })
      }
      aria-busy={pendiente || undefined}
      className={`${claseAccionAF4} disabled:opacity-50 ${anilloFoco}`}
    >
      <ActualizarIcon className={`h-4 w-4 ${pendiente ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
      {pendiente ? "Completando…" : "Completar desde los diarios"}
    </button>
  );
}

const COLUMNAS: ColumnaTabla<FilaTipoCambio, null>[] = [
  { id: "moneda", label: "Moneda", ocultable: false, render: (r) => r.moneda },
  { id: "mes", label: "Mes", ocultable: false, render: (r) => mesCorto(r.mes) },
  { id: "promedio", label: "Promedio", ocultable: false, clase: "text-right tabular-nums", render: (r) => tasa(r.promedio) },
  { id: "cierre", label: "Cierre", ocultable: false, clase: "text-right tabular-nums", render: (r) => tasa(r.cierre) },
  {
    id: "origen",
    label: "Origen",
    ocultable: true,
    render: (r) =>
      r.origen ? (
        <span>
          {ORIGEN[r.origen]}
          {r.origen === "automatico" && r.dias ? <span className="text-muted-foreground"> · {r.dias} días</span> : null}
        </span>
      ) : (
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
          Falta
        </span>
      ),
  },
  {
    id: "sinTasa",
    label: "Sin tasa",
    ocultable: true,
    clase: "text-right tabular-nums",
    render: (r) => (r.sinTasa ? entero(r.sinTasa) : <span className="text-muted-foreground">—</span>),
  },
  { id: "nota", label: "Nota", ocultable: true, render: (r) => <span className="text-muted-foreground">{r.nota}</span> },
];

export function TablaTiposCambio({
  filas,
  monedas,
  mesSugerido,
  puedeEscribir,
}: {
  filas: FilaTipoCambio[];
  monedas: string[];
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
        accionPrincipal={puedeEscribir ? <CrearTipoCambioPanel monedas={monedas} mesSugerido={mesSugerido} /> : undefined}
        accion={puedeEscribir ? { etiqueta: "Quitar", render: (r) => <Quitar fila={r} /> } : undefined}
        ariaLabel="Tipos de cambio por mes"
        vacio="Todavía no hay tipos de cambio. Complétalos desde los diarios o cárgalos con «Agregar»."
      />
  );
}
