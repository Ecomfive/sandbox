"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { AvisoFaltante, BotonCrear } from "@/components/ui/boton-crear";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { useFaltantes } from "@/components/ui/usar-faltantes";
import { Ventana } from "@/components/ui/ventana";
import { fechaCorta } from "@/lib/af4/fecha";
import { dias, dinero } from "@/lib/af4/formato";
import { CalendarioIcon, CerrarIcon, CheckIcon, EstadoIcon, ExtractoIcon, PapeleraIcon, WalletIcon } from "@/lib/nav-icons";
import {
  actualizarDocumentoCartera,
  cambiarEstadoCartera,
  eliminarAbonoCartera,
  eliminarDocumentoCartera,
  obtenerHistorialCobrar,
  obtenerHistorialPagar,
  registrarAbonoCartera,
} from "@/lib/finanzas/cartera-actions";
import { ESTADOS_ABIERTOS, ETIQUETA_ESTADO, ETIQUETA_TRAMO, METODOS, hoyPanama, type Clase, type Estado, type EstadoManual } from "@/lib/finanzas/cxc-cxp";
import type { FilaCartera, Opcion } from "@/lib/finanzas/cargar-cartera";

export const TONO_ESTADO: Record<Estado, Tone> = {
  pendiente: "warning",
  parcial: "info",
  pagado: "success",
  incobrable: "destructive",
  anulado: "neutral",
};

export const usd = (v: number) => dinero(v, "USD", { decimales: 2 });
const fecha = (f: string | null) => (f ? fechaCorta(f) : "Sin fecha");

interface Formulario {
  unidadId: string;
  vencimiento: string;
  notas: string;
}
const desde = (f: FilaCartera): Formulario => ({ unidadId: f.unidadId ?? "", vencimiento: f.vencimiento ?? "", notas: f.notas });

/**
 * Ficha de un documento por cobrar o por pagar: el panel a la derecha que se abre al pulsar su fila. Arriba, las acciones
 * (registrar abono, marcar incobrable o anulado, quitar la marca); los datos en bloques, con la tienda, el vencimiento y
 * las notas editables (la ficha ya es el formulario: «Guardar cambios» aparece solo con cambios); los abonos; la sección
 * de la acción elegida y, al final, la actividad.
 */
export function FichaDocumento(props: { clase: Clase; fila: FilaCartera | undefined; unidades: Opcion[]; cuentas: Opcion[]; puedeEscribir: boolean; alCerrar: () => void }) {
  if (!props.fila) return null;
  const f = props.fila;
  // Con otra `key` el formulario arranca con los datos del documento (al abrir otro o tras guardar).
  return <Contenido key={`${f.id}-${f.unidadId}-${f.vencimiento}-${f.notas}`} {...props} fila={f} />;
}

type Panel = "abono" | "estado" | null;

function Contenido({ clase, fila, unidades, cuentas, puedeEscribir, alCerrar }: { clase: Clase; fila: FilaCartera; unidades: Opcion[]; cuentas: Opcion[]; puedeEscribir: boolean; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  const [d, setD] = useState<Formulario>(desde(fila));
  const [panel, setPanel] = useState<Panel>(null);
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const sinGuardar = JSON.stringify(d) !== JSON.stringify(desde(fila));
  const abierto = ESTADOS_ABIERTOS.includes(fila.estado);
  const titulo = fila.documento || fila.contraparte;

  function cerrar() {
    if (pendiente) return;
    if (sinGuardar && !confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
    alCerrar();
  }

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const datos = new FormData();
    datos.set("clase", clase);
    datos.set("id", fila.id);
    datos.set("unidad_id", d.unidadId);
    datos.set("vencimiento", d.vencimiento);
    datos.set("notas", d.notas);
    empezar(async () => {
      const r = await actualizarDocumentoCartera(datos).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Cambios guardados");
        setVersion((v) => v + 1);
      }
    });
  }

  function quitarMarca() {
    setError(null);
    empezar(async () => {
      const r = await cambiarEstadoCartera(clase, fila.id, null, "").catch(() => ({ error: "No se pudo cambiar el estado." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Marca quitada");
        setVersion((v) => v + 1);
      }
    });
  }

  function eliminar() {
    if (!confirm(`¿Eliminar ${titulo}? No se puede deshacer.`)) return;
    setError(null);
    empezar(async () => {
      const r = await eliminarDocumentoCartera(clase, fila.id).catch(() => ({ error: "No se pudo eliminar." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Documento eliminado");
        alCerrar();
      }
    });
  }

  function quitarAbono(id: string, monto: number) {
    if (!confirm(`¿Quitar el abono de ${usd(monto)}?`)) return;
    setError(null);
    empezar(async () => {
      const r = await eliminarAbonoCartera(clase, id).catch(() => ({ error: "No se pudo quitar el abono." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Abono quitado");
        setVersion((v) => v + 1);
      }
    });
  }

  return (
    <Ventana
      abierto
      alCerrar={cerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        <>
          <span className="text-lg font-semibold">{titulo}</span>
          <Badge tone={TONO_ESTADO[fila.estado]}>{ETIQUETA_ESTADO[fila.estado]}</Badge>
        </>
      }
    >
      <form onSubmit={guardar} aria-busy={pendiente} className="flex flex-1 flex-col">
        {puedeEscribir && (
          <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-col gap-2 border-y border-border bg-card px-5 py-3">
            <div className="flex flex-wrap gap-2">
              {sinGuardar && (
                <>
                  <button type="submit" disabled={pendiente} className={`inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50 ${anilloFoco}`}>
                    <CheckIcon className="h-4 w-4" />
                    {pendiente ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button type="button" onClick={() => setD(desde(fila))} disabled={pendiente} className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
                    <CerrarIcon className="h-4 w-4" />
                    Cancelar
                  </button>
                </>
              )}
              <BotonAccion icono={WalletIcon} tono="oscuro" disabled={pendiente || !abierto} aria-pressed={panel === "abono"} onClick={() => setPanel(panel === "abono" ? null : "abono")}>
                Registrar abono
              </BotonAccion>
              {fila.estadoManual ? (
                <BotonAccion icono={EstadoIcon} tono="exito" disabled={pendiente} onClick={quitarMarca}>
                  Quitar «{ETIQUETA_ESTADO[fila.estadoManual]}»
                </BotonAccion>
              ) : (
                <BotonAccion icono={EstadoIcon} tono="alerta" disabled={pendiente || fila.estado === "pagado"} aria-pressed={panel === "estado"} onClick={() => setPanel(panel === "estado" ? null : "estado")}>
                  {clase === "cobrar" ? "Incobrable o anular" : "Anular"}
                </BotonAccion>
              )}
              {fila.origen === "manual" && (
                <BotonAccion icono={PapeleraIcon} tono="peligro" disabled={pendiente} onClick={eliminar}>
                  Eliminar
                </BotonAccion>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col divide-y divide-border p-5">
          <Seccion icono={WalletIcon} titulo="Saldo">
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <Dato titulo="Monto" valor={usd(fila.monto)} />
              <Dato titulo="Abonado" valor={usd(fila.abonado)} />
              <Dato titulo="Saldo" valor={usd(fila.saldo)} fuerte negativo={fila.saldo < 0} />
            </dl>
            {fila.estadoManual && fila.motivoEstado && (
              <p className="flex items-start gap-2 text-sm">
                <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                {ETIQUETA_ESTADO[fila.estadoManual]}: {fila.motivoEstado}
              </p>
            )}
          </Seccion>

          <Seccion icono={ExtractoIcon} titulo="Documento">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Dato titulo={clase === "cobrar" ? "Cliente / deudor" : "Acreedor"} valor={fila.contraparte} />
              <Dato titulo="Documento" valor={fila.documento || "—"} />
              <Dato titulo="Motivo" valor={fila.motivo || "—"} ancho />
              <Dato titulo="Origen" valor={fila.origen === "excel" ? `Excel · ${fila.origenHoja ?? ""}${fila.origenArchivo ? ` (${fila.origenArchivo})` : ""}` : "Cargado en el portal"} ancho />
              {fila.notasExcel && <Dato titulo="Notas del Excel" valor={fila.notasExcel} ancho />}
            </dl>
            <fieldset disabled={!puedeEscribir} className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Tienda</span>
                <select value={d.unidadId} onChange={(e) => setD({ ...d, unidadId: e.target.value })} className={`${fieldClass} w-full`}>
                  <option value="">Sin tienda</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Notas</span>
                <textarea value={d.notas} onChange={(e) => setD({ ...d, notas: e.target.value })} rows={2} maxLength={1000} className={`${fieldClass} w-full resize-y`} />
              </label>
            </fieldset>
          </Seccion>

          <Seccion icono={CalendarioIcon} titulo="Fechas">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Dato titulo="Fecha" valor={fecha(fila.fecha)} />
              <Dato titulo="Antigüedad" valor={fila.dias === null ? ETIQUETA_TRAMO[fila.tramo] : `${fila.dias} días · ${ETIQUETA_TRAMO[fila.tramo]}`} />
              <Dato
                titulo={fila.vencimiento ? "Vence" : "Vence (plazo de 30 días)"}
                valor={fila.vence ? `${fechaCorta(fila.vence)}${fila.vencido ? ` · ${dias(fila.diasVencido)} vencido` : ""}` : "—"}
                punto={fila.vencido ? "bg-destructive" : undefined}
              />
            </dl>
            <fieldset disabled={!puedeEscribir} className="m-0 min-w-0 border-0 p-0">
              <label className="flex flex-col gap-1 sm:max-w-56">
                <span className={labelClassSm}>Vencimiento</span>
                <input type="date" value={d.vencimiento} min={fila.fecha ?? undefined} onChange={(e) => setD({ ...d, vencimiento: e.target.value })} className={`${fieldClass} w-full`} />
              </label>
            </fieldset>
          </Seccion>

          <Seccion icono={WalletIcon} titulo={`Abonos (${fila.abonos.length})`}>
            {fila.abonos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin abonos.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border text-sm">
                {fila.abonos.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-2">
                    <span className="w-24 shrink-0 text-muted-foreground">{fecha(a.fecha)}</span>
                    <span className="font-medium tabular-nums">{usd(a.monto)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {[a.metodo, a.referencia, a.cuenta, a.origen === "excel" ? "Excel" : null].filter(Boolean).join(" · ") || "—"}
                    </span>
                    {puedeEscribir && a.origen === "manual" && (
                      <Tooltip texto="Quitar abono">
                        <button type="button" aria-label={`Quitar el abono de ${usd(a.monto)}`} disabled={pendiente} onClick={() => quitarAbono(a.id, a.monto)} className={`rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground ${anilloFoco}`}>
                          <PapeleraIcon className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Seccion>
        </div>
      </form>

      {puedeEscribir && panel === "abono" && abierto && (
        <SeccionAbono clase={clase} fila={fila} cuentas={cuentas} alTerminar={() => { setPanel(null); setVersion((v) => v + 1); }} />
      )}
      {puedeEscribir && panel === "estado" && !fila.estadoManual && (
        <SeccionEstado clase={clase} fila={fila} alTerminar={() => { setPanel(null); setVersion((v) => v + 1); }} />
      )}

      <HistorialGenerico id={fila.id} codigoPais="PA" version={version} obtener={clase === "cobrar" ? obtenerHistorialCobrar : obtenerHistorialPagar} />
    </Ventana>
  );
}

function Dato({ titulo, valor, fuerte = false, negativo = false, ancho = false, punto }: { titulo: string; valor: string; fuerte?: boolean; negativo?: boolean; ancho?: boolean; punto?: string }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${ancho ? "col-span-full" : ""}`}>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {punto && <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${punto}`} />}
        {titulo}
      </dt>
      <dd className={`break-words ${fuerte ? "text-base font-semibold tabular-nums" : ""} ${negativo ? "text-destructive" : ""}`}>{valor}</dd>
    </div>
  );
}

/** Lleva la ficha hasta la sección que se acaba de abrir y pone el foco en su primer campo. */
function useIrAlPanel() {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "start", behavior: reducido ? "auto" : "smooth" });
    el.querySelector<HTMLElement>("[data-enfocar]")?.focus({ preventScroll: true });
  }, []);
  return ref;
}

function SeccionAbono({ clase, fila, cuentas, alTerminar }: { clase: Clase; fila: FilaCartera; cuentas: Opcion[]; alTerminar: () => void }) {
  const { mostrarToast } = useToast();
  const ref = useIrAlPanel();
  const { formRef, completo, faltante, revisar, señalarFaltante } = useFaltantes();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    setError(null);
    empezar(async () => {
      const r = await registrarAbonoCartera(datos).catch(() => ({ error: "No se pudo registrar el abono." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Abono registrado");
        alTerminar();
      }
    });
  }

  return (
    <section ref={ref} aria-labelledby={`abono-${fila.id}`} className="border-t border-border p-5">
      <h3 id={`abono-${fila.id}`} className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <WalletIcon className="h-4 w-4" />
        Registrar abono
      </h3>
      <form ref={formRef} onSubmit={enviar} onInput={revisar} onChange={revisar} noValidate className="flex flex-col gap-3">
        <input type="hidden" name="clase" value={clase} />
        <input type="hidden" name="documento_id" value={fila.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>
              Fecha<span aria-hidden="true" className="text-destructive"> *</span>
            </span>
            <input id={`abono-fecha-${fila.id}`} name="fecha" type="date" required defaultValue={hoyPanama()} max={hoyPanama()} aria-invalid={faltante === `abono-fecha-${fila.id}` || undefined} className={`${fieldClass} w-full`} />
            <AvisoFaltante id={`abono-fecha-${fila.id}`} faltante={faltante} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>
              Monto (USD)<span aria-hidden="true" className="text-destructive"> *</span>
            </span>
            <input
              id={`abono-monto-${fila.id}`}
              name="monto"
              type="number"
              inputMode="decimal"
              min="0.01"
              max={fila.saldo}
              step="0.01"
              required
              data-enfocar
              defaultValue={fila.saldo.toFixed(2)}
              aria-invalid={faltante === `abono-monto-${fila.id}` || undefined}
              className={`${fieldClass} w-full tabular-nums`}
            />
            <AvisoFaltante id={`abono-monto-${fila.id}`} faltante={faltante} mensaje={`Entre 0,01 y ${usd(fila.saldo)}`} />
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Método</span>
            <select name="metodo" defaultValue="Transferencia" className={`${fieldClass} w-full`}>
              {METODOS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={labelClassSm}>Cuenta</span>
            <select name="cuenta_id" defaultValue="" className={`${fieldClass} w-full`}>
              <option value="">Sin cuenta</option>
              {cuentas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className={labelClassSm}>Referencia</span>
            <input name="referencia" maxLength={120} autoComplete="off" placeholder="Ej: #8470" className={`${fieldClass} w-full`} />
          </label>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <BotonCrear puede={completo} enviando={pendiente} etiqueta="Registrar abono" etiquetaEnviando="Registrando..." alPulsarSinCompletar={señalarFaltante} />
      </form>
    </section>
  );
}

function SeccionEstado({ clase, fila, alTerminar }: { clase: Clase; fila: FilaCartera; alTerminar: () => void }) {
  const { mostrarToast } = useToast();
  const ref = useIrAlPanel();
  const { formRef, completo, faltante, revisar, señalarFaltante } = useFaltantes();
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const opciones: EstadoManual[] = clase === "cobrar" ? ["incobrable", "anulado"] : ["anulado"];
  const idMotivo = `estado-motivo-${fila.id}`;

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = new FormData(e.currentTarget);
    const estado = datos.get("estado") as EstadoManual;
    setError(null);
    empezar(async () => {
      const r = await cambiarEstadoCartera(clase, fila.id, estado, String(datos.get("motivo") ?? "")).catch(() => ({ error: "No se pudo cambiar el estado." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast(`Marcado como ${ETIQUETA_ESTADO[estado].toLowerCase()}`);
        alTerminar();
      }
    });
  }

  return (
    <section ref={ref} aria-labelledby={`estado-${fila.id}`} className="border-t border-border p-5">
      <h3 id={`estado-${fila.id}`} className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <EstadoIcon className="h-4 w-4" />
        {clase === "cobrar" ? "Marcar incobrable o anulado" : "Anular"}
      </h3>
      <form ref={formRef} onSubmit={enviar} onInput={revisar} onChange={revisar} noValidate className="flex flex-col gap-3">
        {opciones.length > 1 ? (
          <fieldset className="m-0 flex flex-wrap gap-4 border-0 p-0">
            <legend className={`${labelClassSm} mb-1`}>Marcar como</legend>
            {opciones.map((o, i) => (
              <label key={o} className="flex items-center gap-2 text-sm">
                <input type="radio" name="estado" value={o} defaultChecked={i === 0} />
                {ETIQUETA_ESTADO[o]}
              </label>
            ))}
          </fieldset>
        ) : (
          <input type="hidden" name="estado" value={opciones[0]} />
        )}
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>
            Motivo<span aria-hidden="true" className="text-destructive"> *</span>
          </span>
          <textarea id={idMotivo} name="motivo" required rows={2} maxLength={300} data-enfocar aria-invalid={faltante === idMotivo || undefined} placeholder="Ej: El cliente cerró y no responde" className={`${fieldClass} w-full resize-y`} />
          <AvisoFaltante id={idMotivo} faltante={faltante} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <BotonCrear puede={completo} enviando={pendiente} etiqueta="Confirmar" etiquetaEnviando="Guardando..." alPulsarSinCompletar={señalarFaltante} />
      </form>
    </section>
  );
}
