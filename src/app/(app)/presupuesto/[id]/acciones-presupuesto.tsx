"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { useToast } from "@/components/ui/toast";
import { ActualizarIcon, CerradoIcon, CheckIcon, FlechaIzquierdaIcon, PapeleraIcon } from "@/lib/nav-icons";
import type { EstadoPresupuesto, Supuestos } from "@/lib/finanzas/presupuesto";
import { cambiarEstadoPresupuesto, eliminarPresupuesto, rehacerPresupuesto } from "../actions";
import { CamposGenerar, type DatosGenerar } from "../campos-generar";

type Pendiente = "aprobado" | "cerrado" | "borrador" | "eliminar";

const CONFIRMAR: Record<Pendiente, { pregunta: string; boton: string }> = {
  aprobado: { pregunta: "¿Aprobar el presupuesto? Aprobado ya no se edita.", boton: "Aprobar" },
  cerrado: { pregunta: "¿Cerrar el presupuesto? Cerrado queda solo para consulta.", boton: "Cerrar" },
  borrador: { pregunta: "¿Volver a borrador? Se podrá editar y rehacer otra vez.", boton: "Volver a borrador" },
  eliminar: { pregunta: "¿Eliminar el presupuesto y todas sus cifras? No se puede deshacer.", boton: "Eliminar" },
};

/**
 * Los botones del presupuesto: Aprobar, Cerrar o Volver a borrador según su estado, Rehacer desde el real (solo en
 * borrador) y Eliminar (solo en borrador). Lo que cambia algo pide confirmación en la misma fila. «Descargar Excel» va
 * en la barra de contexto AF4 de la página.
 */
export function AccionesPresupuesto({
  id,
  anio,
  estado,
  porTienda,
  puedeEscribir,
  datos,
  supuestos,
}: {
  id: string;
  anio: number;
  estado: EstadoPresupuesto;
  porTienda: boolean;
  puedeEscribir: boolean;
  datos: DatosGenerar | null;
  supuestos: Supuestos | null;
}) {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();

  function confirmar() {
    if (!pendiente) return;
    const que = pendiente;
    startTransition(async () => {
      const r = que === "eliminar" ? await eliminarPresupuesto(id) : await cambiarEstadoPresupuesto(id, que);
      if (r.error) {
        mostrarToast(r.error, "destructive");
        return;
      }
      setPendiente(null);
      if (que === "eliminar") {
        mostrarToast("Presupuesto eliminado");
        router.push("/presupuesto");
      } else {
        mostrarToast(que === "aprobado" ? "Presupuesto aprobado" : que === "cerrado" ? "Presupuesto cerrado" : "Presupuesto en borrador");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {puedeEscribir && estado === "borrador" && (
          <BotonAccion icono={CheckIcon} tono="exito" onClick={() => setPendiente("aprobado")}>
            Aprobar
          </BotonAccion>
        )}
        {puedeEscribir && estado === "aprobado" && (
          <>
            <BotonAccion icono={CerradoIcon} tono="oscuro" onClick={() => setPendiente("cerrado")}>
              Cerrar
            </BotonAccion>
            <BotonAccion icono={FlechaIzquierdaIcon} onClick={() => setPendiente("borrador")}>
              Volver a borrador
            </BotonAccion>
          </>
        )}
        {puedeEscribir && estado === "borrador" && datos && (
          <FichaCrear
            titulo="Rehacer desde el real"
            etiquetaCrear="Rehacer presupuesto"
            mensajeExito="Presupuesto rehecho"
            ocultos={{ presupuesto_id: id, anio: String(anio) }}
            action={rehacerPresupuesto}
            alGuardar={() => router.refresh()}
            boton={(abrir) => (
              <BotonAccion icono={ActualizarIcon} onClick={abrir}>
                Rehacer
              </BotonAccion>
            )}
          >
            {(ayuda) => <CamposGenerar datos={{ ...datos, anio }} ayuda={ayuda} guardados={supuestos} porTiendaInicial={porTienda} conAnio={false} />}
          </FichaCrear>
        )}
        {puedeEscribir && estado === "borrador" && (
          <BotonAccion icono={PapeleraIcon} tono="peligro" onClick={() => setPendiente("eliminar")}>
            Eliminar
          </BotonAccion>
        )}
      </div>
      {pendiente && (
        <div role="alertdialog" aria-label={CONFIRMAR[pendiente].boton} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${pendiente === "eliminar" ? "bg-destructive" : "bg-warning"}`} />
          <span>{CONFIRMAR[pendiente].pregunta}</span>
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={() => setPendiente(null)} disabled={enviando} className={`rounded-md border border-border px-3 py-1 hover:bg-muted ${anilloFoco}`}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={enviando}
              aria-busy={enviando}
              className={`rounded-md px-3 py-1 font-medium ${anilloFoco} ${pendiente === "eliminar" ? "bg-destructive text-background" : "bg-foreground text-background"}`}
            >
              {enviando ? "Guardando..." : CONFIRMAR[pendiente].boton}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
