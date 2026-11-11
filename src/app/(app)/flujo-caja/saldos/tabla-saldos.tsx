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
import { eliminarSaldoInicial } from "../actions";
import { CrearSaldoPanel, type OpcionCuenta } from "./crear-saldo-panel";

export interface FilaSaldo {
  id: string;
  cuenta: string;
  clase: string;
  mes: string;
  monto: number;
  nota: string;
}

const CLASE: Record<string, string> = { banco: "Banco", tarjeta: "Tarjeta", billetera: "Billetera", otro: "Otro" };

const DEF: DefTabla<FilaSaldo> = {
  clave: "flujo-saldos",
  campos: [
    { id: "cuenta", etiqueta: "Cuenta", tipo: "seleccion", valores: (r) => [r.cuenta], agrupable: true },
    { id: "clase", etiqueta: "Clase", tipo: "seleccion", valores: (r) => [CLASE[r.clase] ?? r.clase], agrupable: true },
    { id: "mes", etiqueta: "Mes", tipo: "seleccion", valores: (r) => [r.mes.slice(0, 7)], agrupable: true },
    { id: "monto", etiqueta: "Saldo", tipo: "numero", valor: (r) => r.monto },
    { id: "nota", etiqueta: "Nota", tipo: "texto", valor: (r) => r.nota },
  ],
};
const NOMBRE: NombreFilas = { singular: "saldo", plural: "saldos" };
const ICONOS: Record<string, IconoComp> = { cuenta: WalletIcon, clase: WalletIcon, mes: CalendarioIcon, monto: WalletIcon, nota: ExtractoIcon };

/** Eliminar con confirmación en la misma fila. */
function Eliminar({ fila }: { fila: FilaSaldo }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [confirmar, setConfirmar] = useState(false);
  const [pendiente, iniciar] = useTransition();
  if (!confirmar) {
    return (
      <button
        type="button"
        onClick={() => setConfirmar(true)}
        aria-label={`Eliminar el saldo de ${fila.cuenta} de ${mesCorto(fila.mes)}`}
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
            const r = await eliminarSaldoInicial(fila.id);
            if (r.error) mostrarToast(r.error, "destructive");
            else mostrarToast("Saldo eliminado");
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

const COLUMNAS: ColumnaTabla<FilaSaldo, null>[] = [
  { id: "cuenta", label: "Cuenta", ocultable: false, render: (r) => r.cuenta },
  { id: "clase", label: "Clase", ocultable: true, render: (r) => CLASE[r.clase] ?? r.clase },
  { id: "mes", label: "Al comenzar", ocultable: false, render: (r) => mesCorto(r.mes) },
  {
    id: "monto",
    label: "Saldo",
    ocultable: false,
    clase: "text-right tabular-nums",
    render: (r) => <span className={r.monto < 0 ? "text-destructive" : ""}>{dinero(r.monto, "USD", { decimales: 2 })}</span>,
  },
  { id: "nota", label: "Nota", ocultable: true, render: (r) => <span className="text-muted-foreground">{r.nota}</span> },
];

export function TablaSaldos({
  filas,
  cuentas,
  mesSugerido,
  puedeEscribir,
}: {
  filas: FilaSaldo[];
  cuentas: OpcionCuenta[];
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
      accionPrincipal={puedeEscribir ? <CrearSaldoPanel cuentas={cuentas} mesSugerido={mesSugerido} /> : undefined}
      accion={puedeEscribir ? { etiqueta: "Eliminar", render: (r) => <Eliminar fila={r} /> } : undefined}
      ariaLabel="Saldos iniciales por cuenta"
      vacio="Todavía no hay saldos iniciales. Carga el de cada cuenta con «Agregar»."
    />
  );
}
