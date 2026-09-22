"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { crearCuentaRetiro, actualizarCuentaRetiro } from "./actions";
import { tiposParaElegir, type FilaCuenta } from "./def-cuentas";
import { BotonAccion } from "@/components/ui/boton-accion";
import { BotonCrear } from "@/components/ui/boton-crear";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useFaltantes } from "@/components/ui/usar-faltantes";
import { CerrarIcon, CheckIcon, ExtractoIcon, GastoIcon, WalletIcon } from "@/lib/nav-icons";
import {
  BANCOS_BINANCE,
  PAISES_BINANCE,
  TIPOS_IDENTIFICACION,
  datosBinanceDeLaBase,
  paisComoEnDropi,
} from "@/lib/retiros/datos-binance";

const COMISIONES = [
  { valor: "", etiqueta: "Sin comisión" },
  { valor: "porcentaje", etiqueta: "Porcentaje" },
  { valor: "monto_fijo", etiqueta: "Monto fijo" },
  { valor: "ambos", etiqueta: "Porcentaje + monto fijo" },
] as const;

/**
 * Lista desplegable para un dato que se elige entre pocas opciones: con un clic se ve toda la lista y se cambia,
 * sin borrar antes lo que había (un campo de texto con sugerencias solo muestra las que coinciden con lo escrito).
 * Si el valor guardado no está en la lista (una cuenta anterior), se conserva como una opción más. Con `obligatorio`
 * arranca sin elegir y el formulario no se envía hasta que se elija una.
 */
function SelectorDeLista({
  id,
  name,
  opciones,
  valorInicial,
  obligatorio,
  invalido,
}: {
  id: string;
  name: string;
  opciones: readonly string[];
  valorInicial: string;
  obligatorio?: boolean;
  /** Marca el campo como el dato que falta (ver `useFaltantes`). */
  invalido?: boolean;
}) {
  const lista = valorInicial && !opciones.includes(valorInicial) ? [valorInicial, ...opciones] : opciones;
  return (
    <select id={id} name={name} required={obligatorio} aria-invalid={invalido || undefined} defaultValue={valorInicial} className={fieldClass}>
      {obligatorio && <option value="">Selecciona</option>}
      {lista.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

/**
 * El formulario de una cuenta destino, con sus bloques. Sin `cuenta` crea (lleva el país); con `cuenta` modifica. Arranca
 * siempre con los datos de la cuenta (se monta de nuevo al pasar a otra), sin arrastrar lo escrito antes.
 *
 * Los botones van de dos maneras. Por defecto (crear, «Nueva cuenta destino»), un botón grande al final: apagado mientras
 * falte un dato obligatorio y, al pulsarlo así, lleva al dato que falta (`useFaltantes`). Con `botonesArriba` (la ficha de
 * una cuenta) no hay barra abajo: una fila de botones en el mismo estilo que las acciones de la ficha queda pegada bajo
 * la cabecera, y **Guardar cambios y Cancelar solo aparecen cuando se cambió algo**, junto a las `acciones` de la ficha
 * (Eliminar). El error se muestra junto a los botones.
 */
export function FormularioCuenta({
  paisId,
  paisNombre,
  cuenta,
  alGuardar,
  alCancelar,
  alCambiarGuardando,
  alModificar,
  botonesArriba,
  encabezado,
  acciones,
}: {
  paisId: string;
  /** El país de la página: es el que sugiere el formulario de una cuenta Binance. */
  paisNombre: string;
  cuenta?: FilaCuenta;
  /** Se llama cuando el servidor guardó sin error. */
  alGuardar: () => void;
  /** Con `botonesArriba`: lo que hace el botón Cancelar (descartar lo escrito). */
  alCancelar?: () => void;
  /** Avisa si está guardando, para que la ventana no se cierre a mitad de camino. */
  alCambiarGuardando?: (guardando: boolean) => void;
  /** Se llama cuando la persona cambia cualquier campo (para saber si hay cambios sin guardar). */
  alModificar?: () => void;
  /** Los botones van arriba y no abajo (ver arriba). */
  botonesArriba?: boolean;
  /** Con `botonesArriba`: lo que va sobre la fila de botones (la línea de tiempo de la ficha). */
  encabezado?: ReactNode;
  /** Con `botonesArriba`: botones propios de la ficha, junto a Guardar y Cancelar. */
  acciones?: ReactNode;
}) {
  const [modificado, setModificado] = useState(false);
  const { formRef, completo, faltante, revisar, señalarFaltante } = useFaltantes();
  const invalido = (id: string) => faltante === id;
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    alCambiarGuardando?.(pending);
  }, [pending, alCambiarGuardando]);
  const [error, setError] = useState<string | null>(null);
  const [comisionTipo, setComisionTipo] = useState(cuenta?.comision_tipo ?? "");
  const [tipoCuenta, setTipoCuenta] = useState(cuenta?.tipo ?? "banco");
  const datosBinance = datosBinanceDeLaBase(cuenta?.datos_binance);
  const editando = !!cuenta;

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const resultado = editando ? await actualizarCuentaRetiro(formData) : await crearCuentaRetiro(formData);
        if (resultado?.error) setError(resultado.error);
        else {
          setModificado(false);
          alGuardar();
        }
      } catch {
        setError("No se pudo guardar. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={alEnviar}
      onInput={revisar}
      onChange={() => {
        revisar();
        setModificado(true);
        alModificar?.();
      }}
      aria-busy={pending}
      className="flex flex-1 flex-col"
    >
      {!editando && <input type="hidden" name="pais_id" value={paisId} />}
      {editando && <input type="hidden" name="id" value={cuenta.id} />}
      {/* Ya tenía datos de Binance: si el tipo cambia, el servidor sabe que hay que quitarlos. Va fuera del
          bloque de Binance porque ese bloque desaparece justo al cambiar el tipo. */}
      {editando && datosBinance && <input type="hidden" name="binance_previo" value="1" />}

      {botonesArriba && (
        <>
          {encabezado}
          {/* Pegada bajo la cabecera del panel (su alto lo publica `Ventana` como --alto-cabecera) para que Guardar
              siga a la vista aunque se esté cambiando un campo de más abajo. */}
          <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-col gap-2 border-y border-border bg-card px-5 py-3">
            <div className="flex flex-wrap gap-2">
              {modificado && (
                <>
                  <BotonAccion type="submit" tono="oscuro" icono={CheckIcon} disabled={pending}>
                    {pending ? "Guardando..." : "Guardar cambios"}
                  </BotonAccion>
                  <BotonAccion icono={CerrarIcon} onClick={alCancelar} disabled={pending}>
                    Cancelar
                  </BotonAccion>
                </>
              )}
              {acciones}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        </>
      )}

      <div className="flex flex-1 flex-col divide-y divide-border p-5">
        <Seccion icono={WalletIcon} titulo="Cuenta">
          <Campo etiqueta="Nombre" id="campo-nombre-cuenta" obligatorio faltante={faltante}>
            <input
              id="campo-nombre-cuenta"
              type="text"
              name="nombre"
              required
              data-enfocar
              aria-invalid={invalido("campo-nombre-cuenta") || undefined}
              defaultValue={cuenta?.nombre}
              placeholder="Ej: Banco Ejemplo - Ahorros"
              className={fieldClass}
            />
          </Campo>
          <Campo etiqueta="Tipo" id="campo-tipo-cuenta" obligatorio faltante={faltante}>
            <select
              id="campo-tipo-cuenta"
              name="tipo"
              required
              aria-invalid={invalido("campo-tipo-cuenta") || undefined}
              value={tipoCuenta}
              onChange={(e) => setTipoCuenta(e.target.value)}
              className={fieldClass}
            >
              {tiposParaElegir(cuenta?.tipo).map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </Campo>
          {tipoCuenta !== "binance" && (
            // Al crear, la cuenta es obligatoria; una cuenta ya guardada sin este dato se puede seguir modificando.
            <Campo etiqueta="Cuenta" id="campo-cuenta-cuenta" obligatorio={!editando} faltante={faltante}>
              <input
                id="campo-cuenta-cuenta"
                type="text"
                name="detalle"
                required={!editando}
                aria-invalid={invalido("campo-cuenta-cuenta") || undefined}
                defaultValue={cuenta?.detalle ?? ""}
                placeholder="Ej: cuenta 04-01-23-00123-4"
                className={fieldClass}
              />
            </Campo>
          )}
        </Seccion>

        {tipoCuenta === "binance" && (
          <Seccion icono={ExtractoIcon} titulo="Datos de la cuenta">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="País" id="binance-pais">
                <SelectorDeLista
                  id="binance-pais"
                  name="binance_pais"
                  opciones={PAISES_BINANCE}
                  valorInicial={datosBinance?.pais || paisComoEnDropi(paisNombre)}
                />
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
              <Campo etiqueta="Tipo de identificación" id="binance-tipo-identificacion" obligatorio faltante={faltante}>
                <SelectorDeLista
                  id="binance-tipo-identificacion"
                  name="binance_tipo_identificacion"
                  opciones={TIPOS_IDENTIFICACION}
                  valorInicial={datosBinance?.tipo_identificacion ?? ""}
                  obligatorio
                  invalido={invalido("binance-tipo-identificacion")}
                />
              </Campo>
              <Campo etiqueta="Número de identificación" id="binance-numero-identificacion" obligatorio={!editando} faltante={faltante}>
                <input
                  id="binance-numero-identificacion"
                  type="text"
                  name="binance_numero_identificacion"
                  required={!editando}
                  aria-invalid={invalido("binance-numero-identificacion") || undefined}
                  defaultValue={datosBinance?.numero_identificacion}
                  placeholder="Ej: 8-123-456"
                  className={fieldClass}
                />
              </Campo>
            </div>
            <Campo etiqueta="Número de cuenta" id="binance-numero-cuenta" obligatorio faltante={faltante}>
              <input
                id="binance-numero-cuenta"
                type="text"
                name="binance_numero_cuenta"
                required
                autoComplete="off"
                spellCheck={false}
                aria-invalid={invalido("binance-numero-cuenta") || undefined}
                defaultValue={datosBinance?.numero_cuenta ?? cuenta?.detalle ?? ""}
                placeholder="Ej: TAbCdEfGhJkLmNpQrStUvWxYz12345678"
                className={`${fieldClass} font-mono`}
              />
            </Campo>
          </Seccion>
        )}

        <Seccion icono={GastoIcon} titulo="Comisión sugerida">
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
                      placeholder="Ej: 2.5"
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
                      placeholder="Ej: 1.50"
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

      {!botonesArriba && (
        <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-border bg-card p-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <BotonCrear
            puede={completo}
            enviando={pending}
            etiqueta={editando ? "Guardar cambios" : "Crear cuenta"}
            etiquetaEnviando="Guardando..."
            alPulsarSinCompletar={señalarFaltante}
          />
        </div>
      )}
    </form>
  );
}
