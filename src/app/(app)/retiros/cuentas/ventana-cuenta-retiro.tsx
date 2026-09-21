"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { crearCuentaRetiro, actualizarCuentaRetiro } from "./actions";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { CerrarIcon, LapizIcon, MasIcon } from "@/lib/nav-icons";
import {
  BANCOS_BINANCE,
  PAISES_BINANCE,
  TIPOS_CUENTA_BINANCE,
  TIPOS_IDENTIFICACION,
  datosBinanceDeLaBase,
  paisComoEnDropi,
} from "@/lib/retiros/datos-binance";

const TIPOS = [
  { valor: "banco", etiqueta: "Banco" },
  { valor: "binance", etiqueta: "Binance" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "otro", etiqueta: "Otro" },
] as const;

const COMISIONES = [
  { valor: "", etiqueta: "Sin comisión" },
  { valor: "porcentaje", etiqueta: "Porcentaje" },
  { valor: "monto_fijo", etiqueta: "Monto fijo" },
  { valor: "ambos", etiqueta: "Porcentaje + monto fijo" },
] as const;

interface CuentaExistente {
  id: string;
  tipo: string;
  nombre: string;
  detalle: string | null;
  comision_tipo: string | null;
  comision_porcentaje: number | null;
  comision_monto_fijo: number | null;
  /** Solo las cuentas Binance (migración 0039). */
  datos_binance?: unknown;
}

/** Ventana para crear o modificar una cuenta de retiro — mismo patrón que "+ Agregar" retiro
 * en Conciliación de Retiros (botón, ventana modal, Escape cierra, foco atrapado adentro),
 * para que ambas pantallas se sientan iguales. Sin `cuenta` es "crear" (botón + Agregar);
 * con `cuenta` es "modificar" (ícono de lápiz por fila). */
export function VentanaCuentaRetiro({
  paisId,
  paisNombre,
  cuenta,
}: {
  paisId: string;
  /** El país de la página: es el que sugiere el formulario de una cuenta Binance. */
  paisNombre: string;
  cuenta?: CuentaExistente;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [comisionTipo, setComisionTipo] = useState(cuenta?.comision_tipo ?? "");
  const [tipoCuenta, setTipoCuenta] = useState(cuenta?.tipo ?? "banco");
  const datosBinance = datosBinanceDeLaBase(cuenta?.datos_binance);
  const panelRef = useRef<HTMLDivElement>(null);
  const botonAbrirRef = useRef<HTMLButtonElement>(null);
  const editando = !!cuenta;
  const tituloId = editando ? `titulo-editar-cuenta-${cuenta.id}` : "titulo-nueva-cuenta";

  function abrirVentana() {
    setError(null);
    setComisionTipo(cuenta?.comision_tipo ?? "");
    setTipoCuenta(cuenta?.tipo ?? "banco");
    setAbierto(true);
  }

  function cerrarVentana() {
    if (pending) return;
    setAbierto(false);
    botonAbrirRef.current?.focus();
  }

  // Escape cierra la ventana, y Tab queda atrapado dentro mientras está abierta.
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
      try {
        const resultado = editando ? await actualizarCuentaRetiro(formData) : await crearCuentaRetiro(formData);
        if (resultado?.error) setError(resultado.error);
        else setAbierto(false);
      } catch {
        setError("No se pudo guardar. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <>
      {editando ? (
        <Tooltip texto="Modificar cuenta">
          <button
            ref={botonAbrirRef}
            type="button"
            onClick={abrirVentana}
            aria-label="Modificar cuenta"
            className={`rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}
          >
            <LapizIcon className="h-4 w-4" />
          </button>
        </Tooltip>
      ) : (
        <Button
          ref={botonAbrirRef}
          type="button"
          onClick={abrirVentana}
          className="!rounded-full !bg-[#202020] !text-white hover:!bg-[#2d2d2d]"
        >
          <MasIcon className="mr-1 h-4 w-4" />
          Agregar
        </Button>
      )}

      {abierto &&
        createPortal(
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          onClick={cerrarVentana}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={tituloId}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md overflow-y-auto rounded-xl border border-border bg-card shadow-xl"
          >
            <form onSubmit={alEnviar} aria-busy={pending}>
              {!editando && <input type="hidden" name="pais_id" value={paisId} />}
              {editando && <input type="hidden" name="id" value={cuenta.id} />}
              {/* Ya tenía datos de Binance: si el tipo cambia, el servidor sabe que hay que quitarlos. Va fuera del
                  bloque de Binance porque ese bloque desaparece justo al cambiar el tipo. */}
              {editando && datosBinance && <input type="hidden" name="binance_previo" value="1" />}

              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span id={tituloId} className="text-sm font-semibold">
                  {editando ? "Modificar cuenta destino" : "Nueva cuenta destino"}
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
                <div className="flex flex-col gap-1">
                  <label className={labelClassSm} htmlFor="campo-nombre-cuenta">
                    Nombre
                  </label>
                  <input
                    id="campo-nombre-cuenta"
                    type="text"
                    name="nombre"
                    required
                    autoFocus
                    defaultValue={cuenta?.nombre}
                    placeholder="Ej: Banco General - Ahorros"
                    className={fieldClassSm}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClassSm} htmlFor="campo-tipo-cuenta">
                    Tipo
                  </label>
                  <select
                    id="campo-tipo-cuenta"
                    name="tipo"
                    required
                    value={tipoCuenta}
                    onChange={(e) => setTipoCuenta(e.target.value)}
                    className={fieldClassSm}
                  >
                    {TIPOS.map((t) => (
                      <option key={t.valor} value={t.valor}>
                        {t.etiqueta}
                      </option>
                    ))}
                  </select>
                </div>

                {tipoCuenta === "binance" ? (
                  <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
                    <legend className="px-1 text-xs font-medium text-muted-foreground">
                      Datos de la cuenta, como los pide Dropi
                    </legend>
                    <div className="flex flex-col gap-1">
                      <label className={labelClassSm} htmlFor="binance-pais">
                        País
                      </label>
                      <input
                        id="binance-pais"
                        type="text"
                        name="binance_pais"
                        list="binance-paises"
                        defaultValue={datosBinance?.pais || paisComoEnDropi(paisNombre)}
                        className={fieldClassSm}
                      />
                      <datalist id="binance-paises">
                        {PAISES_BINANCE.map((p) => (
                          <option key={p} value={p} />
                        ))}
                      </datalist>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelClassSm} htmlFor="binance-banco">
                        Banco
                      </label>
                      <input
                        id="binance-banco"
                        type="text"
                        name="binance_banco"
                        list="binance-bancos"
                        defaultValue={datosBinance?.banco || BANCOS_BINANCE[0]}
                        className={fieldClassSm}
                      />
                      <datalist id="binance-bancos">
                        {BANCOS_BINANCE.map((b) => (
                          <option key={b} value={b} />
                        ))}
                      </datalist>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelClassSm} htmlFor="binance-tipo-identificacion">
                        Tipo de identificación<span aria-hidden="true" className="text-destructive"> *</span>
                      </label>
                      <input
                        id="binance-tipo-identificacion"
                        type="text"
                        name="binance_tipo_identificacion"
                        list="binance-tipos-identificacion"
                        required
                        defaultValue={datosBinance?.tipo_identificacion}
                        placeholder="Ej: CE"
                        className={fieldClassSm}
                      />
                      <datalist id="binance-tipos-identificacion">
                        {TIPOS_IDENTIFICACION.map((t) => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelClassSm} htmlFor="binance-numero-identificacion">
                        Número de identificación
                      </label>
                      <input
                        id="binance-numero-identificacion"
                        type="text"
                        name="binance_numero_identificacion"
                        defaultValue={datosBinance?.numero_identificacion}
                        className={fieldClassSm}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelClassSm} htmlFor="binance-tipo-cuenta">
                        Tipo de cuenta
                      </label>
                      <input
                        id="binance-tipo-cuenta"
                        type="text"
                        name="binance_tipo_cuenta"
                        list="binance-tipos-cuenta"
                        defaultValue={datosBinance?.tipo_cuenta || TIPOS_CUENTA_BINANCE[0]}
                        className={fieldClassSm}
                      />
                      <datalist id="binance-tipos-cuenta">
                        {TIPOS_CUENTA_BINANCE.map((t) => (
                          <option key={t} value={t} />
                        ))}
                      </datalist>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelClassSm} htmlFor="binance-numero-cuenta">
                        Número de cuenta<span aria-hidden="true" className="text-destructive"> *</span>
                      </label>
                      <input
                        id="binance-numero-cuenta"
                        type="text"
                        name="binance_numero_cuenta"
                        required
                        autoComplete="off"
                        spellCheck={false}
                        defaultValue={datosBinance?.numero_cuenta ?? cuenta?.detalle ?? ""}
                        placeholder="Dirección de la billetera (ej: T…)"
                        className={`${fieldClassSm} font-mono`}
                      />
                    </div>
                  </fieldset>
                ) : (
                  <div className="flex flex-col gap-1">
                    <label className={labelClassSm} htmlFor="campo-cuenta-cuenta">
                      Cuenta
                    </label>
                    <input
                      id="campo-cuenta-cuenta"
                      type="text"
                      name="detalle"
                      defaultValue={cuenta?.detalle ?? ""}
                      placeholder="Ej: cuenta 04-01-23-00123-4"
                      className={fieldClassSm}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-1">
                  <label className={labelClassSm} htmlFor="campo-comision-tipo">
                    Comisión sugerida
                  </label>
                  <select
                    id="campo-comision-tipo"
                    name="comision_tipo"
                    value={comisionTipo}
                    onChange={(e) => setComisionTipo(e.target.value)}
                    className={fieldClassSm}
                  >
                    {COMISIONES.map((c) => (
                      <option key={c.valor} value={c.valor}>
                        {c.etiqueta}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Se sugiere sola al elegir esta cuenta en &quot;+ Agregar&quot; retiro. Cambiarla no
                    afecta los retiros ya creados.
                  </p>
                </div>

                {(comisionTipo === "porcentaje" || comisionTipo === "ambos") && (
                  <div className="flex flex-col gap-1">
                    <label className={labelClassSm} htmlFor="campo-comision-porcentaje">
                      Porcentaje
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        id="campo-comision-porcentaje"
                        type="number"
                        step="0.01"
                        min="0"
                        name="comision_porcentaje"
                        defaultValue={cuenta?.comision_porcentaje ?? ""}
                        className={`${fieldClassSm} w-full`}
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                )}

                {(comisionTipo === "monto_fijo" || comisionTipo === "ambos") && (
                  <div className="flex flex-col gap-1">
                    <label className={labelClassSm} htmlFor="campo-comision-monto">
                      Monto fijo
                    </label>
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-muted-foreground">$</span>
                      <input
                        id="campo-comision-monto"
                        type="number"
                        step="0.01"
                        min="0"
                        name="comision_monto_fijo"
                        defaultValue={cuenta?.comision_monto_fijo ?? ""}
                        className={`${fieldClassSm} w-full`}
                      />
                    </div>
                  </div>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}
              </div>

              <div className="flex justify-end gap-2 border-t border-border p-3">
                <Button type="button" variant="secondary" onClick={cerrarVentana} disabled={pending}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  disabled={pending}
                  className="!rounded-full !bg-[#202020] !text-white hover:!bg-[#2d2d2d]"
                >
                  {pending ? "Guardando..." : editando ? "Guardar cambios" : "Agregar cuenta"}
                </Button>
              </div>
            </form>
          </div>
        </div>
        , document.body)}
    </>
  );
}
