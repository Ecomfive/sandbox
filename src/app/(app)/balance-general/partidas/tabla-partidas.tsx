"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { CalendarioIcon, ExtractoIcon, WalletIcon } from "@/lib/nav-icons";
import { mesCorto } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { eliminarPartidaBalance } from "../actions";
import { CrearPartidaPanel, type OpcionEntidad } from "./crear-partida-panel";

export interface FilaPartida {
  id: string;
  entidad: string;
  rubro: string;
  concepto: string;
  mes: string;
  monto: number;
  nota: string;
}

const DEF: DefTabla<FilaPartida> = {
  clave: "balance-partidas",
  campos: [
    { id: "rubro", etiqueta: "Rubro", tipo: "seleccion", valores: (r) => [r.rubro], agrupable: true },
    { id: "concepto", etiqueta: "Concepto", tipo: "seleccion", valores: (r) => [r.concepto], agrupable: true },
    { id: "entidad", etiqueta: "Entidad", tipo: "seleccion", valores: (r) => [r.entidad], agrupable: true },
    { id: "mes", etiqueta: "Desde", tipo: "seleccion", valores: (r) => [r.mes.slice(0, 7)], agrupable: true },
    { id: "monto", etiqueta: "Saldo", tipo: "numero", valor: (r) => r.monto },
    { id: "nota", etiqueta: "Nota", tipo: "texto", valor: (r) => r.nota },
  ],
};
const NOMBRE: NombreFilas = { singular: "partida", plural: "partidas" };
const ICONOS: Record<string, IconoComp> = { rubro: WalletIcon, concepto: WalletIcon, entidad: WalletIcon, mes: CalendarioIcon, monto: WalletIcon, nota: ExtractoIcon };

/** Eliminar con confirmación en la misma fila. */
function Eliminar({ fila }: { fila: FilaPartida }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const [pendiente, iniciar] = useTransition();
  if (!confirmar) {
    return (
      <button
        type="button"
        onClick={() => setConfirmar(true)}
        aria-label={`Eliminar ${fila.concepto} de ${mesCorto(fila.mes)}`}
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
            const r = await eliminarPartidaBalance(fila.id);
            if (r.error) mostrarToast(r.error, "destructive");
            else mostrarToast("Partida eliminada");
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

const COLUMNAS: ColumnaTabla<FilaPartida, null>[] = [
  { id: "concepto", label: "Concepto", ocultable: false, render: (r) => r.concepto },
  { id: "rubro", label: "Rubro", ocultable: true, render: (r) => r.rubro },
  { id: "entidad", label: "Entidad", ocultable: true, render: (r) => r.entidad },
  { id: "mes", label: "Desde el cierre de", ocultable: false, render: (r) => mesCorto(r.mes) },
  {
    id: "monto",
    label: "Saldo",
    ocultable: false,
    clase: "text-right tabular-nums",
    render: (r) => <span className={r.monto < 0 ? "text-destructive" : ""}>{dinero(r.monto, "USD", { decimales: 2 })}</span>,
  },
  { id: "nota", label: "Nota", ocultable: true, render: (r) => <span className="text-muted-foreground">{r.nota}</span> },
];

export function TablaPartidas({
  filas,
  entidades,
  mesSugerido,
  puedeEscribir,
}: {
  filas: FilaPartida[];
  entidades: OpcionEntidad[];
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
      accionPrincipal={puedeEscribir ? <CrearPartidaPanel entidades={entidades} mesSugerido={mesSugerido} /> : undefined}
      accion={puedeEscribir ? { etiqueta: "Eliminar", render: (r) => <Eliminar fila={r} /> } : undefined}
      ariaLabel="Partidas manuales del balance general"
      vacio="Todavía no hay partidas. Carga préstamos, aportes o el patrimonio inicial con «Agregar»."
    />
  );
}
