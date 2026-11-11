"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import { ActualizarIcon, CalendarioIcon, ConciliarIcon, EstadoIcon, ExtractoIcon, GastoIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import type { FilaLinea } from "@/lib/conciliacion/cargar";
import { buscarCoincidencias } from "./actions";
import { BarraLote } from "./barra-lote";
import { DEF_LINEAS } from "./def-lineas";
import { FichaLinea } from "./ficha-linea";

const NOMBRE: NombreFilas = { singular: "línea", plural: "líneas" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  clase: ExtractoIcon,
  fuente: ConciliarIcon,
  excel: EstadoIcon,
  descripcion: ExtractoIcon,
  referencia: ExtractoIcon,
  propuesta: ConciliarIcon,
  monto: GastoIcon,
  puntaje: ConciliarIcon,
  fecha: CalendarioIcon,
};

const usd = (v: number) => dinero(v, "USD", { decimales: 2 });

const PUNTO: Record<FilaLinea["estadoClave"], string> = {
  conciliada: "bg-success",
  sugerida: "bg-accent-foreground",
  pendiente: "bg-warning",
  ignorada: "bg-muted-foreground",
};

const COLUMNAS: ColumnaTabla<FilaLinea, null>[] = [
  { id: "fecha", label: "Fecha", ocultable: false, clase: "whitespace-nowrap", render: (l) => fechaCorta(l.fecha) },
  { id: "descripcion", label: "Descripción", ocultable: false, clase: "max-w-md truncate", render: (l) => l.descripcion || "—" },
  { id: "referencia", label: "Referencia", ocultable: true, clase: "text-muted-foreground whitespace-nowrap", render: (l) => l.referencia || "—" },
  { id: "clase", label: "Qué es", ocultable: true, clase: "whitespace-nowrap", render: (l) => l.clase },
  { id: "monto", label: "Monto", ocultable: false, clase: "text-right tabular-nums whitespace-nowrap", render: (l) => usd(l.monto) },
  {
    id: "estado",
    label: "Estado",
    ocultable: false,
    render: (l) => (
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${PUNTO[l.estadoClave]}`} />
        {l.estado}
      </span>
    ),
  },
  {
    id: "propuesta",
    label: "Propuesta",
    ocultable: true,
    clase: "max-w-xs truncate",
    render: (l) =>
      l.propuesta === "—" ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span>
          {l.propuesta}
          {l.puntaje !== null && <span className="text-muted-foreground"> · {l.puntaje}</span>}
        </span>
      ),
  },
  {
    id: "fuente",
    label: "Fuente",
    ocultable: true,
    clase: "whitespace-nowrap",
    render: (l) => (l.fuente === "—" ? <span className="text-muted-foreground">—</span> : l.fuente),
  },
  { id: "excel", label: "En el Excel", ocultable: true, oculta: true, clase: "text-muted-foreground whitespace-nowrap", render: (l) => l.excel },
];

/** «Buscar coincidencias» de la barra: vuelve a proponer para lo que falta conciliar de la cuenta y el mes. */
function BotonBuscar({ cuentaId, mes }: { cuentaId: string; mes: string }) {
  const router = useRouter();
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        iniciar(async () => {
          const r = await buscarCoincidencias(cuentaId, mes).catch(() => ({ error: "No se pudo buscar coincidencias." }));
          if ("error" in r) mostrarToast(r.error, "destructive");
          else {
            mostrarToast(`${r.auto} conciliadas solas · ${r.sugeridas} sugeridas · ${r.pendientes} sin coincidencia`);
            router.refresh();
          }
        })
      }
      className={`inline-flex min-h-8 items-center gap-1.5 !rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}
    >
      <ActualizarIcon className={`h-4 w-4 ${pendiente ? "animate-spin motion-reduce:animate-none" : ""}`} />
      {pendiente ? "Buscando…" : "Buscar coincidencias"}
    </button>
  );
}

/**
 * Las líneas del banco de una cuenta en un mes, con la barra de herramientas común. Toda la fila abre su ficha; con
 * permiso de escritura, las casillas abren la barra para confirmar sugerencias, crear en el libro o ignorar en lote.
 */
export function TablaLineas({
  filas,
  cuentaId,
  mes,
  puedeEscribir,
  puedeCrear,
}: {
  filas: FilaLinea[];
  cuentaId: string;
  mes: string;
  puedeEscribir: boolean;
  puedeCrear: boolean;
}) {
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(null);
  return (
    <>
      <TablaDatos
        def={DEF_LINEAS}
        filas={filas}
        columnas={COLUMNAS}
        contexto={null}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(l) => l.id}
        formatearTotal={usd}
        accionPrincipal={puedeEscribir ? <BotonBuscar cuentaId={cuentaId} mes={mes} /> : undefined}
        abrirFila={{
          etiqueta: (l) => `Abrir la línea «${l.descripcion.slice(0, 40)}» de ${usd(l.monto)}`,
          alAbrir: (l, orden) => setAbierta({ id: l.id, orden }),
        }}
        seleccion={
          puedeEscribir
            ? {
                etiqueta: (l) => `Seleccionar «${l.descripcion.slice(0, 40)}» de ${usd(l.monto)}`,
                barra: (marcadas, quitar) => <BarraLote marcadas={marcadas} quitar={quitar} puedeCrear={puedeCrear} />,
              }
            : undefined
        }
        ariaLabel="Líneas del banco"
        vacio="No hay líneas del banco en este mes."
      />
      <FichaLinea
        linea={abierta ? filas.find((f) => f.id === abierta.id) : undefined}
        orden={abierta?.orden ?? []}
        irA={(id) => setAbierta((a) => (a ? { ...a, id } : a))}
        puedeEscribir={puedeEscribir}
        puedeCrear={puedeCrear}
        alCerrar={() => setAbierta(null)}
      />
    </>
  );
}
