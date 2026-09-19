"use client";

import { useEffect, useRef, useState } from "react";
import { crearRetiro, verSiguienteCorrelativo } from "./actions";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { formatearFechaNumerica } from "@/lib/formato";
import { CalendarioIcon, CerrarIcon, MasIcon } from "@/lib/nav-icons";

const hoy = () => new Date().toISOString().slice(0, 10);

const Obligatorio = () => (
  <span aria-hidden="true" className="text-destructive">
    {" "}
    *
  </span>
);

interface Plataforma {
  id: string;
  nombre: string;
}
interface Cuenta {
  id: string;
  nombre: string;
  comision_tipo: "porcentaje" | "monto_fijo" | null;
  comision_valor: number | null;
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
  const [comisionManual, setComisionManual] = useState(false);
  const [cuentaSeleccionadaId, setCuentaSeleccionadaId] = useState("");
  const [aRecibir, setARecibir] = useState("");
  const [aRecibirManual, setARecibirManual] = useState(false);
  const [fechaLimite, setFechaLimite] = useState("");
  const [limiteAbierto, setLimiteAbierto] = useState(false);
  const [correlativo, setCorrelativo] = useState<number | null>(null);
  const [consultando, setConsultando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const botonAbrirRef = useRef<HTMLButtonElement>(null);

  // Al abrir se MUESTRA el siguiente correlativo, sin gastarlo: solo se asigna al crear el retiro.
  // Se consulta en cada apertura (otra persona pudo crear uno mientras tanto) y, si no se guardó
  // nada, siempre sale el mismo número.
  async function abrirVentana() {
    setEnviando(false);
    setAbierto(true);
    setCorrelativo(null);
    setConsultando(true);
    // El <select> de cuenta arranca en la primera opción del navegador: se sincroniza acá
    // para que la comisión sugerida de esa cuenta ya aparezca sin tener que tocar el campo.
    if (cuentas.length > 0) alElegirCuenta(cuentas[0].id);
    setCorrelativo(await verSiguienteCorrelativo().catch(() => null));
    setConsultando(false);
  }

  // Mientras se guarda no se cierra: la ventana queda abierta con el botón en "Creando..." hasta pasar a la ficha.
  function cerrarVentana() {
    if (enviando) return;
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
  // Por defecto "A recibir" sigue a monto − comisión; al escribirlo a mano deja de seguirlo.
  const aRecibirMostrado = aRecibirManual ? aRecibir : montoNum > 0 || comisionNum > 0 ? montoNeto.toFixed(2) : "";

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

  // Al elegir cuenta destino, sugiere la comisión configurada ahí (si tiene) — solo una
  // sugerencia: se puede seguir editando a mano, y no vuelve a aplicarse hasta cambiar de
  // cuenta otra vez. Cambiar la comisión de la cuenta después no afecta retiros ya creados.
  function alElegirCuenta(cuentaId: string) {
    setCuentaSeleccionadaId(cuentaId);
    setComisionManual(false);
    const cuenta = cuentas.find((c) => c.id === cuentaId);
    if (!cuenta || !cuenta.comision_tipo || cuenta.comision_valor == null) return;
    if (cuenta.comision_tipo === "porcentaje") {
      setComisionPorcentaje(String(cuenta.comision_valor));
      setComisionValor(montoNum > 0 ? ((montoNum * cuenta.comision_valor) / 100).toFixed(2) : "0");
    } else {
      setComisionValor(String(cuenta.comision_valor));
      setComisionPorcentaje(montoNum > 0 ? ((cuenta.comision_valor / montoNum) * 100).toFixed(2) : "0");
    }
  }

  // Si ya hay una sugerencia activa (no se tocó a mano) y la persona escribe el monto
  // después de elegir la cuenta, recalcula la comisión sugerida con el monto nuevo.
  useEffect(() => {
    if (comisionManual) return;
    const cuenta = cuentas.find((c) => c.id === cuentaSeleccionadaId);
    if (!cuenta || !cuenta.comision_tipo || cuenta.comision_valor == null) return;
    if (cuenta.comision_tipo === "porcentaje") {
      setComisionValor(montoNum > 0 ? ((montoNum * cuenta.comision_valor) / 100).toFixed(2) : "0");
    } else {
      setComisionPorcentaje(montoNum > 0 ? ((cuenta.comision_valor / montoNum) * 100).toFixed(2) : "0");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [montoNum]);

  return (
    <>
      <Button
        ref={botonAbrirRef}
        type="button"
        onClick={abrirVentana}
        className="!rounded-full !bg-[#202020] !text-white hover:!bg-[#2d2d2d]"
      >
        <MasIcon className="mr-1 h-4 w-4" />
        Agregar
      </Button>

      {abierto && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 p-4"
          onClick={cerrarVentana}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="titulo-nuevo-retiro"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
          >
            <form action={crearRetiro} onSubmit={() => setEnviando(true)} aria-busy={enviando}>
              <input type="hidden" name="pais_id" value={paisId} />
              <input type="hidden" name="fecha_limite" value={fechaLimite} />
              {correlativo !== null && <input type="hidden" name="numero_correlativo" value={correlativo} />}

              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span id="titulo-nuevo-retiro" className="flex items-center gap-2 text-sm font-semibold">
                  Nuevo retiro
                  <span
                    aria-live="polite"
                    title="Se confirma al crear el retiro. Escríbelo en el concepto del retiro en Dropi"
                    className="rounded bg-muted px-2 py-0.5 text-xs font-medium tabular-nums"
                  >
                    {correlativo !== null
                      ? `#${String(correlativo).padStart(4, "0")}`
                      : consultando
                        ? "Calculando..."
                        : "Se asigna al guardar"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={cerrarVentana}
                  disabled={enviando}
                  aria-label="Cerrar"
                  className={`p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-40 ${anilloFoco}`}
                >
                  <CerrarIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-col gap-3 p-4">
                {correlativo !== null && (
                  <p className="text-xs text-muted-foreground">
                    Escribe este correlativo en el concepto del retiro en Dropi para que se concilie. Se confirma al
                    crear el retiro.
                  </p>
                )}
                <div className="flex gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label className={labelClassSm} htmlFor="campo-plataforma">
                      Plataforma
                      <Obligatorio />
                    </label>
                    <select
                      id="campo-plataforma"
                      name="plataforma_id"
                      required
                      defaultValue={plataformas[0]?.id}
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
                    <label className={labelClassSm} htmlFor="campo-cuenta">
                      Cuenta destino
                      <Obligatorio />
                    </label>
                    {cuentas.length > 0 ? (
                      <select
                        id="campo-cuenta"
                        name="cuenta_retiro_id"
                        required
                        onChange={(e) => alElegirCuenta(e.target.value)}
                        className={`${fieldClassSm} w-full min-w-0`}
                      >
                        {cuentas.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p id="campo-cuenta" role="alert" className="py-1 text-xs text-destructive">
                        Sin cuentas activas. Crea una para poder guardar el retiro.
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <label className={labelClassSm} htmlFor="campo-monto">
                      Monto
                      <Obligatorio />
                    </label>
                    <input
                      id="campo-monto"
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
                    <label className={labelClassSm} htmlFor="campo-fecha">
                      Fecha
                      <Obligatorio />
                    </label>
                    <input
                      id="campo-fecha"
                      type="date"
                      name="fecha"
                      defaultValue={hoy()}
                      required
                      className={`${fieldClassSm} w-full min-w-0`}
                    />
                  </div>
                </div>

                <div>
                  <p className={labelClassSm} id="etiqueta-comision">
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
                        aria-describedby="etiqueta-comision"
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
                        aria-describedby="etiqueta-comision"
                        value={comisionPorcentaje}
                        onChange={(e) => alCambiarComisionPorcentaje(e.target.value)}
                        className={`${fieldClassSm} w-full min-w-0 tabular-nums`}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className={labelClassSm} htmlFor="campo-a-recibir">
                    A recibir
                    <Obligatorio />
                  </label>
                  <div className="mt-1 flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">$</span>
                    <input
                      id="campo-a-recibir"
                      type="number"
                      step="0.01"
                      min="0"
                      name="a_recibir"
                      required
                      aria-describedby="ayuda-a-recibir"
                      value={aRecibirMostrado}
                      onChange={(e) => {
                        setARecibir(e.target.value);
                        setARecibirManual(true);
                      }}
                      className={`${fieldClassSm} w-full min-w-0 tabular-nums`}
                    />
                  </div>
                  <p id="ayuda-a-recibir" className="mt-1 text-xs text-muted-foreground">
                    Monto que debe llegar. Por defecto es el monto menos la comisión (
                    <span className="tabular-nums">${montoNeto.toFixed(2)}</span>); puedes cambiarlo.
                    {aRecibirManual && (
                      <>
                        {" "}
                        <button
                          type="button"
                          onClick={() => setARecibirManual(false)}
                          className={`underline hover:text-foreground ${anilloFoco}`}
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
                    aria-label={
                      fechaLimite
                        ? `Fecha límite (opcional): ${formatearFechaNumerica(fechaLimite)}`
                        : "Fecha límite (opcional)"
                    }
                    title="Fecha límite (opcional)"
                    className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-muted ${anilloFoco} ${
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
                          className={`text-xs text-muted-foreground underline hover:text-foreground ${anilloFoco}`}
                        >
                          Quitar
                        </button>
                      )}
                    </>
                  )}
                </div>

                <div>
                  <label className="sr-only" htmlFor="campo-notas">
                    Notas
                  </label>
                  <input
                    id="campo-notas"
                    type="text"
                    name="notas"
                    placeholder="Escribe una nota para este retiro"
                    className={`${fieldClass} w-full text-sm`}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
                <p className="mr-auto text-xs text-muted-foreground">
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>{" "}
                  Obligatorio
                </p>
                <Button type="button" variant="secondary" onClick={cerrarVentana} disabled={enviando}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={cuentas.length === 0 || enviando}>
                  {enviando ? "Creando..." : "Crear retiro"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
