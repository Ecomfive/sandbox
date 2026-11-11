"use client";

import { useState, useTransition } from "react";
import { claseCifra } from "@/components/af4/estilos-af4";
import { Badge } from "@/components/ui/badge";
import { mesMedio } from "@/lib/af4/fecha";
import { dinero } from "@/lib/af4/formato";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { ActualizarIcon, CalendarioIcon, CerrarIcon, CheckIcon, ExtractoIcon, FlechaAbajoIcon, FlechaArribaIcon, GastoIcon, PapeleraIcon, TiendaIcon } from "@/lib/nav-icons";
import type { Opcion } from "@/lib/finanzas/cargar-pendientes";
import { ORIGEN_MANUAL, ORIGEN_PEGADO, ORIGENES_ELIMINABLES } from "@/lib/finanzas/movimiento-manual";
import type { FilaMovimiento } from "./def-movimientos";
import { actualizarMovimiento, eliminarMovimiento, obtenerHistorialMovimiento } from "./movimiento-actions";
import { anularMovimiento, restaurarMovimiento } from "./calidad-actions";
import { ComprobantesMovimiento } from "./comprobantes-movimiento";
import { OfrecerRegla } from "./ofrecer-regla";
import { firma } from "@/lib/finanzas/clasificacion";
import { validarRucDv } from "@/lib/finanzas/ruc-panama";
import { dinero as dineroAF4 } from "@/lib/af4/formato";

interface Formulario {
  mes: string;
  fecha_pago: string;
  fecha_servicio: string;
  unidad_id: string;
  tipo_id: string;
  descripcion: string;
  monto: string;
  cuenta_id: string;
  en_eerr: boolean;
  en_flujo: boolean;
  factura_numero: string;
  ruc: string;
}

const desde = (m: FilaMovimiento): Formulario => ({
  mes: m.periodo.slice(0, 7),
  fecha_pago: m.fechaPago ?? "",
  fecha_servicio: m.fechaServicio ?? "",
  unidad_id: m.unidadId,
  tipo_id: m.tipoId ?? "",
  descripcion: m.descripcion,
  monto: m.monto.toFixed(2),
  cuenta_id: m.cuentaId ?? "",
  en_eerr: m.eerr === "Sí",
  en_flujo: m.flujo === "Sí",
  factura_numero: m.facturaNumero ?? "",
  ruc: m.ruc ?? "",
});

const etiquetaOrigen = (origen: string) => (origen === ORIGEN_MANUAL ? "Cargado a mano" : origen === ORIGEN_PEGADO ? "Pegado desde Excel" : origen);

/** Botón de la cabecera para pasar al movimiento anterior o siguiente (apagado con `aria-disabled` para no soltar el foco). */
function BotonNavegar({ texto, icono: Icono, activo, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; activo: boolean; alHacerClic: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!activo}
        onClick={() => activo && alHacerClic()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${activo ? "hover:bg-muted" : "cursor-default opacity-40"}`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

/**
 * Ficha de un movimiento: el panel a la derecha que se abre al pulsar su fila. **La ficha ya es el formulario**: se cambia
 * un dato y arriba aparecen «Guardar cambios» y «Cancelar». Guardar lo deja corregido a mano (reimportar el Excel no lo
 * pisa). «Eliminar» solo aparece en lo cargado en el portal y pide confirmación en la misma ficha. La actividad va al final.
 */
export function FichaMovimiento({
  movimiento,
  orden,
  irA,
  tiendas,
  tipos,
  cuentas,
  puedeEscribir,
  alCerrar,
}: {
  movimiento: FilaMovimiento | undefined;
  orden: string[];
  irA: (id: string) => void;
  tiendas: Opcion[];
  tipos: Opcion[];
  cuentas: Opcion[];
  puedeEscribir: boolean;
  alCerrar: () => void;
}) {
  // La oferta de crear una regla vive aquí: al guardar, el formulario vuelve a montarse con los datos nuevos.
  const [regla, setRegla] = useState<ReglaOfrecida | null>(null);
  if (!movimiento) return null;
  // Con otra `key` el formulario arranca con los datos del movimiento (al pasar a otro o tras guardar).
  const llave = JSON.stringify(desde(movimiento));
  return (
    <Contenido
      regla={regla?.movimientoId === movimiento.id ? regla : null}
      setRegla={setRegla}
      key={`${movimiento.id}-${llave}`}
      m={movimiento}
      orden={orden}
      irA={irA}
      tiendas={tiendas}
      tipos={tipos}
      cuentas={cuentas}
      puedeEscribir={puedeEscribir}
      alCerrar={alCerrar}
    />
  );
}

interface ReglaOfrecida {
  movimientoId: string;
  patron: string;
  unidad: { id: string; nombre: string } | null;
  tipo: { id: string; nombre: string } | null;
}

function Contenido({
  regla,
  setRegla,
  m,
  orden,
  irA,
  tiendas,
  tipos,
  cuentas,
  puedeEscribir,
  alCerrar,
}: {
  m: FilaMovimiento;
  orden: string[];
  irA: (id: string) => void;
  tiendas: Opcion[];
  tipos: Opcion[];
  cuentas: Opcion[];
  puedeEscribir: boolean;
  alCerrar: () => void;
  regla: ReglaOfrecida | null;
  setRegla: (r: ReglaOfrecida | null) => void;
}) {
  const { mostrarToast } = useToast();
  const [motivoAnular, setMotivoAnular] = useState<string | null>(null);
  const [d, setD] = useState<Formulario>(desde(m));
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [version, setVersion] = useState(0);
  const sinGuardar = JSON.stringify(d) !== JSON.stringify(desde(m));
  const cambiar = (c: Partial<Formulario>) => setD((a) => ({ ...a, ...c }));
  const eliminable = ORIGENES_ELIMINABLES.includes(m.origen);

  const indice = orden.indexOf(m.id);
  const anterior = indice > 0 ? orden[indice - 1] : null;
  const siguiente = indice >= 0 && indice < orden.length - 1 ? orden[indice + 1] : null;

  const puedeSalir = () => !pendiente && (!sinGuardar || confirm("Hay cambios sin guardar. ¿Descartarlos?"));

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("id", m.id);
    for (const [k, v] of Object.entries(d)) formData.set(k, typeof v === "boolean" ? (v ? "si" : "") : v);
    empezar(async () => {
      const r = await actualizarMovimiento(formData).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Cambios guardados");
        setVersion((v) => v + 1);
        // Corrigió la tienda o el tipo: ofrece la regla para los próximos.
        const antes = desde(m);
        const cambioTienda = d.unidad_id !== antes.unidad_id;
        const cambioTipo = d.tipo_id !== antes.tipo_id;
        const patron = firma(d.descripcion);
        if ((cambioTienda || cambioTipo) && patron) {
          setRegla({
            movimientoId: m.id,
            patron,
            unidad: cambioTienda ? (tiendas.find((t) => t.id === d.unidad_id) ?? null) : null,
            tipo: cambioTipo ? (tipos.find((t) => t.id === d.tipo_id) ?? null) : null,
          });
        }
      }
    });
  }

  function eliminar() {
    setError(null);
    empezar(async () => {
      const r = await eliminarMovimiento(m.id).catch(() => ({ error: "No se pudo eliminar." }));
      if (r.error) {
        setError(r.error);
        setConfirmando(false);
      } else {
        mostrarToast("Movimiento eliminado");
        alCerrar();
      }
    });
  }

  function anular() {
    setError(null);
    empezar(async () => {
      const r = await anularMovimiento(m.id, motivoAnular ?? "").catch(() => ({ error: "No se pudo anular." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Movimiento anulado");
        setMotivoAnular(null);
        setVersion((v) => v + 1);
      }
    });
  }

  function restaurar() {
    setError(null);
    empezar(async () => {
      const r = await restaurarMovimiento(m.id).catch(() => ({ error: "No se pudo restaurar." }));
      if (r.error) setError(r.error);
      else {
        mostrarToast("Movimiento restaurado");
        setVersion((v) => v + 1);
      }
    });
  }

  const rucValidado = d.ruc.trim() ? validarRucDv(d.ruc) : null;

  // Una tienda o un tipo que ya no está en la lista (SIN ASIGNAR, uno fuera del catálogo) se sigue mostrando.
  const opcionesTienda = tiendas.some((t) => t.id === m.unidadId) ? tiendas : [{ id: m.unidadId, nombre: m.tienda }, ...tiendas];
  const opcionesCuenta = !m.cuentaId || cuentas.some((c) => c.id === m.cuentaId) ? cuentas : [{ id: m.cuentaId, nombre: m.cuenta }, ...cuentas];

  return (
    <Ventana
      abierto
      alCerrar={() => puedeSalir() && alCerrar()}
      lado="derecha"
      ancho="lg"
      titulo={
        <>
          <span className="text-lg font-semibold">Movimiento</span>
          <Badge tone={m.estado === "Clasificado" ? "neutral" : "warning"}>{m.estado}</Badge>
          {m.editado && <Badge tone="info">Corregido a mano</Badge>}
          {m.anulado && <Badge tone="destructive">Anulado</Badge>}
        </>
      }
      navegacion={
        <>
          <BotonNavegar texto="Movimiento anterior" icono={FlechaArribaIcon} activo={!!anterior && !pendiente} alHacerClic={() => anterior && puedeSalir() && irA(anterior)} />
          <BotonNavegar texto="Movimiento siguiente" icono={FlechaAbajoIcon} activo={!!siguiente && !pendiente} alHacerClic={() => siguiente && puedeSalir() && irA(siguiente)} />
        </>
      }
    >
      <form onSubmit={guardar} aria-busy={pendiente} className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-5">
          <p className={`text-[1.375rem] leading-7 font-semibold tracking-tight ${claseCifra}`}>
            {dinero(m.monto, "USD", { decimales: 2 })}
          </p>
          <p className="text-sm text-muted-foreground">
            {mesMedio(m.periodo)} · {etiquetaOrigen(m.origen)}
          </p>
        </div>
        {m.atipico && (
          <p className="flex items-center gap-1.5 px-5 pt-2 text-sm">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
            Monto atípico: {m.atipico.veces}× la mediana de su tipo ({dineroAF4(m.atipico.mediana, "USD", { decimales: 2 })}) en los 6 meses anteriores.
          </p>
        )}
        {m.anulado && m.anuladoMotivo && (
          <p className="flex items-center gap-1.5 px-5 pt-2 text-sm">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
            Anulado: {m.anuladoMotivo}
          </p>
        )}
        {puedeEscribir && (
          <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-col gap-2 border-b border-border bg-card px-5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              {sinGuardar && (
                <>
                  <button type="submit" disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50">
                    <CheckIcon className="h-4 w-4" />
                    {pendiente ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button type="button" onClick={() => setD(desde(m))} disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
                    <CerrarIcon className="h-4 w-4" />
                    Cancelar
                  </button>
                </>
              )}
              {!sinGuardar && !confirmando && motivoAnular === null && !m.anulado && (
                <BotonAccion icono={ExtractoIcon} tono="alerta" disabled={pendiente} onClick={() => setMotivoAnular("Duplicado")}>
                  Anular
                </BotonAccion>
              )}
              {!sinGuardar && m.anulado && (
                <BotonAccion icono={ActualizarIcon} disabled={pendiente} onClick={restaurar}>
                  Restaurar
                </BotonAccion>
              )}
              {motivoAnular !== null && (
                <div role="group" aria-label="Anular movimiento" className="flex flex-wrap items-end gap-2 text-sm">
                  <label className="flex flex-col gap-1">
                    <span className={labelClassSm}>Motivo</span>
                    <input value={motivoAnular} onChange={(e) => setMotivoAnular(e.target.value)} maxLength={300} data-enfocar className={`${fieldClass} w-56`} />
                  </label>
                  <button type="button" onClick={anular} disabled={pendiente} className="rounded-md bg-warning px-3 py-2 font-medium text-background hover:bg-warning/85 disabled:opacity-50">
                    {pendiente ? "Anulando..." : "Anular"}
                  </button>
                  <button type="button" onClick={() => setMotivoAnular(null)} disabled={pendiente} className="rounded-md border border-border px-3 py-2 hover:bg-muted">
                    No
                  </button>
                </div>
              )}
              {eliminable && !sinGuardar && !confirmando && motivoAnular === null && (
                <BotonAccion icono={PapeleraIcon} tono="peligro" disabled={pendiente} onClick={() => setConfirmando(true)}>
                  Eliminar
                </BotonAccion>
              )}
              {confirmando && (
                <div role="group" aria-label="Confirmar eliminación" className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-destructive" />
                    ¿Eliminar este movimiento?
                  </span>
                  <button type="button" onClick={eliminar} disabled={pendiente} data-enfocar className="rounded-md bg-destructive px-3 py-1.5 font-medium text-background hover:bg-destructive/85 disabled:opacity-50">
                    {pendiente ? "Eliminando..." : "Sí, eliminar"}
                  </button>
                  <button type="button" onClick={() => setConfirmando(false)} disabled={pendiente} className="rounded-md border border-border px-3 py-1.5 hover:bg-muted">
                    No
                  </button>
                </div>
              )}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
        )}

        {puedeEscribir && regla && <OfrecerRegla key={`${regla.patron}-${regla.unidad?.id}-${regla.tipo?.id}`} patronInicial={regla.patron} unidad={regla.unidad} tipo={regla.tipo} alCerrar={() => setRegla(null)} />}

        <fieldset disabled={!puedeEscribir} className="m-0 flex min-w-0 flex-col divide-y divide-border border-0 p-5">
          <Seccion icono={TiendaIcon} titulo="Movimiento">
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Tienda</span>
              <select value={d.unidad_id} onChange={(e) => cambiar({ unidad_id: e.target.value })} className={`${fieldClass} w-full`}>
                {opcionesTienda.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Tipo</span>
              <select value={d.tipo_id} onChange={(e) => cambiar({ tipo_id: e.target.value })} required className={`${fieldClass} w-full`}>
                {!d.tipo_id && (
                  <option value="" disabled>
                    {m.tipo !== "—" ? `${m.tipo} (fuera del catálogo)` : "Elegir tipo"}
                  </option>
                )}
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Descripción</span>
              <textarea value={d.descripcion} onChange={(e) => cambiar({ descripcion: e.target.value })} required rows={2} maxLength={500} className={`${fieldClass} w-full resize-y`} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Monto (USD)</span>
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                value={d.monto}
                onChange={(e) => cambiar({ monto: e.target.value })}
                className={`${fieldClass} w-full tabular-nums`}
              />
            </label>
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Fechas y pago">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Mes del EERR</span>
                <input type="month" required value={d.mes} onChange={(e) => cambiar({ mes: e.target.value })} className={`${fieldClass} w-full`} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Fecha de pago</span>
                <input type="date" value={d.fecha_pago} onChange={(e) => cambiar({ fecha_pago: e.target.value })} className={`${fieldClass} w-full`} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>Prestación</span>
                <input type="date" value={d.fecha_servicio} onChange={(e) => cambiar({ fecha_servicio: e.target.value })} className={`${fieldClass} w-full`} />
              </label>
            </div>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Forma de pago</span>
              <select value={d.cuenta_id} onChange={(e) => cambiar({ cuenta_id: e.target.value })} className={`${fieldClass} w-full`}>
                <option value="">Sin forma de pago</option>
                {opcionesCuenta.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
          </Seccion>
          <Seccion icono={ExtractoIcon} titulo="Factura">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>N° de factura</span>
                <input value={d.factura_numero} onChange={(e) => cambiar({ factura_numero: e.target.value })} maxLength={80} placeholder="Ej: 001-0001234" className={`${fieldClass} w-full`} />
              </label>
              <label className="flex flex-col gap-1">
                <span className={labelClassSm}>RUC del proveedor</span>
                <input
                  value={d.ruc}
                  onChange={(e) => cambiar({ ruc: e.target.value })}
                  maxLength={40}
                  placeholder="Ej: 1000-200-3000 DV 60"
                  aria-invalid={rucValidado?.error ? true : undefined}
                  aria-describedby={rucValidado ? `ruc-${m.id}` : undefined}
                  className={`${fieldClass} w-full`}
                />
                {rucValidado && (
                  <span id={`ruc-${m.id}`} className="flex items-center gap-1.5 text-xs">
                    <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${rucValidado.error ? "bg-destructive" : "bg-success"}`} />
                    {rucValidado.error ?? `DV ${rucValidado.dv}`}
                  </span>
                )}
              </label>
            </div>
          </Seccion>
          <Seccion icono={GastoIcon} titulo="Dónde entra">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={d.en_eerr} onChange={(e) => cambiar({ en_eerr: e.target.checked })} className="h-4 w-4" />
              Entra al Estado de resultados
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={d.en_flujo} onChange={(e) => cambiar({ en_flujo: e.target.checked })} className="h-4 w-4" />
              Entra al flujo de caja
            </label>
          </Seccion>
        </fieldset>

        <div className="border-t border-border px-5">
          <ComprobantesMovimiento movimientoId={m.id} puedeEscribir={puedeEscribir} />
        </div>

        <HistorialGenerico id={m.id} codigoPais="PA" version={version} obtener={obtenerHistorialMovimiento} />
      </form>
    </Ventana>
  );
}
