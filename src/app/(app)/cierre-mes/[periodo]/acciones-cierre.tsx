"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { ActualizarIcon, CerradoIcon, EstadoIcon, FlechaIzquierdaIcon } from "@/lib/nav-icons";
import type { EstadoCierre } from "@/lib/finanzas/cierre";
import { cambiarEstadoCierre, reabrirMes } from "../actions";

type Pendiente = "en_revision" | "abierto" | "cerrado" | "reabrir";

const CONFIRMAR: Record<Pendiente, { pregunta: string; boton: string; exito: string }> = {
  en_revision: { pregunta: "¿Enviar el mes a revisión? Lo aprueba otra persona.", boton: "Enviar a revisión", exito: "Mes enviado a revisión" },
  abierto: { pregunta: "¿Volver el mes a abierto?", boton: "Volver a abierto", exito: "Mes abierto otra vez" },
  cerrado: { pregunta: "¿Aprobar y cerrar el mes? Sus movimientos ya no se podrán cambiar.", boton: "Aprobar y cerrar", exito: "Mes aprobado y cerrado" },
  reabrir: { pregunta: "¿Reabrir el mes? Sus movimientos se podrán cambiar otra vez.", boton: "Reabrir", exito: "Mes reabierto" },
};

/**
 * Los botones del cierre según su estado: «Enviar a revisión» (abierto), «Cerrar mes» y «Volver a abierto» (en
 * revisión) y «Reabrir» (cerrado, solo quien puede modificar Usuarios y roles, con motivo). Cada uno confirma en la
 * misma fila. «Cerrar mes» se ve apagado mientras el checklist no lo permite, con el motivo al lado.
 */
export function AccionesCierre({
  periodo,
  estado,
  puedeEscribir,
  puedeReabrir,
  terminado,
  bloqueoCierre,
}: {
  periodo: string;
  estado: EstadoCierre;
  puedeEscribir: boolean;
  puedeReabrir: boolean;
  /** El mes ya terminó (no se cierra el mes en curso). */
  terminado: boolean;
  /** Por qué no se puede cerrar todavía (null si se puede). */
  bloqueoCierre: string | null;
}) {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [enviando, startTransition] = useTransition();
  const router = useRouter();
  const { mostrarToast } = useToast();

  function pedir(p: Pendiente) {
    setError(null);
    setMotivo("");
    setPendiente(p);
  }

  function confirmar() {
    if (!pendiente) return;
    const que = pendiente;
    startTransition(async () => {
      const r = que === "reabrir" ? await reabrirMes(periodo, motivo) : await cambiarEstadoCierre(periodo, que);
      if (r.error) {
        setError(r.error);
        return;
      }
      setPendiente(null);
      mostrarToast(CONFIRMAR[que].exito);
      router.refresh();
    });
  }

  const hayBotones = (puedeEscribir && terminado && estado !== "cerrado") || (estado === "cerrado" && puedeReabrir);
  if (!hayBotones) return null;
  const faltaMotivo = pendiente === "reabrir" && motivo.trim().length < 5;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {puedeEscribir && terminado && estado === "abierto" && (
          <BotonAccion icono={EstadoIcon} tono="oscuro" onClick={() => pedir("en_revision")}>
            Enviar a revisión
          </BotonAccion>
        )}
        {puedeEscribir && terminado && estado === "en_revision" && (
          <>
            <BotonAccion icono={CerradoIcon} tono="exito" disabled={Boolean(bloqueoCierre)} aria-describedby={bloqueoCierre ? "motivo-bloqueo" : undefined} onClick={() => pedir("cerrado")}>
              Aprobar y cerrar
            </BotonAccion>
            <BotonAccion icono={FlechaIzquierdaIcon} onClick={() => pedir("abierto")}>
              Volver a abierto
            </BotonAccion>
          </>
        )}
        {estado === "cerrado" && puedeReabrir && (
          <BotonAccion icono={ActualizarIcon} tono="alerta" onClick={() => pedir("reabrir")}>
            Reabrir
          </BotonAccion>
        )}
      </div>
      {estado === "en_revision" && bloqueoCierre && (
        <p id="motivo-bloqueo" className="flex max-w-md items-start gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
          {bloqueoCierre}
        </p>
      )}
      {pendiente && (
        <div role="alertdialog" aria-label={CONFIRMAR[pendiente].boton} className="flex max-w-xl flex-col gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
          <p className="flex items-center gap-2">
            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${pendiente === "reabrir" ? "bg-destructive" : "bg-warning"}`} />
            {CONFIRMAR[pendiente].pregunta}
          </p>
          {pendiente === "reabrir" && (
            <label className="flex flex-col gap-1">
              <span className={labelClass}>Motivo *</span>
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={500}
                rows={2}
                required
                data-enfocar
                placeholder="Ej: corregir una factura de proveedor cargada al mes equivocado"
                className={fieldClass}
              />
            </label>
          )}
          {error && (
            <p role="alert" className="flex items-start gap-1.5 text-destructive">
              <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
              {error}
            </p>
          )}
          <span className="flex justify-end gap-2">
            <button type="button" onClick={() => setPendiente(null)} disabled={enviando} className={`rounded-md border border-border px-3 py-1 hover:bg-muted ${anilloFoco}`}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={enviando || faltaMotivo}
              aria-busy={enviando}
              className={`rounded-md bg-foreground px-3 py-1 font-medium text-background disabled:opacity-50 ${anilloFoco}`}
            >
              {enviando ? "Guardando..." : CONFIRMAR[pendiente].boton}
            </button>
          </span>
        </div>
      )}
    </div>
  );
}
