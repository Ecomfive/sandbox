"use client";

import { useState } from "react";
import { crearRetiro, reservarCorrelativo } from "./actions";
import { Button } from "@/components/ui/button";
import { fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import {
  CalendarioIcon,
  CerrarIcon,
  EtiquetaIcon,
  MasIcon,
  PersonaIcon,
  PrioridadIcon,
} from "@/lib/nav-icons";

const PRIORIDADES = [
  { valor: "baja", etiqueta: "Baja" },
  { valor: "media", etiqueta: "Media" },
  { valor: "alta", etiqueta: "Alta" },
  { valor: "urgente", etiqueta: "Urgente" },
] as const;

const hoy = () => new Date().toISOString().slice(0, 10);

interface Plataforma {
  id: string;
  nombre: string;
}
interface Cuenta {
  id: string;
  nombre: string;
}
interface Perfil {
  id: string;
  nombre: string | null;
  email: string;
}

/** Botón "+ Crear" que despliega directo el panel de creación rápida (estilo "crear tarea"),
 * en vez de navegar a una página aparte. La plataforma se elige dentro del panel. */
export function CrearRetiroPanel({
  paisId,
  plataformas,
  cuentas,
  perfiles,
}: {
  paisId: string;
  plataformas: Plataforma[];
  cuentas: Cuenta[];
  perfiles: Perfil[];
}) {
  const [abierto, setAbierto] = useState(false);
  const [etiquetas, setEtiquetas] = useState<string[]>([]);
  const [etiquetaTexto, setEtiquetaTexto] = useState("");
  const [monto, setMonto] = useState("");
  const [comisionValor, setComisionValor] = useState("0");
  const [comisionPorcentaje, setComisionPorcentaje] = useState("0");
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

  function agregarEtiqueta() {
    const valor = etiquetaTexto.trim();
    if (valor && !etiquetas.includes(valor)) setEtiquetas((prev) => [...prev, valor]);
    setEtiquetaTexto("");
  }

  const montoNum = parseFloat(monto) || 0;
  const comisionNum = parseFloat(comisionValor) || 0;
  const montoNeto = montoNum - comisionNum;

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
            <input type="hidden" name="etiquetas" value={etiquetas.join(",")} />
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
                <p className="mt-1 text-xs text-muted-foreground">
                  Se descuenta del monto — neto:{" "}
                  <span className="font-medium tabular-nums text-foreground">${montoNeto.toFixed(2)}</span>
                </p>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <div className="flex min-w-[9rem] flex-1 flex-col gap-1">
                  <label className={`${labelClassSm} inline-flex items-center gap-1`}>
                    <PersonaIcon className="h-3.5 w-3.5" /> Persona asignada
                  </label>
                  <select name="asignado_a" defaultValue="" className={`${fieldClassSm} w-full`}>
                    <option value="">Sin asignar</option>
                    {perfiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre || p.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex min-w-[9rem] flex-1 flex-col gap-1">
                  <label className={`${labelClassSm} inline-flex items-center gap-1`}>
                    <CalendarioIcon className="h-3.5 w-3.5" /> Fecha límite
                  </label>
                  <input type="date" name="fecha_limite" className={`${fieldClassSm} w-full`} />
                </div>

                <div className="flex min-w-[9rem] flex-1 flex-col gap-1">
                  <label className={`${labelClassSm} inline-flex items-center gap-1`}>
                    <PrioridadIcon className="h-3.5 w-3.5" /> Prioridad
                  </label>
                  <select name="prioridad" defaultValue="" className={`${fieldClassSm} w-full`}>
                    <option value="">Sin prioridad</option>
                    {PRIORIDADES.map((p) => (
                      <option key={p.valor} value={p.valor}>
                        {p.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex min-w-[9rem] flex-1 flex-col gap-1">
                  <label className={`${labelClassSm} inline-flex items-center gap-1`}>
                    <EtiquetaIcon className="h-3.5 w-3.5" /> Etiquetas
                  </label>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={etiquetaTexto}
                      onChange={(e) => setEtiquetaTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === ",") {
                          e.preventDefault();
                          agregarEtiqueta();
                        }
                      }}
                      placeholder="Escribe y Enter"
                      className={`${fieldClassSm} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={agregarEtiqueta}
                      disabled={!etiquetaTexto.trim()}
                      title="Agregar etiqueta"
                      className="rounded-md border border-border px-2 text-muted-foreground hover:bg-muted disabled:opacity-40"
                    >
                      <MasIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {etiquetas.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {etiquetas.map((et) => (
                        <span
                          key={et}
                          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                        >
                          {et}
                          <button
                            type="button"
                            onClick={() => setEtiquetas((prev) => prev.filter((e) => e !== et))}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <CerrarIcon className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
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
