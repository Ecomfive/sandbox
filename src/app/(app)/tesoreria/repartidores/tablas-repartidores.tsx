"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { Badge, type Tone } from "@/components/ui/badge";
import { diaMes, fechaCorta } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import type { AntiguedadRepartidor, DepositoRepartidor, EstadoDeposito } from "@/lib/finanzas/tesoreria";
import { CalendarioIcon, EstadoIcon, PersonaIcon, WalletIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";

const d2 = (v: number) => dinero(v, "USD", { decimales: 2, vacioSiCero: true });
const ICONOS: Record<string, IconoComp> = { repartidor: PersonaIcon, total: WalletIcon, semana: CalendarioIcon, estado: EstadoIcon, faltante: WalletIcon };

const ETIQUETA_ESTADO: Record<EstadoDeposito, string> = { en_curso: "Semana en curso", completo: "Completo", incompleto: "Incompleto", faltante: "Sin depósito" };
const TONO_ESTADO: Record<EstadoDeposito, Tone> = { en_curso: "info", completo: "success", incompleto: "warning", faltante: "destructive" };

const DEF_ANT: DefTabla<AntiguedadRepartidor> = {
  clave: "tesoreria-antiguedad-efectivo",
  campos: [
    { id: "repartidor", etiqueta: "Repartidor", tipo: "texto", valor: (r) => r.repartidor },
    { id: "total", etiqueta: "Sin rendir", tipo: "numero", valor: (r) => r.total },
    { id: "estado", etiqueta: "Alerta", tipo: "seleccion", valores: (r) => [r.alerta ? "Con alerta" : "Al día"], agrupable: true },
  ],
};

const COL_ANT: ColumnaTabla<AntiguedadRepartidor, null>[] = [
  {
    id: "repartidor",
    label: "Repartidor",
    ocultable: false,
    render: (r) => (
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${r.alerta ? "bg-destructive" : "bg-success"}`} />
        {r.repartidor}
        {r.alerta && <span className="sr-only">(con alerta)</span>}
      </span>
    ),
  },
  { id: "t03", label: "0 a 3 días", ocultable: true, clase: "text-right tabular-nums", render: (r) => d2(r.tramos["0-3"]) },
  { id: "t47", label: "4 a 7 días", ocultable: true, clase: "text-right tabular-nums", render: (r) => d2(r.tramos["4-7"]) },
  { id: "t814", label: "8 a 14 días", ocultable: true, clase: "text-right tabular-nums", render: (r) => d2(r.tramos["8-14"]) },
  { id: "t15", label: "15 días o más", ocultable: true, clase: "text-right tabular-nums", render: (r) => d2(r.tramos["15+"]) },
  { id: "total", label: "Sin rendir", ocultable: false, clase: "text-right tabular-nums font-medium", render: (r) => d2(r.total), total: (fs) => d2(fs.reduce((a, f) => a + f.total, 0)) },
  { id: "desde", label: "Desde", ocultable: false, render: (r) => `${diaMes(r.desde)} · ${r.masViejo} días` },
];

export function TablaAntiguedad({ filas }: { filas: AntiguedadRepartidor[] }) {
  return (
    <TablaDatos
      def={DEF_ANT}
      filas={filas}
      columnas={COL_ANT}
      contexto={null}
      iconos={ICONOS}
      nombre={{ singular: "repartidor", plural: "repartidores" }}
      claveFila={(r) => r.repartidorId}
      ariaLabel="Efectivo sin rendir por repartidor y antigüedad"
      vacio="Ningún repartidor tiene efectivo sin rendir."
    />
  );
}

const DEF_DEP: DefTabla<DepositoRepartidor> = {
  clave: "tesoreria-depositos-repartidores",
  campos: [
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (r) => [ETIQUETA_ESTADO[r.estado]], agrupable: true, ordenGrupos: ["Sin depósito", "Incompleto", "Semana en curso", "Completo"] },
    { id: "repartidor", etiqueta: "Repartidor", tipo: "seleccion", valores: (r) => [r.repartidor], agrupable: true },
    { id: "semana", etiqueta: "Semana", tipo: "texto", valor: (r) => r.semana },
    { id: "faltante", etiqueta: "Falta", tipo: "numero", valor: (r) => r.faltante },
  ],
  cerrados: { etiqueta: "Completas", esCerrado: (r) => r.estado === "completo", campoEstado: "estado", valoresCerrados: ["Completo"], ocultosPorDefecto: true },
  vistaInicial: { agrupar: "estado" },
};

const COL_DEP: ColumnaTabla<DepositoRepartidor, null>[] = [
  { id: "repartidor", label: "Repartidor", ocultable: false, render: (r) => r.repartidor },
  { id: "semana", label: "Semana", ocultable: false, render: (r) => `${diaMes(r.semana)} al ${diaMes(new Date(Date.parse(`${r.semana}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10))}` },
  { id: "cobrado", label: "Cobrado en efectivo", ocultable: true, clase: "text-right tabular-nums", render: (r) => d2(r.cobrado) },
  { id: "compensado", label: "Compensado en su cierre", ocultable: true, clase: "text-right tabular-nums", render: (r) => d2(r.compensado) },
  { id: "esperado", label: "Debía depositar", ocultable: false, clase: "text-right tabular-nums", render: (r) => d2(r.esperado) },
  { id: "rendido", label: "Depositado", ocultable: false, clase: "text-right tabular-nums", render: (r) => d2(r.rendido) },
  { id: "faltante", label: "Falta", ocultable: false, clase: "text-right tabular-nums font-medium", render: (r) => d2(r.faltante), total: (fs) => d2(fs.reduce((a, f) => a + f.faltante, 0)) },
  { id: "estado", label: "Estado", ocultable: false, render: (r) => <Badge tone={TONO_ESTADO[r.estado]}>{ETIQUETA_ESTADO[r.estado]}</Badge> },
  { id: "primera", label: "Primer cobro", ocultable: true, render: (r) => fechaCorta(r.primeraFecha) },
];

export function TablaDepositos({ filas }: { filas: DepositoRepartidor[] }) {
  return (
    <TablaDatos
      def={DEF_DEP}
      filas={filas}
      columnas={COL_DEP}
      contexto={null}
      iconos={ICONOS}
      nombre={{ singular: "semana", plural: "semanas" }}
      claveFila={(r) => `${r.repartidorId}|${r.semana}`}
      ariaLabel="Depósitos de los repartidores frente a lo cobrado, por semana"
      vacio="Sin efectivo cobrado en estos 90 días."
    />
  );
}
