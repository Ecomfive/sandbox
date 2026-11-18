"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { claseCifra } from "@/components/af4/estilos-af4";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { dinero2, SIN_DATO } from "@/lib/af4/formato";
import { fechaCorta, mesCorto } from "@/lib/af4/fecha";
import { CalendarioIcon, GastoIcon, PedidoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import { cambiarEstadoRecurrente, generarRecurrentesAhora } from "./actions";
import { CrearRecurrentePanel } from "./crear-recurrente-panel";

export interface FilaRecurrente {
  id: string;
  descripcion: string;
  tienda: string;
  tipo: string;
  cuenta: string;
  monto: number;
  dia: number;
  desde: string;
  hasta: string | null;
  ultimo: string | null;
  proxima: string | null;
  activo: boolean;
}

const DEF: DefTabla<FilaRecurrente> = {
  clave: "libro-recurrentes",
  campos: [
    { id: "descripcion", etiqueta: "Descripción", tipo: "texto", valor: (r) => r.descripcion },
    { id: "tienda", etiqueta: "Tienda", tipo: "seleccion", valores: (r) => [r.tienda], agrupable: true },
    { id: "tipo", etiqueta: "Tipo", tipo: "seleccion", valores: (r) => [r.tipo], agrupable: true },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (r) => [r.activo ? "Activo" : "Pausado"], agrupable: true },
  ],
  cerrados: { etiqueta: "Pausados", esCerrado: (r) => !r.activo, campoEstado: "estado", valoresCerrados: ["Pausado"], ocultosPorDefecto: true, exclusivo: true },
};
const NOMBRE: NombreFilas = { singular: "recurrente", plural: "recurrentes" };
const ICONOS: Record<string, IconoComp> = { descripcion: GastoIcon, tienda: TiendaIcon, tipo: CalendarioIcon, estado: PedidoIcon };

function Interruptor({ fila }: { fila: FilaRecurrente }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      aria-label={`${fila.activo ? "Activo" : "Pausado"}: pulsar para ${fila.activo ? "pausar" : "reactivar"} «${fila.descripcion}»`}
      onClick={() =>
        iniciar(async () => {
          const r = await cambiarEstadoRecurrente(fila.id, !fila.activo);
          if (r.error) mostrarToast(r.error, "destructive");
          router.refresh();
        })
      }
      className={`rounded-md border border-border px-2 py-0.5 text-xs ${fila.activo ? "bg-card" : "bg-muted text-muted-foreground"} ${anilloFoco}`}
    >
      {fila.activo ? "Activo" : "Pausado"}
    </button>
  );
}

const COLUMNAS: ColumnaTabla<FilaRecurrente, null>[] = [
  { id: "descripcion", label: "Descripción", ocultable: false, render: (r) => r.descripcion },
  { id: "tienda", label: "Tienda", ocultable: true, render: (r) => r.tienda },
  { id: "tipo", label: "Tipo", ocultable: true, render: (r) => r.tipo },
  { id: "monto", label: "Monto", ocultable: false, clase: `text-right ${claseCifra}`, render: (r) => dinero2(r.monto), total: (filas) => dinero2(filas.filter((f) => f.activo).reduce((a, f) => a + f.monto, 0)) },
  { id: "dia", label: "Día", ocultable: true, clase: `text-right ${claseCifra}`, render: (r) => r.dia },
  { id: "vigencia", label: "Vigencia", ocultable: true, render: (r) => `${mesCorto(r.desde)} → ${r.hasta ? mesCorto(r.hasta) : "sin fin"}` },
  { id: "ultimo", label: "Último registrado", ocultable: true, render: (r) => (r.ultimo ? mesCorto(r.ultimo) : SIN_DATO) },
  { id: "proxima", label: "Próximo", ocultable: true, render: (r) => (r.proxima ? fechaCorta(r.proxima) : SIN_DATO) },
  { id: "cuenta", label: "Forma de pago", ocultable: true, oculta: true, render: (r) => r.cuenta || SIN_DATO },
];

export function TablaRecurrentes({
  filas,
  tiendas,
  tipos,
  cuentas,
  mes,
  puedeEscribir,
}: {
  filas: FilaRecurrente[];
  tiendas: { id: string; nombre: string }[];
  tipos: { id: string; nombre: string }[];
  cuentas: { id: string; nombre: string }[];
  mes: string;
  puedeEscribir: boolean;
}) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  const atrasados = filas.filter((f) => f.activo && f.proxima && f.proxima <= new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" })).length;
  return (
    <div className="flex flex-col gap-3">
      {puedeEscribir && atrasados > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
          <span>{atrasados === 1 ? "1 recurrente ya tiene" : `${atrasados} recurrentes ya tienen`} su movimiento por registrar. La tarea de cada mañana lo hace sola.</span>
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await generarRecurrentesAhora();
                if ("error" in r) mostrarToast(r.error, "destructive");
                else mostrarToast(r.texto);
                router.refresh();
              })
            }
            className={`rounded-md bg-foreground px-3 py-1 font-medium text-background disabled:opacity-40 ${anilloFoco}`}
          >
            {pendiente ? "Registrando…" : "Registrar ahora"}
          </button>
        </div>
      )}
      <TablaDatos
        def={DEF}
        filas={filas}
        columnas={COLUMNAS}
        contexto={null}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(r) => r.id}
        accionPrincipal={puedeEscribir ? <CrearRecurrentePanel tiendas={tiendas} tipos={tipos} cuentas={cuentas} mes={mes} /> : undefined}
        accion={puedeEscribir ? { etiqueta: "Estado", render: (r) => <Interruptor fila={r} /> } : undefined}
        ariaLabel="Movimientos recurrentes del libro"
        vacio="Todavía no hay recurrentes. Crea uno con «Agregar»: el libro lo registra solo cada mes."
      />
    </div>
  );
}
