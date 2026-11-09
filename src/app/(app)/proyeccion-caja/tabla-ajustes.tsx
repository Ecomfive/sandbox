"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CalendarioIcon, EtiquetaIcon, ExtractoIcon, WalletIcon } from "@/lib/nav-icons";
import { diaCorto, type AjusteProyeccion } from "@/lib/finanzas/proyeccion-caja";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { dinero } from "@/lib/af4/formato";
import { eliminarAjuste } from "./actions";
import { CrearAjustePanel } from "./crear-ajuste-panel";

const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

const DEF: DefTabla<AjusteProyeccion> = {
  clave: "proyeccion-ajustes",
  campos: [
    { id: "concepto", etiqueta: "Concepto", tipo: "texto", valor: (r) => r.concepto },
    { id: "semana", etiqueta: "Semana", tipo: "seleccion", valores: (r) => [r.semana], agrupable: true, formatearValor: (v) => `Semana del ${diaCorto(v)}` },
    { id: "sentido", etiqueta: "Movimiento", tipo: "seleccion", valores: (r) => [r.monto > 0 ? "Entra" : "Sale"], agrupable: true },
    { id: "monto", etiqueta: "Monto", tipo: "numero", valor: (r) => r.monto },
    { id: "nota", etiqueta: "Nota", tipo: "texto", valor: (r) => r.nota ?? "" },
  ],
};
const NOMBRE: NombreFilas = { singular: "ajuste", plural: "ajustes" };
const ICONOS: Record<string, IconoComp> = { concepto: EtiquetaIcon, semana: CalendarioIcon, sentido: WalletIcon, monto: WalletIcon, nota: ExtractoIcon };

/** Eliminar con confirmación en la misma fila. */
function Eliminar({ fila }: { fila: AjusteProyeccion }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const [pendiente, iniciar] = useTransition();
  if (!confirmar) {
    return (
      <button
        type="button"
        onClick={() => setConfirmar(true)}
        aria-label={`Eliminar el ajuste ${fila.concepto} de la semana del ${diaCorto(fila.semana)}`}
        className={`rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted ${anilloFoco}`}
      >
        Eliminar
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
            const r = await eliminarAjuste(fila.id);
            if (r.error) mostrarToast(r.error, "destructive");
            else mostrarToast("Ajuste eliminado");
            setConfirmar(false);
            router.refresh();
          })
        }
        className={`rounded-md border border-destructive/30 bg-destructive-soft px-2 py-0.5 text-xs font-medium text-destructive disabled:opacity-40 ${anilloFoco}`}
      >
        {pendiente ? "Eliminando…" : "Sí, eliminar"}
      </button>
      <button type="button" onClick={() => setConfirmar(false)} className={`rounded-md border border-border px-2 py-0.5 text-xs ${anilloFoco}`}>
        No
      </button>
    </span>
  );
}

const COLUMNAS: ColumnaTabla<AjusteProyeccion, null>[] = [
  { id: "concepto", label: "Concepto", ocultable: false, render: (r) => r.concepto },
  { id: "semana", label: "Semana", ocultable: false, render: (r) => `Semana del ${diaCorto(r.semana)}` },
  {
    id: "monto",
    label: "Monto",
    ocultable: false,
    clase: "text-right tabular-nums",
    render: (r) => <span className={r.monto < 0 ? "text-destructive" : ""}>{usd(r.monto)}</span>,
  },
  { id: "nota", label: "Nota", ocultable: true, render: (r) => <span className="text-muted-foreground">{r.nota}</span> },
];

export function TablaAjustes({ filas, semanas, puedeEscribir }: { filas: AjusteProyeccion[]; semanas: string[]; puedeEscribir: boolean }) {
  return (
    <section aria-labelledby="titulo-ajustes" className="flex flex-col gap-2">
      <h2 id="titulo-ajustes" className="text-sm font-semibold">
        Ajustes manuales
      </h2>
      <TablaDatos
        def={DEF}
        filas={filas}
        columnas={COLUMNAS}
        contexto={null}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(r) => r.id}
        accionPrincipal={puedeEscribir ? <CrearAjustePanel semanas={semanas} /> : undefined}
        accion={puedeEscribir ? { etiqueta: "Eliminar", render: (r) => <Eliminar fila={r} /> } : undefined}
        ariaLabel="Ajustes manuales de la proyección"
        vacio="Sin ajustes en estas 13 semanas."
      />
    </section>
  );
}
