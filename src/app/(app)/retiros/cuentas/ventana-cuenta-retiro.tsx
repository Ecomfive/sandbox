"use client";

import { useRef, useState, useTransition, type ComponentType, type ReactNode } from "react";
import { crearCuentaRetiro, actualizarCuentaRetiro } from "./actions";
import { etiquetaTipoCuenta } from "./def-cuentas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { ExtractoIcon, GastoIcon, LapizIcon, MasIcon, WalletIcon } from "@/lib/nav-icons";
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

/** Un bloque de la ficha: ícono y título a la izquierda, una nota corta a la derecha, y sus campos debajo. */
function Seccion({
  icono: Icono,
  titulo,
  nota,
  children,
}: {
  icono: ComponentType<{ className?: string }>;
  titulo: string;
  nota?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 py-5 first:pt-0 last:pb-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Icono className="h-4 w-4" />
          </span>
          {titulo}
        </h3>
        {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

function Campo({ etiqueta, id, obligatorio, children }: { etiqueta: string; id: string; obligatorio?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className={labelClassSm} htmlFor={id}>
        {etiqueta}
        {obligatorio && <span aria-hidden="true" className="text-destructive"> *</span>}
      </label>
      {children}
    </div>
  );
}

/**
 * Ficha para crear o modificar una cuenta destino: un panel que sale por la derecha (como la ficha de un pedido en
 * otros sistemas), con la cabecera fija arriba, los datos en bloques con ícono y los botones fijos abajo. Sin
 * `cuenta` es «crear» (botón Agregar); con `cuenta` es «modificar» (lápiz de la fila). El panel es `Ventana`: foco
 * dentro, Escape y clic fuera lo cierran, y el foco vuelve al botón que lo abrió.
 */
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
  const botonAbrirRef = useRef<HTMLButtonElement>(null);
  const editando = !!cuenta;

  function abrirVentana() {
    setError(null);
    setComisionTipo(cuenta?.comision_tipo ?? "");
    setTipoCuenta(cuenta?.tipo ?? "banco");
    setAbierto(true);
  }

  /** Cierra la ficha y devuelve el foco al botón que la abrió (algunos navegadores no le dan el foco al hacer clic). */
  function cerrar() {
    setAbierto(false);
    requestAnimationFrame(() => botonAbrirRef.current?.focus());
  }

  function cerrarVentana() {
    if (pending) return;
    cerrar();
  }

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const resultado = editando ? await actualizarCuentaRetiro(formData) : await crearCuentaRetiro(formData);
        if (resultado?.error) setError(resultado.error);
        else cerrar();
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

      <Ventana
        abierto={abierto}
        alCerrar={cerrarVentana}
        lado="derecha"
        ancho="lg"
        titulo={
          <>
            <span className="text-lg font-semibold">{editando ? "Modificar cuenta destino" : "Nueva cuenta destino"}</span>
            {editando && <Badge tone="neutral">{etiquetaTipoCuenta(cuenta.tipo)}</Badge>}
          </>
        }
      >
        <form onSubmit={alEnviar} aria-busy={pending} className="flex flex-1 flex-col">
          {!editando && <input type="hidden" name="pais_id" value={paisId} />}
          {editando && <input type="hidden" name="id" value={cuenta.id} />}
          {/* Ya tenía datos de Binance: si el tipo cambia, el servidor sabe que hay que quitarlos. Va fuera del
              bloque de Binance porque ese bloque desaparece justo al cambiar el tipo. */}
          {editando && datosBinance && <input type="hidden" name="binance_previo" value="1" />}

          <div className="flex flex-1 flex-col divide-y divide-border p-5">
            <Seccion icono={WalletIcon} titulo="Cuenta">
              <Campo etiqueta="Nombre" id="campo-nombre-cuenta">
                <input
                  id="campo-nombre-cuenta"
                  type="text"
                  name="nombre"
                  required
                  data-enfocar
                  defaultValue={cuenta?.nombre}
                  placeholder="Ej: Banco General - Ahorros"
                  className={fieldClass}
                />
              </Campo>
              <Campo etiqueta="Tipo" id="campo-tipo-cuenta">
                <select
                  id="campo-tipo-cuenta"
                  name="tipo"
                  required
                  value={tipoCuenta}
                  onChange={(e) => setTipoCuenta(e.target.value)}
                  className={fieldClass}
                >
                  {TIPOS.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.etiqueta}
                    </option>
                  ))}
                </select>
              </Campo>
              {tipoCuenta !== "binance" && (
                <Campo etiqueta="Cuenta" id="campo-cuenta-cuenta">
                  <input
                    id="campo-cuenta-cuenta"
                    type="text"
                    name="detalle"
                    defaultValue={cuenta?.detalle ?? ""}
                    placeholder="Ej: cuenta 04-01-23-00123-4"
                    className={fieldClass}
                  />
                </Campo>
              )}
            </Seccion>

            {tipoCuenta === "binance" && (
              <Seccion icono={ExtractoIcon} titulo="Datos de la cuenta" nota="como los pide Dropi">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Campo etiqueta="País" id="binance-pais">
                    <input
                      id="binance-pais"
                      type="text"
                      name="binance_pais"
                      list="binance-paises"
                      defaultValue={datosBinance?.pais || paisComoEnDropi(paisNombre)}
                      className={fieldClass}
                    />
                    <datalist id="binance-paises">
                      {PAISES_BINANCE.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </Campo>
                  <Campo etiqueta="Banco" id="binance-banco">
                    <input
                      id="binance-banco"
                      type="text"
                      name="binance_banco"
                      list="binance-bancos"
                      defaultValue={datosBinance?.banco || BANCOS_BINANCE[0]}
                      className={fieldClass}
                    />
                    <datalist id="binance-bancos">
                      {BANCOS_BINANCE.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  </Campo>
                  <Campo etiqueta="Tipo de identificación" id="binance-tipo-identificacion" obligatorio>
                    <input
                      id="binance-tipo-identificacion"
                      type="text"
                      name="binance_tipo_identificacion"
                      list="binance-tipos-identificacion"
                      required
                      defaultValue={datosBinance?.tipo_identificacion}
                      placeholder="Ej: CE"
                      className={fieldClass}
                    />
                    <datalist id="binance-tipos-identificacion">
                      {TIPOS_IDENTIFICACION.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </Campo>
                  <Campo etiqueta="Número de identificación" id="binance-numero-identificacion">
                    <input
                      id="binance-numero-identificacion"
                      type="text"
                      name="binance_numero_identificacion"
                      defaultValue={datosBinance?.numero_identificacion}
                      className={fieldClass}
                    />
                  </Campo>
                  <Campo etiqueta="Tipo de cuenta" id="binance-tipo-cuenta">
                    <input
                      id="binance-tipo-cuenta"
                      type="text"
                      name="binance_tipo_cuenta"
                      list="binance-tipos-cuenta"
                      defaultValue={datosBinance?.tipo_cuenta || TIPOS_CUENTA_BINANCE[0]}
                      className={fieldClass}
                    />
                    <datalist id="binance-tipos-cuenta">
                      {TIPOS_CUENTA_BINANCE.map((t) => (
                        <option key={t} value={t} />
                      ))}
                    </datalist>
                  </Campo>
                </div>
                <Campo etiqueta="Número de cuenta" id="binance-numero-cuenta" obligatorio>
                  <input
                    id="binance-numero-cuenta"
                    type="text"
                    name="binance_numero_cuenta"
                    required
                    autoComplete="off"
                    spellCheck={false}
                    defaultValue={datosBinance?.numero_cuenta ?? cuenta?.detalle ?? ""}
                    placeholder="Dirección de la billetera (ej: T…)"
                    className={`${fieldClass} font-mono`}
                  />
                </Campo>
              </Seccion>
            )}

            <Seccion icono={GastoIcon} titulo="Comisión sugerida" nota={editando ? undefined : "se sugiere al crear un retiro"}>
              <Campo etiqueta="Tipo de comisión" id="campo-comision-tipo">
                <select
                  id="campo-comision-tipo"
                  name="comision_tipo"
                  value={comisionTipo}
                  onChange={(e) => setComisionTipo(e.target.value)}
                  className={fieldClass}
                >
                  {COMISIONES.map((c) => (
                    <option key={c.valor} value={c.valor}>
                      {c.etiqueta}
                    </option>
                  ))}
                </select>
              </Campo>

              {(comisionTipo === "porcentaje" || comisionTipo === "ambos" || comisionTipo === "monto_fijo") && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {(comisionTipo === "porcentaje" || comisionTipo === "ambos") && (
                    <Campo etiqueta="Porcentaje" id="campo-comision-porcentaje">
                      <div className="flex items-center gap-1">
                        <input
                          id="campo-comision-porcentaje"
                          type="number"
                          step="0.01"
                          min="0"
                          name="comision_porcentaje"
                          defaultValue={cuenta?.comision_porcentaje ?? ""}
                          className={`${fieldClass} w-full`}
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                    </Campo>
                  )}
                  {(comisionTipo === "monto_fijo" || comisionTipo === "ambos") && (
                    <Campo etiqueta="Monto fijo" id="campo-comision-monto">
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-muted-foreground">$</span>
                        <input
                          id="campo-comision-monto"
                          type="number"
                          step="0.01"
                          min="0"
                          name="comision_monto_fijo"
                          defaultValue={cuenta?.comision_monto_fijo ?? ""}
                          className={`${fieldClass} w-full`}
                        />
                      </div>
                    </Campo>
                  )}
                </div>
              )}
            </Seccion>
          </div>

          <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-border bg-card p-4">
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={cerrarVentana} disabled={pending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pending} className="!rounded-full !bg-[#202020] !text-white hover:!bg-[#2d2d2d]">
                {pending ? "Guardando..." : editando ? "Guardar cambios" : "Agregar cuenta"}
              </Button>
            </div>
          </div>
        </form>
      </Ventana>
    </>
  );
}
