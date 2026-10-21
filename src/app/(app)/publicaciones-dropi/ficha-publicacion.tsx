"use client";

/* eslint-disable @next/next/no-img-element -- foto de Storage */
import { useState, useTransition } from "react";
import { BloqueCompetencia } from "@/components/competencia/piezas-competencia";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { CerrarIcon, CheckIcon, EstadoIcon, FlechaAbajoIcon, FlechaArribaIcon, InteligenciaIcon, InventarioIcon, MargenIcon, PapeleraIcon, PersonaIcon, ProductoIcon } from "@/lib/nav-icons";
import {
  DIAS_REVISION,
  ESTADOS,
  ESTADOS_PUBLICACION,
  ESTADOS_REPOSICION,
  ESTADOS_VENTA,
  MARGEN_BAJO,
  TIPOS,
  UBICACIONES,
  numeroPublicacion,
  opcion,
  type OpcionPublicacion,
} from "@/lib/publicaciones/publicacion";
import { actualizarPublicacion, eliminarPublicacion, obtenerHistorialPublicacion } from "./actions";
import type { FilaPublicacion } from "./def-publicaciones";
import { VentasEnDropi } from "./ventas-publicacion";
import { VinculoSku } from "./vinculo-sku";

export interface Persona {
  id: string;
  nombre: string;
}

interface Formulario {
  nombre: string;
  dropi_id: string;
  estado: string;
  estado_publicacion: string;
  tipo_publicacion: string;
  privatizado_a: string;
  privatizado_email: string;
  precio_venta: string;
  costo_mercancia: string;
  fulfillment: string;
  coste_real: string;
  estado_venta: string;
  ubicacion: string;
  estado_reposicion: string;
  competencia: string;
  fecha_publicacion: string;
  ultima_revision: string;
  ultimo_cambio_precio: string;
  responsable_id: string;
  notas: string;
}

const t = (n: number | null) => (n === null ? "" : String(n));
const desde = (p: FilaPublicacion): Formulario => ({
  nombre: p.nombre,
  dropi_id: p.dropiId,
  estado: p.estado,
  estado_publicacion: p.estadoPublicacion ?? "",
  tipo_publicacion: p.tipo ?? "",
  privatizado_a: p.privatizadoA,
  privatizado_email: p.privatizadoEmail,
  precio_venta: t(p.precioVenta),
  costo_mercancia: t(p.costoMercancia),
  fulfillment: t(p.fulfillment),
  coste_real: t(p.costeReal),
  estado_venta: p.estadoVenta ?? "",
  ubicacion: p.ubicacion ?? "",
  estado_reposicion: p.estadoReposicion ?? "",
  competencia: p.competencia === null ? "" : p.competencia ? "si" : "no",
  fecha_publicacion: p.fechaPublicacion ?? "",
  ultima_revision: p.ultimaRevision ?? "",
  ultimo_cambio_precio: p.ultimoCambioPrecio ?? "",
  responsable_id: p.responsableId ?? "",
  notas: p.notas,
});

const n = (s: string) => (s.trim() === "" ? null : Number(s));
const usd = (v: number | null) => (v === null || !Number.isFinite(v) ? "—" : `$${v.toFixed(2)}`);
const masDias = (f: string, dias: number) => {
  const d = new Date(`${f}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric" });
};

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


function Selector({ valor, lista, cambiar, nombre, vacio = "—" }: { valor: string; lista: OpcionPublicacion[]; cambiar: (v: string) => void; nombre: string; vacio?: string }) {
  return (
    <select aria-label={nombre} value={valor} onChange={(e) => cambiar(e.target.value)} className={`${fieldClass} w-full`}>
      <option value="">{vacio}</option>
      {lista.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  );
}

/**
 * Ficha de una publicación: el panel a la derecha que se abre al pulsar su fila. **La ficha ya es el formulario**: se cambia
 * un dato y arriba aparecen «Guardar cambios» y «Cancelar»; al guardar, la ficha sigue abierta. Utilidad,
 * margen y próxima revisión se calculan solos. Con cambios sin guardar, cerrar o pasar a otra pide confirmación.
 */
export function FichaPublicacion({
  publicacion,
  personas,
  codigoPais,
  puedeEscribir,
  puedeEliminar,
  corteVentas = null,
  anterior,
  siguiente,
  alCerrar,
}: {
  publicacion: FilaPublicacion | undefined;
  personas: Persona[];
  codigoPais: string;
  puedeEscribir: boolean;
  /** Solo un administrador: elimina la publicación de verdad. */
  puedeEliminar: boolean;
  /** Hasta qué día llegan las ventas de Dropi (solo un administrador las ve); `null` si no se muestran. */
  corteVentas?: string | null;
  anterior?: () => void;
  siguiente?: () => void;
  alCerrar: () => void;
}) {
  if (!publicacion) return null;
  return (
    <ContenidoFicha
      key={publicacion.id}
      p={publicacion}
      personas={personas}
      codigoPais={codigoPais}
      puedeEscribir={puedeEscribir}
      puedeEliminar={puedeEliminar}
      corteVentas={corteVentas}
      anterior={anterior}
      siguiente={siguiente}
      alCerrar={alCerrar}
    />
  );
}

function ContenidoFicha({
  p,
  personas,
  codigoPais,
  puedeEscribir,
  puedeEliminar,
  corteVentas,
  anterior,
  siguiente,
  alCerrar,
}: {
  p: FilaPublicacion;
  personas: Persona[];
  codigoPais: string;
  puedeEscribir: boolean;
  puedeEliminar: boolean;
  corteVentas: string | null;
  anterior?: () => void;
  siguiente?: () => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [d, setD] = useState<Formulario>(desde(p));
  // Lo último guardado (o lo que llegó del servidor): con eso se compara para saber si hay cambios sin guardar. Al guardar no se
  // rearma la ficha (antes cambiaba su clave y parecía que se cerraba): cuando llegan los datos nuevos, el formulario los toma
  // solo si no hay cambios a medio escribir.
  const actual = JSON.stringify(desde(p));
  const [base, setBase] = useState(actual);
  const [recibido, setRecibido] = useState(actual);
  if (actual !== recibido) {
    setRecibido(actual);
    if (JSON.stringify(d) === base) setD(desde(p));
    setBase(actual);
  }
  const [pendiente, empezar] = useTransition();
  // Eliminar va aparte: así, mientras termina de guardar, el botón no dice «Eliminando...».
  const [eliminando, setEliminando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const sinGuardar = JSON.stringify(d) !== base;
  const cambiar = (c: Partial<Formulario>) => setD((a) => ({ ...a, ...c }));
  const estado = opcion(ESTADOS, p.estado);

  const precio = n(d.precio_venta);
  const utilidad = precio === null ? null : precio - (n(d.costo_mercancia) ?? 0) - (n(d.fulfillment) ?? 0);
  const margen = precio && utilidad !== null ? utilidad / precio : null;

  const salir = (accion: () => void) => {
    if (pendiente) return;
    if (sinGuardar && !confirm("Hay cambios sin guardar. ¿Descartarlos?")) return;
    accion();
  };

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const formData = new FormData();
    formData.set("id", p.id);
    for (const [k, v] of Object.entries(d)) formData.set(k, v);
    empezar(async () => {
      const r = await actualizarPublicacion(formData).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if (r.error) setError(r.error);
      else {
        setBase(JSON.stringify(d));
        mostrarToast("Cambios guardados");
        setVersion((v) => v + 1);
      }
    });
  }

  function eliminar() {
    if (!confirm(`¿Eliminar "${p.nombre}"? No se puede deshacer.`)) return;
    setError(null);
    setEliminando(true);
    empezar(async () => {
      const r = await eliminarPublicacion(p.id).catch(() => ({ error: "No se pudo eliminar. Inténtalo de nuevo." }));
      setEliminando(false);
      if (r.error) setError(r.error);
      else {
        mostrarToast("Publicación eliminada");
        alCerrar();
      }
    });
  }

  return (
    <Ventana
      abierto
      alCerrar={() => salir(alCerrar)}
      lado="derecha"
      ancho="lg"
      titulo={
        <>
          <span className="text-sm font-medium text-muted-foreground tabular-nums">{numeroPublicacion(p.numero)}</span>
          <span className="text-lg font-semibold">{p.nombre}</span>
          {estado && <Badge color={estado.color}>{estado.etiqueta}</Badge>}
        </>
      }
      navegacion={
        <>
          <BotonNavegar texto="Publicación anterior" icono={FlechaArribaIcon} activo={!!anterior && !pendiente} alHacerClic={() => anterior && salir(anterior)} />
          <BotonNavegar texto="Publicación siguiente" icono={FlechaAbajoIcon} activo={!!siguiente && !pendiente} alHacerClic={() => siguiente && salir(siguiente)} />
        </>
      }
    >
      <form onSubmit={guardar} aria-busy={pendiente} className="flex flex-1 flex-col">
        {puedeEscribir && (
          <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-col gap-2 border-y border-border bg-card px-5 py-3">
            <div className="flex flex-wrap gap-2">
              {sinGuardar && (
                <>
                  <button type="submit" disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background hover:bg-foreground/85 disabled:opacity-50">
                    <CheckIcon className="h-4 w-4" />
                    {pendiente ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button type="button" onClick={() => setD(JSON.parse(base) as Formulario)} disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
                    <CerrarIcon className="h-4 w-4" />
                    Cancelar
                  </button>
                </>
              )}
              {!sinGuardar && puedeEliminar && (
                <BotonAccion icono={PapeleraIcon} tono="peligro" disabled={pendiente} onClick={eliminar}>
                  {eliminando ? "Eliminando..." : "Eliminar"}
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

        <div className="border-b border-border px-5 py-5">
          <Seccion icono={InventarioIcon} titulo="Producto vinculado (SKU)">
            <VinculoSku p={p} puedeEscribir={puedeEscribir} siguiente={siguiente} />
          </Seccion>
        </div>

        <fieldset disabled={!puedeEscribir} className="m-0 flex min-w-0 flex-col divide-y divide-border border-0 p-5">
          <Seccion icono={ProductoIcon} titulo="Producto">
            <div className="flex gap-4">
              {p.fotoUrl ? <img src={p.fotoUrl} alt={p.nombre} className="h-24 w-24 shrink-0 rounded-lg border border-border object-cover" /> : <span aria-hidden="true" className="h-24 w-24 shrink-0 rounded-lg border border-dashed border-border-control" />}
              <div className="grid min-w-0 flex-1 gap-3">
                <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Nombre en Dropi</span>
                  <input value={d.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} required maxLength={300} className={`${fieldClass} w-full`} />
                </label>
                <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>ID en Dropi</span>
                  <input value={d.dropi_id} onChange={(e) => cambiar({ dropi_id: e.target.value })} maxLength={60} placeholder="Ej: 11144" className={`${fieldClass} w-full tabular-nums`} />
                </label>
              </div>
            </div>
            {p.relacionados.length > 0 && <p className="text-sm text-muted-foreground">Relacionado con: {p.relacionados.join(" · ")}</p>}
          </Seccion>

          <Seccion icono={EstadoIcon} titulo="Estado">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Estado</span>
                <select value={d.estado} onChange={(e) => cambiar({ estado: e.target.value })} className={`${fieldClass} w-full`}>
                  {ESTADOS.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.etiqueta}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex min-w-0 flex-col gap-1">
                <span aria-hidden="true" className={labelClassSm}>En Dropi</span>
                <Selector nombre="En Dropi" valor={d.estado_publicacion} lista={ESTADOS_PUBLICACION} cambiar={(v) => cambiar({ estado_publicacion: v })} />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span aria-hidden="true" className={labelClassSm}>Tipo</span>
                <Selector nombre="Tipo" valor={d.tipo_publicacion} lista={TIPOS} cambiar={(v) => cambiar({ tipo_publicacion: v })} />
              </div>
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Fecha de publicación</span>
                <input type="date" value={d.fecha_publicacion} onChange={(e) => cambiar({ fecha_publicacion: e.target.value })} className={`${fieldClass} w-full`} />
              </label>
              {d.tipo_publicacion === "privado" && (
                <>
                  <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Privatizado a</span>
                    <input value={d.privatizado_a} onChange={(e) => cambiar({ privatizado_a: e.target.value })} maxLength={120} placeholder="Ej: Jorge Reyes" className={`${fieldClass} w-full`} />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Correo del dropshipper</span>
                    <input type="email" value={d.privatizado_email} onChange={(e) => cambiar({ privatizado_email: e.target.value })} maxLength={200} placeholder="Ej: nombre@correo.com" className={`${fieldClass} w-full`} />
                  </label>
                </>
              )}
            </div>
          </Seccion>

          <Seccion icono={MargenIcon} titulo="Precio y margen">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Precio de venta</span>
                <input type="number" min={0} step="0.01" value={d.precio_venta} onChange={(e) => cambiar({ precio_venta: e.target.value })} placeholder="Ej: 9.99" className={`${fieldClass} w-full tabular-nums`} />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Costo mercancía</span>
                <input type="number" min={0} step="0.01" value={d.costo_mercancia} onChange={(e) => cambiar({ costo_mercancia: e.target.value })} placeholder="Ej: 1.16" className={`${fieldClass} w-full tabular-nums`} />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Fulfillment</span>
                <input type="number" min={0} step="0.01" value={d.fulfillment} onChange={(e) => cambiar({ fulfillment: e.target.value })} placeholder="Ej: 1.50" className={`${fieldClass} w-full tabular-nums`} />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Coste real (última compra)</span>
                <input type="number" min={0} step="0.01" value={d.coste_real} onChange={(e) => cambiar({ coste_real: e.target.value })} placeholder="Ej: 0.97" className={`${fieldClass} w-full tabular-nums`} />
              </label>
            </div>
            <dl className="grid grid-cols-3 gap-3 rounded-lg bg-muted px-4 py-3 text-sm tabular-nums">
              <div>
                <dt className="text-xs text-muted-foreground">Utilidad bruta</dt>
                <dd className="font-semibold">{usd(utilidad)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Margen bruto</dt>
                <dd className="flex items-center gap-1.5 font-semibold">
                  {margen !== null && margen < MARGEN_BAJO && <span role="img" aria-label="Margen bajo" className="h-2 w-2 rounded-full bg-destructive" />}
                  {margen === null ? "—" : `${Math.round(margen * 100)} %`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Último cambio de precio</dt>
                <dd>
                  <input type="date" aria-label="Último cambio de precio" value={d.ultimo_cambio_precio} onChange={(e) => cambiar({ ultimo_cambio_precio: e.target.value })} className={`${fieldClass} w-full !px-2 !py-1 text-xs`} />
                </dd>
              </div>
            </dl>
          </Seccion>

          {p.ventas && corteVentas && (
            <Seccion icono={MargenIcon} titulo="Ventas en Dropi">
              <VentasEnDropi v={p.ventas} corte={corteVentas} />
            </Seccion>
          )}

          <Seccion icono={InventarioIcon} titulo="Venta y stock">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <span aria-hidden="true" className={labelClassSm}>Estado de venta</span>
                <Selector nombre="Estado de venta" valor={d.estado_venta} lista={ESTADOS_VENTA} cambiar={(v) => cambiar({ estado_venta: v })} />
                {p.ventas && (
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    Según Dropi: <b className="font-medium text-foreground">{opcion(ESTADOS_VENTA, p.ventas.estadoSugerido)?.etiqueta}</b>
                    {puedeEscribir && d.estado_venta !== p.ventas.estadoSugerido && (
                      <button type="button" onClick={() => p.ventas && cambiar({ estado_venta: p.ventas.estadoSugerido })} className={`rounded border border-primario/40 bg-primario-suave px-1.5 py-0.5 font-medium text-primario hover:border-primario ${anilloFoco}`}>
                        Usar
                      </button>
                    )}
                  </span>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span aria-hidden="true" className={labelClassSm}>Dónde está</span>
                <Selector nombre="Dónde está" valor={d.ubicacion} lista={UBICACIONES} cambiar={(v) => cambiar({ ubicacion: v })} />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span aria-hidden="true" className={labelClassSm}>Reposición</span>
                <Selector nombre="Reposición" valor={d.estado_reposicion} lista={ESTADOS_REPOSICION} cambiar={(v) => cambiar({ estado_reposicion: v })} />
              </div>
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Competencia en Dropi</span>
                <select value={d.competencia} onChange={(e) => cambiar({ competencia: e.target.value })} className={`${fieldClass} w-full`}>
                  <option value="">Sin revisar</option>
                  <option value="si">Sí</option>
                  <option value="no">No</option>
                </select>
              </label>
            </div>
          </Seccion>

          {/* La competencia del producto vinculado: los mismos datos que se ven en su ficha de Producto y en Compras. Un compuesto no la tiene. */}
          {p.sku && p.sku.tipo !== "combo" && (
            <Seccion icono={InteligenciaIcon} titulo="Competencia del producto">
              <BloqueCompetencia key={p.sku.id} skuId={p.sku.id} />
            </Seccion>
          )}

          <Seccion icono={PersonaIcon} titulo="Revisión">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Última revisión</span>
                <input type="date" value={d.ultima_revision} onChange={(e) => cambiar({ ultima_revision: e.target.value })} className={`${fieldClass} w-full`} />
              </label>
              <div className="flex flex-col gap-1">
                <span className={labelClassSm}>Próxima revisión</span>
                <span className="flex items-center gap-1.5 py-2 text-sm tabular-nums">
                  {p.revisionVencida && d.ultima_revision === (p.ultimaRevision ?? "") && <span role="img" aria-label="Revisión vencida" className="h-2 w-2 rounded-full bg-warning" />}
                  {d.ultima_revision ? masDias(d.ultima_revision, DIAS_REVISION) : "Sin revisar"}
                </span>
              </div>
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Responsable</span>
                <select value={d.responsable_id} onChange={(e) => cambiar({ responsable_id: e.target.value })} className={`${fieldClass} w-full`}>
                  <option value="">Sin responsable</option>
                  {personas.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.nombre}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Notas</span>
              <textarea value={d.notas} onChange={(e) => cambiar({ notas: e.target.value })} rows={4} maxLength={5000} placeholder="Ej: competencia en Dropi, por qué se bajó el precio…" className={`${fieldClass} w-full resize-y`} />
            </label>
          </Seccion>
        </fieldset>

        <HistorialGenerico id={p.id} codigoPais={codigoPais} version={version} obtener={obtenerHistorialPublicacion} />
      </form>
    </Ventana>
  );
}
