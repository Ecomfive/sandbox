"use client";

import { useState } from "react";
import { crearRetiro, reservarCorrelativo } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { formatearFechaNumerica } from "@/lib/formato";
import { CalendarioIcon, CerrarIcon, MasIcon } from "@/lib/nav-icons";

const hoy = () => new Date().toISOString().slice(0, 10);

interface Plataforma {
  id: string;
  nombre: string;
}
interface Cuenta {
  id: string;
  nombre: string;
}

/** Botón "+ Crear" que despliega directo el panel de creación rápida (estilo "crear tarea"),
 * en vez de navegar a una página aparte. La plataforma se elige dentro del panel.
 * La persona asignada no se pide: la pone el sistema con quien crea el retiro. */
export function CrearRetiroPanel({
  paisId,
  plataformas,
  cuentas,
}: {
  paisId: string;
  plataformas: Plataforma[];
  cuentas: Cuenta[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const [comisionValor, setComisionValor] = useState("0");
  const [comisionPorcentaje, setComisionPorcentaje] = useState("0");
  const [aRecibir, setARecibir] = useState("");
  const [aRecibirManual, setARecibirManual] = useState(false);
  const [fechaLimite, setFechaLimite] = useState("");
  const [limiteAbierto, setLimiteAbierto] = useState(false);
  const [correlativo, setCorrelativo] = useState<number | null>(null);
  const [reservando, setReservando] = useState(false);

  // El correlativo se aparta al abrir la ventana; si se cierra sin guardar y se vuelve a abrir, se reutiliza.
  async function abrirVentana() {
    setAbierto(true);
    if (correlativo !== null || reservando) return;
    setReservando(true);
    setCorrelativo(await reservarCorrelativo());
    setReservando(false);
  }

  const montoNum = parseFloat(monto) || 0;
  const comisionNum = parseFloat(comisionValor) || 0;
  const montoNeto = montoNum - comisionNum;
  // Por defecto "A recibir" sigue a monto − comisión; al escribirlo a mano deja de seguirlo.
  const aRecibirMostrado = aRecibirManual ? aRecibir : montoNum > 0 || comisionNum > 0 ? montoNeto.toFixed(2) : "";

  function alCambiarComisionValor(valor: string) {
    setComisionValor(valor);
    const num = parseFloat(valor) || 0;
    setComisionPorcentaje(montoNum > 0 ? ((num / montoNum) * 100).toFixed(2) : "0");
  }

  function alCambiarComisionPorcentaje(valor: string) {
    setComisionPorcentaje(valor);
    const num = parseFloat(valor) || 0;
    setComisionValor(montoNum > 0 ? ((montoNum * num) / 100).toFixed(2) : "0");
  }

  return (
    <>
      <Button type="button" onClick={abrirVentana} className="!rounded-full">
        <MasIcon className="mr-1 h-4 w-4" />
        Crear
      </Button>

      {abierto && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAbierto(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-border bg-card shadow-xl"
          >
            <form
              action={crearRetiro}
              onSubmit={() => {
                setAbierto(false);
                setCorrelativo(null);
              }}
            >
              <input type="hidden" name="pais_id" value={paisId} />
              <input type="hidden" name="fecha_limite" value={fechaLimite} />
              {correlativo !== null && <input type="hidden" name="numero_correlativo" value={correlativo} />}

              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  Nuevo retiro
                  <span
                    title="Escríbelo en el concepto del retiro en Dropi"
                    className="rounded bg-muted px-2 py-0.5 text-xs font-medium tabular-nums"
                  >
                    {correlativo !== null
                      ? `#${String(correlativo).padStart(4, "0")}`
                      : reservando
                        ? "Asignando..."
                        : "Se asigna al guardar"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <CerrarIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-3 p-4">
                {correlativo !== null && (
                  <p className="text-xs text-muted-foreground">
                    Escribe este correlativo en el concepto del retiro en Dropi para que se concilie.
                  </p>
                )}
                <div className="flex gap-2">
                  <select
                    name="plataforma_id"
                    required
                    defaultValue={plataformas[0]?.id}
                    className={`${fieldClassSm} min-w-0 flex-1`}
                  >
                    {plataformas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                  {cuentas.length > 0 ? (
                    <select name="cuenta_retiro_id" required className={`${fieldClassSm} min-w-0 flex-1`}>
                      {cuentas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="flex-1 self-center text-xs text-destructive">Sin cuentas activas</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label className={labelClassSm}>Monto</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      name="monto"
                      required
                      autoFocus
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      className={`${fieldClassSm} w-full min-w-0 tabular-nums`}
                    />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label className={labelClassSm}>Fecha</label>
                    <input
                      type="date"
                      name="fecha"
                      defaultValue={hoy()}
                      required
                      className={`${fieldClassSm} w-full min-w-0`}
                    />
                  </div>
                </div>

                <div>
                  <label className={labelClassSm}>Comisión</label>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex min-w-0 flex-1 items-center gap-1">
                      <span className="text-sm text-muted-foreground">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        name="comision"
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
                        value={comisionPorcentaje}
                        onChange={(e) => alCambiarComisionPorcentaje(e.target.value)}
                        className={`${fieldClassSm} w-full min-w-0 tabular-nums`}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelClassSm}>A recibir</label>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      name="a_recibir"
                      required
                      value={aRecibirMostrado}
                      onChange={(e) => {
                        setARecibir(e.target.value);
                        setARecibirManual(true);
                      }}
                      className={`${fieldClassSm} w-full min-w-0 tabular-nums`}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Monto que debe llegar. Por defecto es el monto menos la comisión (
                    <span className="tabular-nums">${montoNeto.toFixed(2)}</span>); puedes cambiarlo.
                    {aRecibirManual && (
                      <>
                        {" "}
                        <button
                          type="button"
                          onClick={() => setARecibirManual(false)}
                          className="underline hover:text-foreground"
                        >
                          Volver al cálculo
                        </button>
                      </>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <button
                    type="button"
                    onClick={() => setLimiteAbierto((v) => !v)}
                    aria-expanded={limiteAbierto}
                    aria-label="Fecha límite (opcional)"
                    title="Fecha límite (opcional)"
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-muted ${
                      fechaLimite ? "border-foreground text-foreground" : "border-border text-muted-foreground"
                    }`}
                  >
                    <CalendarioIcon className="h-4 w-4" />
                    {fechaLimite && <span className="tabular-nums">{formatearFechaNumerica(fechaLimite)}</span>}
                  </button>
                  {limiteAbierto && (
                    <>
                      <input
                        type="date"
                        value={fechaLimite}
                        onChange={(e) => setFechaLimite(e.target.value)}
                        aria-label="Fecha límite"
                        className={fieldClassSm}
                      />
                      {fechaLimite && (
                        <button
                          type="button"
                          onClick={() => {
                            setFechaLimite("");
                            setLimiteAbierto(false);
                          }}
                          className="text-xs text-muted-foreground underline hover:text-foreground"
                        >
                          Quitar
                        </button>
                      )}
                    </>
                  )}
                </div>

                <input
                  type="text"
                  name="notas"
                  placeholder="Escribe una nota para este retiro"
                  className={`${fieldClass} text-sm`}
                />
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
                <Button type="button" variant="secondary" onClick={() => setAbierto(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={cuentas.length === 0}>
                  Crear retiro
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
