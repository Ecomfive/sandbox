"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BotonDescargar } from "@/components/tabla/boton-descargar";
import { Button } from "@/components/ui/button";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { CerrarIcon } from "@/lib/nav-icons";
import { ESTADO_ETIQUETA } from "@/lib/retiros/estados";
import {
  ESTADOS_EN_LOTE,
  MAX_LOTE,
  mensajeResultadoLote,
  planearCambioEstado,
  textoConfirmacion,
  type EstadoEnLote,
} from "@/lib/retiros/en-lote";
import { cambiarEstadoRetirosEnLote } from "./actions";
import { DEF_RETIROS } from "./filtros";
import type { FilaRetiro } from "./tabla-retiros";

/** Los mismos colores de la columna Estado (ver EstadoSelect), para que cada botón se lea como el estado al que lleva. */
const CLASE_ESTADO: Record<EstadoEnLote, string> = {
  abierto: "bg-accent text-accent-foreground hover:bg-accent-hover",
  novedad: "bg-destructive-soft text-destructive hover:brightness-95",
  cerrado: "bg-success-soft text-success hover:brightness-95",
};

/**
 * Barra de acciones de los retiros que se marcaron en la tabla: pasar a Abierto, Novedad o Cerrado, y descargar
 * solo lo marcado. Queda fija abajo mientras la tabla está a la vista. Cambiar el estado pide confirmación en la
 * misma barra (sin ventana) y dice antes cuántos cambian y cuántos se omiten. Eliminar, cancelar y conciliar no
 * están aquí a propósito: no se deshacen o piden datos de cada retiro.
 */
export function BarraLote({
  filas,
  cerradosOcultos,
  alQuitar,
  alTerminar,
}: {
  /** Los retiros marcados que se ven en la tabla ahora. */
  filas: FilaRetiro[];
  /** Si la tabla oculta los cerrados: un retiro que pasa a Cerrado deja de verse y hay que avisarlo. */
  cerradosOcultos: boolean;
  alQuitar: () => void;
  /** Se llama cuando el cambio salió bien, para vaciar la selección. */
  alTerminar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [pendiente, iniciar] = useTransition();
  const [aConfirmar, setAConfirmar] = useState<EstadoEnLote | null>(null);
  const botonConfirmar = useRef<HTMLButtonElement>(null);
  const botonesEstado = useRef<Partial<Record<EstadoEnLote, HTMLButtonElement | null>>>({});

  const plan = aConfirmar ? planearCambioEstado(filas, aConfirmar) : null;
  const demasiadas = filas.length > MAX_LOTE;

  // Al pedir confirmación desaparece el botón que se pulsó: el foco pasa al de confirmar.
  useEffect(() => {
    if (aConfirmar) botonConfirmar.current?.focus();
  }, [aConfirmar]);

  function cancelar() {
    const estado = aConfirmar;
    setAConfirmar(null);
    if (estado) requestAnimationFrame(() => botonesEstado.current[estado]?.focus());
  }

  function confirmar() {
    if (!aConfirmar || !plan || plan.cambiar.length === 0) return;
    const nuevo = aConfirmar;
    const ids = filas.map((f) => f.id);
    iniciar(async () => {
      try {
        const resultado = await cambiarEstadoRetirosEnLote(ids, nuevo);
        const { mensaje, tono } = mensajeResultadoLote(nuevo, resultado);
        const oculto = nuevo === "cerrado" && cerradosOcultos && resultado.cambiados > 0;
        mostrarToast(oculto ? `${mensaje}. Ya no se ven porque los cerrados están ocultos.` : mensaje, tono);
        if (!resultado.error) alTerminar();
      } catch {
        mostrarToast("No se pudo cambiar el estado. Revisa tu conexión e inténtalo de nuevo.", "destructive");
      }
      setAConfirmar(null);
    });
  }

  const cantidad = `${filas.length} ${filas.length === 1 ? "seleccionado" : "seleccionados"}`;

  return (
    <div
      role="region"
      aria-label="Acciones sobre los retiros seleccionados"
      onKeyDown={(e) => {
        if (e.key === "Escape" && aConfirmar && !pendiente) {
          e.stopPropagation();
          cancelar();
        }
      }}
      className="sticky bottom-4 z-30 mx-auto my-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-border-control bg-card px-3 py-2 text-sm shadow-lg"
    >
      <p role="status" className="font-medium tabular-nums">
        {cantidad}
      </p>

      {aConfirmar && plan ? (
        <>
          <div className="flex max-w-sm flex-col gap-0.5">
            <p>{textoConfirmacion(aConfirmar, filas.length, plan)}</p>
            {aConfirmar === "cerrado" && plan.cambiar.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Solo cambia el estado: no registra monto recibido ni comprobante (para eso, Conciliar).
              </p>
            )}
          </div>
          {plan.cambiar.length > 0 && (
            <Button
              ref={botonConfirmar}
              type="button"
              onClick={confirmar}
              disabled={pendiente}
              className="min-h-8 px-3 py-1 text-xs"
            >
              {pendiente ? "Cambiando…" : `Cambiar ${plan.cambiar.length}`}
            </Button>
          )}
          <Button
            ref={plan.cambiar.length === 0 ? botonConfirmar : undefined}
            type="button"
            variant="ghost"
            onClick={cancelar}
            disabled={pendiente}
            className="min-h-8 text-xs"
          >
            {plan.cambiar.length === 0 ? "Entendido" : "Cancelar"}
          </Button>
        </>
      ) : (
        <>
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground">Pasar a</span>
            {ESTADOS_EN_LOTE.map((estado) => (
              <button
                key={estado}
                ref={(el) => {
                  botonesEstado.current[estado] = el;
                }}
                type="button"
                onClick={() => setAConfirmar(estado)}
                disabled={demasiadas}
                aria-label={`Pasar ${filas.length} ${filas.length === 1 ? "retiro" : "retiros"} a ${ESTADO_ETIQUETA[estado]}`}
                className={`min-h-8 !rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${CLASE_ESTADO[estado]} ${anilloFoco}`}
              >
                {ESTADO_ETIQUETA[estado]}
              </button>
            ))}
          </span>
          {demasiadas && (
            <p className="text-xs text-muted-foreground">
              Máximo {MAX_LOTE} por vez: quita {filas.length - MAX_LOTE} para cambiar el estado.
            </p>
          )}
          <BotonDescargar def={DEF_RETIROS} filas={filas} nombreFilas="retiros" ayuda="Descargar seleccionados" />
        </>
      )}

      <Tooltip texto="Quitar selección">
        <button
          type="button"
          onClick={alQuitar}
          disabled={pendiente}
          aria-label="Quitar la selección"
          className={`flex min-h-8 min-w-8 items-center justify-center !rounded-md text-muted-foreground hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
        >
          <CerrarIcon className="h-4 w-4" />
        </button>
      </Tooltip>
    </div>
  );
}
