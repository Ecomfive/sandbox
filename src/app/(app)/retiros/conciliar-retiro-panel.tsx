"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { conciliarRetiro } from "./actions";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { CerrarIcon, ConciliarIcon } from "@/lib/nav-icons";

export interface RetiroParaConciliar {
  id: string;
  numeroCorrelativo: number;
  plataformaNombre: string | null;
  destino: string;
  gestionadoPor: string;
  monto: number;
  fecha: string;
  fechaLimite: string | null;
  comision: number;
  aRecibir: number;
  notas: string | null;
  soporteNumero: string | null;
  montoRecibido: number | null;
}

const GESTIONADO_ETIQUETA: Record<string, string> = {
  plataforma: "Plataforma",
  correo: "Correo",
};

const campoBloqueado = `${fieldClassSm} w-full min-w-0 cursor-not-allowed bg-muted`;

/** Ventana de conciliación: misma forma que la ficha de retiro, pero toda la información ya
 * cargada queda bloqueada (no se puede tocar) — solo se completa la sección de abajo
 * (referencia, soporte y monto recibido). A diferencia del formulario de cierre de la ficha del
 * retiro, acá NO deja guardar si el monto recibido se aleja del esperado más de lo tolerado. */
export function ConciliarRetiroPanel({
  retiro,
  paisId,
  variante = "icono",
}: {
  retiro: RetiroParaConciliar;
  paisId: string;
  /** "boton": botón grande con texto, para la fila de acciones de la ficha del retiro. Por
   * defecto es solo el ícono, para la fila de la tabla. */
  variante?: "icono" | "boton";
}) {
  const [abierto, setAbierto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const botonAbrirRef = useRef<HTMLButtonElement>(null);
  const tituloId = `titulo-conciliar-retiro-${retiro.id}`;

  function abrirVentana(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setAbierto(true);
  }

  function cerrarVentana() {
    if (pending) return;
    setAbierto(false);
    botonAbrirRef.current?.focus();
  }

  // Escape cierra el panel, y Tab queda atrapado dentro de él mientras está abierto.
  useEffect(() => {
    if (!abierto) return;
    function alPresionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") {
        cerrarVentana();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const enfocables = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (enfocables.length === 0) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }
    document.addEventListener("keydown", alPresionarTecla);
    return () => document.removeEventListener("keydown", alPresionarTecla);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto]);

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      const resultado = await conciliarRetiro(formData);
      if (resultado?.error) setError(resultado.error);
      else setAbierto(false);
    });
  }

  return (
    <>
      {variante === "boton" ? (
        <button
          ref={botonAbrirRef}
          type="button"
          onClick={abrirVentana}
          className={`inline-flex items-center gap-1.5 rounded-md bg-[#202020] px-3 py-2 text-sm font-medium text-white hover:bg-[#2d2d2d] ${anilloFoco}`}
        >
          <ConciliarIcon className="h-4 w-4" />
          Conciliar
        </button>
      ) : (
        <Tooltip texto="Conciliar retiro">
          <button
            ref={botonAbrirRef}
            type="button"
            onClick={abrirVentana}
            aria-label="Conciliar retiro"
            className={`relative z-10 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
          >
            <ConciliarIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      )}

      {abierto &&
        createPortal(
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={cerrarVentana}>
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={tituloId}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
          >
            <form onSubmit={alEnviar} aria-busy={pending}>
              <input type="hidden" name="id" value={retiro.id} />
              <input type="hidden" name="pais_id" value={paisId} />

              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span id={tituloId} className="flex items-center gap-2 text-sm font-semibold">
                  Retiro
                  <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">
                    #{String(retiro.numeroCorrelativo).padStart(4, "0")}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={cerrarVentana}
                  disabled={pending}
                  aria-label="Cerrar"
                  className={`p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40 ${anilloFoco}`}
                >
                  <CerrarIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-3 p-4">
                <div className="flex gap-2">
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={labelClassSm}>Plataforma</span>
                    <input type="text" disabled value={retiro.plataformaNombre ?? "—"} className={campoBloqueado} />
                  </label>
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={labelClassSm}>Cuenta destino</span>
                    <input type="text" disabled value={retiro.destino} className={campoBloqueado} />
                  </label>
                </div>

                <label className="flex flex-col gap-1">
                  <span className={labelClassSm}>Gestionado por</span>
                  <input
                    type="text"
                    disabled
                    value={GESTIONADO_ETIQUETA[retiro.gestionadoPor] ?? retiro.gestionadoPor}
                    className={`${campoBloqueado} w-40`}
                  />
                </label>

                <div className="flex gap-2">
                  <label className="flex w-28 shrink-0 flex-col gap-1">
                    <span className={labelClassSm}>Monto</span>
                    <input
                      type="text"
                      disabled
                      value={retiro.monto.toFixed(2)}
                      className={`${campoBloqueado} tabular-nums`}
                    />
                  </label>
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={labelClassSm}>Fecha</span>
                    <input type="text" disabled value={retiro.fecha} className={campoBloqueado} />
                  </label>
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={labelClassSm}>Fecha límite</span>
                    <input type="text" disabled value={retiro.fechaLimite ?? "—"} className={campoBloqueado} />
                  </label>
                </div>

                <div className="flex gap-2">
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={labelClassSm}>Comisión</span>
                    <input
                      type="text"
                      disabled
                      value={`$${retiro.comision.toFixed(2)}`}
                      className={`${campoBloqueado} tabular-nums`}
                    />
                  </label>
                  <label className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className={labelClassSm}>A recibir</span>
                    <input
                      type="text"
                      disabled
                      value={`$${retiro.aRecibir.toFixed(2)}`}
                      className={`${campoBloqueado} tabular-nums`}
                    />
                  </label>
                </div>

                {retiro.notas && (
                  <label>
                    <span className={labelClassSm}>Nota</span>
                    <input
                      type="text"
                      disabled
                      value={retiro.notas}
                      className={`${fieldClass} mt-1 w-full cursor-not-allowed bg-muted text-sm`}
                    />
                  </label>
                )}

                <div className="mt-2 flex flex-col gap-3 border-t border-border pt-3">
                  <p className="text-sm font-semibold">Conciliar retiro</p>

                  <div className="flex flex-col gap-1">
                    <label className={labelClassSm} htmlFor={`campo-referencia-${retiro.id}`}>
                      ID / Referencia
                    </label>
                    <input
                      id={`campo-referencia-${retiro.id}`}
                      type="text"
                      name="soporte_numero"
                      defaultValue={retiro.soporteNumero ?? ""}
                      placeholder="Número de referencia de la transferencia"
                      className={fieldClassSm}
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className={labelClassSm} htmlFor={`campo-soporte-${retiro.id}`}>
                      Soporte
                    </label>
                    <input
                      id={`campo-soporte-${retiro.id}`}
                      type="file"
                      name="comprobante"
                      accept="image/*,application/pdf"
                      className="text-sm"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className={labelClassSm} htmlFor={`campo-recibido-${retiro.id}`}>
                      Recibido
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">$</span>
                      <input
                        id={`campo-recibido-${retiro.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        name="monto_recibido"
                        required
                        defaultValue={retiro.montoRecibido ?? ""}
                        className={`${fieldClassSm} w-full min-w-0 tabular-nums`}
                      />
                    </div>
                  </div>
                </div>

                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
                <Button type="button" variant="secondary" onClick={cerrarVentana} disabled={pending}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={pending}
                  className="!rounded-full !bg-[#202020] !text-white hover:!bg-[#2d2d2d]"
                >
                  {pending ? "Conciliando..." : "Conciliar"}
                </Button>
              </div>
            </form>
          </div>
        </div>
        , document.body)}
    </>
  );
}
