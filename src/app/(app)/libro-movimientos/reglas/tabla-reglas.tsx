"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { claseCifra } from "@/components/af4/estilos-af4";
import { anilloFoco } from "@/components/ui/field";
import { entero } from "@/lib/af4/formato";
import { useToast } from "@/components/ui/toast";
import { ExtractoIcon, GastoIcon, PedidoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import type { NombreFilas } from "@/lib/tabla/pie";
import type { Opcion } from "@/lib/finanzas/cargar-pendientes";
import { aplicarReglasPendientes, cambiarEstadoRegla } from "../clasificar-actions";
import { CrearReglaPanel } from "./crear-regla-panel";

export interface FilaRegla {
  id: string;
  patron: string;
  tienda: string;
  tipo: string;
  activo: boolean;
  pendientes: number;
  completados: number;
}

const DEF: DefTabla<FilaRegla> = {
  clave: "libro-reglas",
  campos: [
    { id: "patron", etiqueta: "Texto", tipo: "texto", valor: (r) => r.patron },
    { id: "tienda", etiqueta: "Tienda", tipo: "seleccion", valores: (r) => [r.tienda], agrupable: true },
    { id: "tipo", etiqueta: "Tipo", tipo: "seleccion", valores: (r) => [r.tipo], agrupable: true },
    { id: "estado", etiqueta: "Estado", tipo: "seleccion", valores: (r) => [r.activo ? "Activa" : "Inactiva"], agrupable: true },
  ],
  cerrados: { etiqueta: "Inactivas", esCerrado: (r) => !r.activo, campoEstado: "estado", valoresCerrados: ["Inactiva"], ocultosPorDefecto: true, exclusivo: true },
};
const NOMBRE: NombreFilas = { singular: "regla", plural: "reglas" };
const ICONOS: Record<string, IconoComp> = { patron: ExtractoIcon, tienda: TiendaIcon, tipo: GastoIcon, estado: PedidoIcon };

function Interruptor({ regla }: { regla: FilaRegla }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      aria-label={`${regla.activo ? "Activa" : "Inactiva"}: pulsar para ${regla.activo ? "desactivar" : "activar"} la regla «${regla.patron}»`}
      onClick={() =>
        iniciar(async () => {
          const r = await cambiarEstadoRegla(regla.id, !regla.activo);
          if (r.error) mostrarToast(r.error, "destructive");
          router.refresh();
        })
      }
      className={`rounded-md border border-border px-2 py-0.5 text-xs ${regla.activo ? "bg-card" : "bg-muted text-muted-foreground"} ${anilloFoco}`}
    >
      {regla.activo ? "Activa" : "Inactiva"}
    </button>
  );
}

const COLUMNAS: ColumnaTabla<FilaRegla, null>[] = [
  { id: "patron", label: "Cuando la descripción contiene", ocultable: false, render: (r) => <span className="font-mono text-xs">{r.patron}</span> },
  { id: "tienda", label: "Tienda", ocultable: true, render: (r) => r.tienda },
  { id: "tipo", label: "Tipo", ocultable: true, render: (r) => r.tipo },
  { id: "pendientes", label: "Pendientes que completa", ocultable: true, clase: `text-right ${claseCifra}`, render: (r) => entero(r.pendientes) },
  { id: "completados", label: "Ya completados", ocultable: true, clase: `text-right text-muted-foreground ${claseCifra}`, render: (r) => entero(r.completados) },
];

export function TablaReglas({ filas, tiendas, tipos, puedeEscribir }: { filas: FilaRegla[]; tiendas: Opcion[]; tipos: Opcion[]; puedeEscribir: boolean }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  const porAplicar = filas.reduce((a, r) => a + (r.activo ? r.pendientes : 0), 0);
  return (
    <div className="flex flex-col gap-3">
      {puedeEscribir && porAplicar > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card px-3 py-2 text-sm">
          <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
          <span>{entero(porAplicar)} pendientes se pueden completar con las reglas activas.</span>
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              iniciar(async () => {
                const r = await aplicarReglasPendientes();
                if ("error" in r) mostrarToast(r.error, "destructive");
                else mostrarToast(`${entero(r.completados)} movimientos completados`);
                router.refresh();
              })
            }
            className={`rounded-md bg-foreground px-3 py-1 font-medium text-background disabled:opacity-40 ${anilloFoco}`}
          >
            {pendiente ? "Aplicando…" : "Aplicar reglas"}
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
        accionPrincipal={puedeEscribir ? <CrearReglaPanel tiendas={tiendas} tipos={tipos} /> : undefined}
        accion={puedeEscribir ? { etiqueta: "Estado", render: (r) => <Interruptor regla={r} /> } : undefined}
        ariaLabel="Reglas del libro"
        vacio="Todavía no hay reglas. Crea una con «Agregar»."
      />
    </div>
  );
}
