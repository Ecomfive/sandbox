"use client";

import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { actualizarRetiro } from "./actions";
import { calcularComisionSugerida, type Cuenta, type Plataforma } from "./crear-retiro-panel";
import { ESTADO_ETIQUETA } from "./filtros";
import type { FilaRetiro } from "./tabla-retiros";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClass, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { ETIQUETA_ESTADO_DROPI, TONO_ESTADO_DROPI, type EstadoDropi } from "@/lib/dropi/emparejar-retiros";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { CheckIcon, CerrarIcon } from "@/lib/nav-icons";

const Obligatorio = () => (
  <span aria-hidden="true" className="text-destructive">
    {" "}
    *
  </span>
);

// Igual que en "Nuevo retiro": "cancelado" queda afuera del selector a propósito — cancelar
// sigue siendo una acción aparte (el botón Cancelar de la ficha), no un valor más para elegir acá.
// El selector se ve siempre, incluso en un retiro ya cancelado: es la forma de reabrirlo.
const ESTADOS_EDITABLES = ["abierto", "novedad", "cerrado"] as const;

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/**
 * El cuerpo de la ficha de un retiro, debajo de su barra de pasos: los campos editables (mismo patrón visual que
 * «Nuevo retiro»), los datos que no se editan a mano (Recibido, Cierre, Persona asignada, Consolidación, Estado en
 * Dropi, Soporte), sin pestañas. **No hay un botón «Modificar»**: se cambia un campo y arriba, junto a las
 * `acciones` de la ficha (Conciliar, Novedad, Abrir, Cancelar, Eliminar), aparecen «Guardar cambios» y «Cancelar» —
 * que solo se ven cuando se cambió algo. Guardar no cierra la ficha. Con `key={fila.id}-versión}` en quien lo usa,
 * cancelar (o pasar a otro retiro) lo vuelve a montar con los datos de la fila, sin arrastrar lo escrito. El historial
 * de actividad **no** está aquí: va al final de la ficha (`HistorialRetiro`), debajo de las secciones de Conciliar y
 * Novedad.
 */
export function FormularioEditarRetiro({
  fila,
  codigoPais,
  plataformas,
  cuentas,
  acciones,
  alGuardar,
  alCancelar,
  alCambiarGuardando,
  alModificar,
}: {
  fila: FilaRetiro;
  codigoPais: string;
  plataformas: Plataforma[];
  cuentas: Cuenta[];
  /** Botones propios de la ficha (Conciliar, Abrir, Cancelar, Eliminar), junto a Guardar y Cancelar. */
  acciones: ReactNode;
  /** Se llama cuando el servidor guardó sin error. */
  alGuardar: () => void;
  alCancelar: () => void;
  /** Avisa si está guardando, para que la ficha no se cierre a mitad de camino. */
  alCambiarGuardando?: (guardando: boolean) => void;
  /** Se llama cuando la persona cambia cualquier campo (para saber si hay cambios sin guardar). */
  alModificar?: () => void;
}) {
  const [modificado, setModificado] = useState(false);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    alCambiarGuardando?.(pending);
  }, [pending, alCambiarGuardando]);
  const [error, setError] = useState<string | null>(null);
  const [monto, setMonto] = useState(String(fila.monto));
  const [comisionValor, setComisionValor] = useState(fila.comision.toFixed(2));
  const [comisionPorcentaje, setComisionPorcentaje] = useState(
    fila.monto > 0 ? ((fila.comision / fila.monto) * 100).toFixed(2) : "0"
  );
  const [comisionManual, setComisionManual] = useState(true);
  // Sin cuenta[0] como respaldo: un retiro importado sin cuenta vinculada debe poder guardarse
  // sin que el selector salte solo a la primera cuenta de la lista (le cambiaría el destino).
  const [cuentaSeleccionadaId, setCuentaSeleccionadaId] = useState(fila.cuentaRetiroId ?? "");

  const montoNum = parseFloat(monto) || 0;
  const comisionNum = parseFloat(comisionValor) || 0;
  const montoNeto = montoNum - comisionNum;
  const moneda = (valor: number) => formatearMoneda(valor, codigoPais);
  const diferencia = fila.montoRecibido !== null ? fila.montoRecibido - fila.aRecibir : null;

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

  function alEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await actualizarRetiro(formData);
        setModificado(false);
        alGuardar();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <form
      onSubmit={alEnviar}
      onChange={() => {
        setModificado(true);
        alModificar?.();
      }}
      aria-busy={pending}
      className="flex flex-1 flex-col"
    >
      <input type="hidden" name="id" value={fila.id} />

      {/* Pegada bajo la cabecera del panel (su alto lo publica `Ventana` como --alto-cabecera) para que Guardar
          siga a la vista aunque se esté cambiando un campo de más abajo. */}
      <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-col gap-2 border-y border-border bg-card px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {modificado && (
            <>
              <button
                type="submit"
                disabled={pending}
                className={`inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}
              >
                <CheckIcon className="h-4 w-4" />
                {pending ? "Guardando..." : "Guardar cambios"}
              </button>
              <button
                type="button"
                onClick={alCancelar}
                disabled={pending}
                className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}
              >
                <CerrarIcon className="h-4 w-4" />
                Cancelar
              </button>
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

      <div className="flex flex-col gap-3 p-4">
        <div className="flex gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label className={labelClassSm} htmlFor={`campo-plataforma-${fila.id}`}>
              Plataforma
              <Obligatorio />
            </label>
            <select
              id={`campo-plataforma-${fila.id}`}
              name="plataforma_id"
              required
              defaultValue={fila.plataformaId ?? plataformas[0]?.id}
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
            <label className={labelClassSm} htmlFor={`campo-cuenta-${fila.id}`}>
              Cuenta destino
            </label>
            <select
              id={`campo-cuenta-${fila.id}`}
              name="cuenta_retiro_id"
              value={cuentaSeleccionadaId}
              onChange={(e) => alElegirCuenta(e.target.value)}
              className={`${fieldClassSm} w-full min-w-0`}
            >
              {!fila.cuentaRetiroId && <option value="">{fila.destino} (sin cuenta asignada)</option>}
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex flex-col gap-1">
            <label className={labelClassSm} htmlFor={`campo-gestionado-por-${fila.id}`}>
              Gestionado por
              <Obligatorio />
            </label>
            <select
              id={`campo-gestionado-por-${fila.id}`}
              name="gestionado_por"
              required
              defaultValue={fila.gestionadoPor}
              className={`${fieldClassSm} w-40`}
            >
              <option value="plataforma">Plataforma</option>
              <option value="correo">Correo</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClassSm} htmlFor={`campo-estado-${fila.id}`}>
              Estado
              <Obligatorio />
            </label>
            <select
              id={`campo-estado-${fila.id}`}
              name="estado"
              required
              defaultValue={fila.estado}
              className={`${fieldClassSm} w-40`}
            >
              {ESTADOS_EDITABLES.map((valor) => (
                <option key={valor} value={valor}>
                  {ESTADO_ETIQUETA[valor]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="flex w-24 shrink-0 flex-col gap-1">
            <label className={labelClassSm} htmlFor={`campo-monto-${fila.id}`}>
              Monto
              <Obligatorio />
            </label>
            <input
              id={`campo-monto-${fila.id}`}
              type="number"
              step="0.01"
              min="0"
              name="monto"
              required
              data-enfocar
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className={`${fieldClassSm} w-full min-w-0 tabular-nums`}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label className={labelClassSm} htmlFor={`campo-fecha-${fila.id}`}>
              Fecha
              <Obligatorio />
            </label>
            <input
              id={`campo-fecha-${fila.id}`}
              type="date"
              name="fecha"
              defaultValue={fila.fecha}
              required
              className={`${fieldClassSm} w-full min-w-0`}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label className={labelClassSm} htmlFor={`campo-fecha-limite-${fila.id}`}>
              Fecha límite
            </label>
            <input
              id={`campo-fecha-limite-${fila.id}`}
              type="date"
              name="fecha_limite"
              defaultValue={fila.fechaLimite ?? ""}
              className={`${fieldClassSm} w-full min-w-0`}
            />
          </div>
        </div>

        <div>
          <p className={labelClassSm} id={`etiqueta-comision-${fila.id}`}>
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
                aria-describedby={`etiqueta-comision-${fila.id}`}
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
                aria-describedby={`etiqueta-comision-${fila.id}`}
                value={comisionPorcentaje}
                onChange={(e) => alCambiarComisionPorcentaje(e.target.value)}
                className={`${fieldClassSm} w-full min-w-0 tabular-nums`}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClassSm} htmlFor={`campo-a-recibir-${fila.id}`}>
              A recibir
            </label>
            <div className="mt-1 flex items-center gap-1">
              <span className="text-sm text-muted-foreground">$</span>
              <input
                id={`campo-a-recibir-${fila.id}`}
                type="number"
                step="0.01"
                readOnly
                tabIndex={-1}
                value={montoNeto.toFixed(2)}
                className={`${fieldClassSm} w-full min-w-0 cursor-not-allowed bg-muted tabular-nums`}
              />
            </div>
          </div>
          <Dato etiqueta="Recibido">
            {fila.montoRecibido === null ? (
              <span className="text-muted-foreground">Sin registrar</span>
            ) : (
              <span className="tabular-nums">
                {moneda(fila.montoRecibido)}
                {diferencia !== null && Math.abs(diferencia) > 0.005 && (
                  <span className={diferencia < 0 ? "ml-1 text-destructive" : "ml-1 text-success"}>
                    ({diferencia > 0 ? "+" : ""}
                    {moneda(diferencia)})
                  </span>
                )}
              </span>
            )}
          </Dato>
        </div>

        <div>
          <label className={labelClassSm} htmlFor={`campo-notas-${fila.id}`}>
            Nota
          </label>
          <input
            id={`campo-notas-${fila.id}`}
            type="text"
            name="notas"
            defaultValue={fila.notas ?? ""}
            placeholder="Escribe una nota para este retiro"
            className={`${fieldClass} mt-1 w-full text-sm`}
          />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-3">
          <Dato etiqueta="Creación">{formatearFecha(fila.fecha)}</Dato>
          <Dato etiqueta="Cierre">{fila.fechaCierre ? formatearFecha(fila.fechaCierre) : "—"}</Dato>
          <Dato etiqueta="Persona asignada">{fila.asignadoNombre ?? "—"}</Dato>
          <Dato etiqueta="Consolidación">
            <Badge tone={fila.consolidado ? "success" : "warning"}>{fila.consolidado ? "Consolidado" : "Pendiente"}</Badge>
          </Dato>
          <Dato etiqueta="Estado en Dropi">
            {fila.estadoDropi && fila.estadoDropi in TONO_ESTADO_DROPI ? (
              <Badge tone={TONO_ESTADO_DROPI[fila.estadoDropi as EstadoDropi]}>
                {ETIQUETA_ESTADO_DROPI[fila.estadoDropi as EstadoDropi]}
              </Badge>
            ) : (
              "—"
            )}
          </Dato>
          <Dato etiqueta="Soporte">{fila.soporteNumero ?? "—"}</Dato>
        </div>
      </div>
    </form>
  );
}
