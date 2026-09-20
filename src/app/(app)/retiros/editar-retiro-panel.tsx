"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { actualizarRetiro } from "./actions";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { CerrarIcon, LapizIcon } from "@/lib/nav-icons";
import { calcularComisionSugerida, type Cuenta, type Plataforma } from "./crear-retiro-panel";

const Obligatorio = () => (
  <span aria-hidden="true" className="text-destructive">
    {" "}
    *
  </span>
);

export interface RetiroExistente {
  id: string;
  numeroCorrelativo: number;
  plataformaId: string | null;
  cuentaRetiroId: string | null;
  gestionadoPor: string;
  monto: number;
  comision: number;
  fecha: string;
  fechaLimite: string | null;
  notas: string | null;
}

/** Ficha para modificar un retiro ya creado — mismo patrón visual que CrearRetiroPanel, pero
 * disparada por el ícono de lápiz en la fila (como VentanaCuentaRetiro en modo editar): sin
 * correlativo (no cambia al editar) ni desplegable de "+ Agregar". */
export function EditarRetiroPanel({
  retiro,
  plataformas,
  cuentas,
}: {
  retiro: RetiroExistente;
  plataformas: Plataforma[];
  cuentas: Cuenta[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [monto, setMonto] = useState(String(retiro.monto));
  const [comisionValor, setComisionValor] = useState(retiro.comision.toFixed(2));
  const [comisionPorcentaje, setComisionPorcentaje] = useState(
    retiro.monto > 0 ? ((retiro.comision / retiro.monto) * 100).toFixed(2) : "0"
  );
  const [comisionManual, setComisionManual] = useState(true);
  const [cuentaSeleccionadaId, setCuentaSeleccionadaId] = useState(
    retiro.cuentaRetiroId ?? cuentas[0]?.id ?? ""
  );
  const panelRef = useRef<HTMLDivElement>(null);
  const botonAbrirRef = useRef<HTMLButtonElement>(null);
  const tituloId = `titulo-editar-retiro-${retiro.id}`;

  function abrirVentana(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setError(null);
    setMonto(String(retiro.monto));
    setComisionValor(retiro.comision.toFixed(2));
    setComisionPorcentaje(retiro.monto > 0 ? ((retiro.comision / retiro.monto) * 100).toFixed(2) : "0");
    setComisionManual(true);
    setCuentaSeleccionadaId(retiro.cuentaRetiroId ?? cuentas[0]?.id ?? "");
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

  const montoNum = parseFloat(monto) || 0;
  const comisionNum = parseFloat(comisionValor) || 0;
  const montoNeto = montoNum - comisionNum;

  function alCambiarComisionValor(valor: string) {
    setComisionManual(true);
    setComisionValor(valor);
    const num = parseFloat(valor) || 0;
    setComisionPorcentaje(montoNum > 0 ? ((num / montoNum) * 100).toFixed(2) : "0");
  }

  function alCambiarComisionPorcentaje(valor: string) {
    setComisionManual(true);
    setComisionPorcentaje(valor);
    const num = parseFloat(valor) || 0;
    setComisionValor(montoNum > 0 ? ((montoNum * num) / 100).toFixed(2) : "0");
  }

  // Al cambiar de cuenta destino, sugiere su comisión configurada — igual que en Nuevo retiro.
  function alElegirCuenta(cuentaId: string) {
    setCuentaSeleccionadaId(cuentaId);
    setComisionManual(false);
    const cuenta = cuentas.find((c) => c.id === cuentaId);
    const sugerido = cuenta ? calcularComisionSugerida(cuenta, montoNum) : null;
    if (sugerido == null) return;
    setComisionValor(sugerido.toFixed(2));
    setComisionPorcentaje(montoNum > 0 ? ((sugerido / montoNum) * 100).toFixed(2) : "0");
  }

  // Si la comisión sigue siendo la sugerida (no se tocó a mano) y cambia el monto, se recalcula.
  useEffect(() => {
    if (comisionManual) return;
    const cuenta = cuentas.find((c) => c.id === cuentaSeleccionadaId);
    const sugerido = cuenta ? calcularComisionSugerida(cuenta, montoNum) : null;
    if (sugerido == null) return;
    setComisionValor(sugerido.toFixed(2));
    setComisionPorcentaje(montoNum > 0 ? ((sugerido / montoNum) * 100).toFixed(2) : "0");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montoNum]);

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await actualizarRetiro(formData);
        setAbierto(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <>
      <Tooltip texto="Modificar retiro">
        <button
          ref={botonAbrirRef}
          type="button"
          onClick={abrirVentana}
          aria-label="Modificar retiro"
          className={`relative z-10 rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
        >
          <LapizIcon className="h-4 w-4" />
        </button>
      </Tooltip>

      {abierto && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4" onClick={cerrarVentana}>
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

              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span id={tituloId} className="flex items-center gap-2 text-sm font-semibold">
                  Modificar retiro
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
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label className={labelClassSm} htmlFor={`campo-plataforma-${retiro.id}`}>
                      Plataforma
                      <Obligatorio />
                    </label>
                    <select
                      id={`campo-plataforma-${retiro.id}`}
                      name="plataforma_id"
                      required
                      defaultValue={retiro.plataformaId ?? plataformas[0]?.id}
                      className={`${fieldClassSm} w-full min-w-0`}
                    >
                      {plataformas.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label className={labelClassSm} htmlFor={`campo-cuenta-${retiro.id}`}>
                      Cuenta destino
                      <Obligatorio />
                    </label>
                    <select
                      id={`campo-cuenta-${retiro.id}`}
                      name="cuenta_retiro_id"
                      required
                      value={cuentaSeleccionadaId}
                      onChange={(e) => alElegirCuenta(e.target.value)}
                      className={`${fieldClassSm} w-full min-w-0`}
                    >
                      {cuentas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className={labelClassSm} htmlFor={`campo-gestionado-por-${retiro.id}`}>
                    Gestionado por
                    <Obligatorio />
                  </label>
                  <select
                    id={`campo-gestionado-por-${retiro.id}`}
                    name="gestionado_por"
                    required
                    defaultValue={retiro.gestionadoPor}
                    className={`${fieldClassSm} w-40`}
                  >
                    <option value="plataforma">Plataforma</option>
                    <option value="correo">Correo</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <div className="flex w-24 shrink-0 flex-col gap-1">
                    <label className={labelClassSm} htmlFor={`campo-monto-${retiro.id}`}>
                      Monto
                      <Obligatorio />
                    </label>
                    <input
                      id={`campo-monto-${retiro.id}`}
                      type="number"
                      step="0.01"
                      min="0"
                      name="monto"
                      required
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      className={`${fieldClassSm} w-full min-w-0 tabular-nums`}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label className={labelClassSm} htmlFor={`campo-fecha-${retiro.id}`}>
                      Fecha
                      <Obligatorio />
                    </label>
                    <input
                      id={`campo-fecha-${retiro.id}`}
                      type="date"
                      name="fecha"
                      defaultValue={retiro.fecha}
                      required
                      className={`${fieldClassSm} w-full min-w-0`}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label className={labelClassSm} htmlFor={`campo-fecha-limite-${retiro.id}`}>
                      Fecha límite
                    </label>
                    <input
                      id={`campo-fecha-limite-${retiro.id}`}
                      type="date"
                      name="fecha_limite"
                      defaultValue={retiro.fechaLimite ?? ""}
                      className={`${fieldClassSm} w-full min-w-0`}
                    />
                  </div>
                </div>

                <div>
                  <p className={labelClassSm} id={`etiqueta-comision-${retiro.id}`}>
                    Comisión
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <span className="text-sm text-muted-foreground">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        name="comision"
                        aria-label="Comisión en dólares"
                        aria-describedby={`etiqueta-comision-${retiro.id}`}
                        value={comisionValor}
                        onChange={(e) => alCambiarComisionValor(e.target.value)}
                        className={`${fieldClassSm} w-full min-w-0 tabular-nums`}
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label="Comisión en porcentaje"
                        aria-describedby={`etiqueta-comision-${retiro.id}`}
                        value={comisionPorcentaje}
                        onChange={(e) => alCambiarComisionPorcentaje(e.target.value)}
                        className={`${fieldClassSm} w-full min-w-0 tabular-nums`}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelClassSm} htmlFor={`campo-a-recibir-${retiro.id}`}>
                    A recibir
                  </label>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">$</span>
                    <input
                      id={`campo-a-recibir-${retiro.id}`}
                      type="number"
                      step="0.01"
                      readOnly
                      tabIndex={-1}
                      value={montoNeto.toFixed(2)}
                      className={`${fieldClassSm} w-full min-w-0 cursor-not-allowed bg-muted tabular-nums`}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClassSm} htmlFor={`campo-notas-${retiro.id}`}>
                    Nota
                  </label>
                  <input
                    id={`campo-notas-${retiro.id}`}
                    type="text"
                    name="notas"
                    defaultValue={retiro.notas ?? ""}
                    placeholder="Escribe una nota para este retiro"
                    className={`${fieldClass} mt-1 w-full text-sm`}
                  />
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
                <p className="mr-auto text-xs text-muted-foreground">
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>{" "}
                  Obligatorio
                </p>
                <Button type="button" variant="secondary" onClick={cerrarVentana} disabled={pending}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={pending}
                  className="!rounded-full !bg-[#202020] !text-white hover:!bg-[#2d2d2d]"
                >
                  {pending ? "Guardando..." : "Guardar cambios"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
