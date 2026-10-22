"use client";

/* eslint-disable @next/next/no-img-element -- foto de Storage */
import { useEffect, useRef, useState, useTransition } from "react";
import { BloqueCompetencia } from "@/components/competencia/piezas-competencia";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { CerrarIcon, CheckIcon, ComprasIcon, EstadoIcon, FlechaAbajoIcon, FlechaArribaIcon, InteligenciaIcon, InventarioIcon, LapizIcon, MargenIcon, PapeleraIcon, ProductoIcon } from "@/lib/nav-icons";
import {
  UBICACIONES,
  numeroPublicacion,
  type OpcionPublicacion,
} from "@/lib/publicaciones/publicacion";
import { EnCaminoProducto } from "../producto/en-camino-producto";
import { actualizarPublicacion, eliminarPublicacion, obtenerHistorialPublicacion } from "./actions";
import type { FilaPublicacion } from "./def-publicaciones";
import { VentasEnDropi } from "./ventas-publicacion";
import { ACCIONES, EN_DROPI } from "@/lib/publicaciones/automatico";
import { OptimizacionFicha } from "./optimizacion-publicacion";
import { RecomendacionesFicha } from "./recomendacion-publicacion";
import { FichaProductoEmbebida } from "../producto/ficha-producto-embebida";
import { InsigniaConectado } from "./insignia-conectado";
import { VinculoSku } from "./vinculo-sku";

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
const fechaLarga = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Panama" });
const usd = (v: number | null) => (v === null || !Number.isFinite(v) ? "—" : `$${v.toFixed(2)}`);

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
 * un dato y arriba aparecen «Guardar cambios» y «Cancelar». Utilidad y
 * margen se calculan solos. Con cambios sin guardar, cerrar o pasar a otra pide confirmación.
 */
export function FichaPublicacion({
  publicacion,
  codigoPais,
  nombrePais,
  puedeEscribir,
  puedeEliminar,
  corteVentas = null,
  margenMinimo,
  decisionesDisponibles,
  anterior,
  siguiente,
  alCerrar,
}: {
  publicacion: FilaPublicacion | undefined;
  codigoPais: string;
  nombrePais: string;
  puedeEscribir: boolean;
  /** Solo un administrador: elimina la publicación de verdad. */
  puedeEliminar: boolean;
  /** Hasta qué día llegan las ventas de Dropi (solo un administrador las ve); `null` si no se muestran. */
  corteVentas?: string | null;
  /** El margen mínimo de las reglas: por debajo, el punto rojo. */
  margenMinimo: number;
  /** false si falta la migración 0127: las recomendaciones se ven pero no se pueden decidir. */
  decisionesDisponibles: boolean;
  anterior?: () => void;
  siguiente?: () => void;
  alCerrar: () => void;
}) {
  if (!publicacion) return null;
  return (
    <ContenidoFicha
      key={JSON.stringify(desde(publicacion)) + publicacion.id}
      p={publicacion}
      codigoPais={codigoPais}
      nombrePais={nombrePais}
      puedeEscribir={puedeEscribir}
      puedeEliminar={puedeEliminar}
      corteVentas={corteVentas}
      margenMinimo={margenMinimo}
      decisionesDisponibles={decisionesDisponibles}
      anterior={anterior}
      siguiente={siguiente}
      alCerrar={alCerrar}
    />
  );
}

function ContenidoFicha({
  p,
  codigoPais,
  nombrePais,
  puedeEscribir,
  puedeEliminar,
  corteVentas,
  margenMinimo,
  decisionesDisponibles,
  anterior,
  siguiente,
  alCerrar,
}: {
  p: FilaPublicacion;
  codigoPais: string;
  nombrePais: string;
  puedeEscribir: boolean;
  puedeEliminar: boolean;
  corteVentas: string | null;
  margenMinimo: number;
  decisionesDisponibles: boolean;
  anterior?: () => void;
  siguiente?: () => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [d, setD] = useState<Formulario>(desde(p));
  const [pendiente, empezar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // La ficha del producto vinculado, abierta encima de esta (no lleva al módulo Producto).
  const [productoAbierto, setProductoAbierto] = useState<string | null>(null);
  // Con un ID de Dropi guardado la publicación está conectada y el ID queda bloqueado hasta pulsar el lápiz (al guardar, la ficha se
  // vuelve a montar y vuelve a quedar bloqueado).
  const [editandoId, setEditandoId] = useState(false);
  const conectado = p.dropiId.trim() !== "";
  const idBloqueado = conectado && !editandoId;
  const campoId = useRef<HTMLInputElement>(null);
  // Al desbloquear con el lápiz, el cursor entra en el campo.
  useEffect(() => {
    if (editandoId) campoId.current?.focus();
  }, [editandoId]);
  const sinGuardar = JSON.stringify(d) !== JSON.stringify(desde(p));
  const cambiar = (c: Partial<Formulario>) => setD((a) => ({ ...a, ...c }));

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
        mostrarToast("Cambios guardados");
        setVersion((v) => v + 1);
      }
    });
  }

  function eliminar() {
    if (!confirm(`¿Eliminar "${p.nombre}"? No se puede deshacer.`)) return;
    setError(null);
    empezar(async () => {
      const r = await eliminarPublicacion(p.id).catch(() => ({ error: "No se pudo eliminar. Inténtalo de nuevo." }));
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
          {p.archivada ? (
            <Badge color="#8d8d8d">Archivada</Badge>
          ) : (
            (p.acciones.length ? p.acciones : (["al_dia"] as const)).map((v) => {
              const o = ACCIONES.find((x) => x.valor === v);
              return o ? (
                <Badge key={v} color={o.color}>
                  {o.etiqueta}
                </Badge>
              ) : null;
            })
          )}
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
                  <button type="button" onClick={() => setD(desde(p))} disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
                    <CerrarIcon className="h-4 w-4" />
                    Cancelar
                  </button>
                </>
              )}
              {!sinGuardar && puedeEliminar && (
                <BotonAccion icono={PapeleraIcon} tono="peligro" disabled={pendiente} onClick={eliminar}>
                  {pendiente ? "Eliminando..." : "Eliminar"}
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
            <VinculoSku p={p} puedeEscribir={puedeEscribir} siguiente={siguiente} alAbrirProducto={setProductoAbierto} />
          </Seccion>
        </div>

        <RecomendacionesFicha p={p} puedeEscribir={puedeEscribir} disponible={decisionesDisponibles} />
        {!p.archivada && <OptimizacionFicha p={p} />}

        <fieldset disabled={!puedeEscribir} className="m-0 flex min-w-0 flex-col divide-y divide-border border-0 p-5">
          <Seccion icono={ProductoIcon} titulo="Producto">
            <div className="flex gap-4">
              {p.fotoUrl ? <img src={p.fotoUrl} alt={p.nombre} className="h-24 w-24 shrink-0 rounded-lg border border-border object-cover" /> : <span aria-hidden="true" className="h-24 w-24 shrink-0 rounded-lg border border-dashed border-border-control" />}
              <div className="grid min-w-0 flex-1 gap-3">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={labelClassSm}>Nombre en Dropi</span>
                  {/* Viene de Dropi: no se edita. Cambia solo cuando Dropi trae otro nombre para el mismo ID (al volver a vincular). */}
                  <input value={d.nombre} readOnly className={`${fieldClass} w-full cursor-default bg-muted text-muted-foreground`} />
                </label>
                <div className="flex min-w-0 flex-col gap-1.5">
                  {conectado && (
                    <div className="flex">
                      <InsigniaConectado />
                    </div>
                  )}
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className={labelClassSm}>ID en Dropi</span>
                    <span className="flex items-center gap-1.5">
                      <input
                        ref={campoId}
                        value={d.dropi_id}
                        onChange={(e) => cambiar({ dropi_id: e.target.value })}
                        readOnly={idBloqueado}
                        maxLength={60}
                        placeholder="Ej: 11144"
                        className={`${fieldClass} min-w-0 flex-1 tabular-nums ${idBloqueado ? "cursor-default bg-muted text-muted-foreground" : ""}`}
                      />
                      {idBloqueado && (
                        <Tooltip texto="Corregir el ID">
                          <button
                            type="button"
                            aria-label="Corregir el ID de Dropi"
                            onClick={() => setEditandoId(true)}
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted ${anilloFoco}`}
                          >
                            <LapizIcon className="h-4 w-4" />
                          </button>
                        </Tooltip>
                      )}
                    </span>
                  </label>
                </div>
              </div>
            </div>
            {p.relacionados.length > 0 && <p className="text-sm text-muted-foreground">Relacionado con: {p.relacionados.join(" · ")}</p>}
          </Seccion>

          <Seccion icono={EstadoIcon} titulo="Estado">
            {!p.archivada && (
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                {(p.acciones.length ? p.acciones : (["al_dia"] as const)).map((v) => {
                  const o = ACCIONES.find((x) => x.valor === v);
                  return o ? (
                    <li key={v} className="flex flex-wrap items-center gap-2">
                      <Badge color={o.color}>{o.etiqueta}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {v === "bajar_precio" && p.competidorMasBarato ? `${p.competidorMasBarato.proveedor} lo vende a ${usd(p.competidorMasBarato.precio)}` : o.detalle}
                      </span>
                    </li>
                  ) : null;
                })}
              </ul>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Ya no se marcan a mano (21 oct 2026): salen de lo que reporta Dropi. */}
              <div className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>En Dropi</span>
                <span className="text-sm">{EN_DROPI.find((e) => e.valor === p.enDropi)?.etiqueta ?? "—"}</span>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Tipo</span>
                <span className="text-sm">{p.tipoDropi === "privado" ? "Privado" : p.tipoDropi === "publico" ? "Público" : "—"}</span>
              </div>
              {/* Ya no se anota (21 oct 2026): sale de Dropi. Por ahora, la primera venta de la carga de Ventas Dropi; sin ventas,
                  la fecha que estaba anotada. */}
              <div className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Fecha de publicación</span>
                <span className="text-sm">
                  {p.ventas?.primeraVenta ? (
                    <>
                      Se vende desde el {fechaLarga(p.ventas.primeraVenta)}
                      <span className="block text-xs text-muted-foreground">primera venta en Dropi</span>
                    </>
                  ) : p.fechaPublicacion ? (
                    <>
                      {fechaLarga(p.fechaPublicacion)}
                      <span className="block text-xs text-muted-foreground">anotada · todavía sin ventas en Dropi</span>
                    </>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
              {(p.tipoDropi === "privado" || !!d.privatizado_a) && (
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
                <span className={labelClassSm}>Costo de producto</span>
                <input type="number" min={0} step="0.01" value={d.costo_mercancia} onChange={(e) => cambiar({ costo_mercancia: e.target.value })} placeholder="Ej: 1.16" className={`${fieldClass} w-full tabular-nums`} />
              </label>
              <label className="flex min-w-0 flex-col gap-1">
                <span className={labelClassSm}>Fulfillment</span>
                <input type="number" min={0} step="0.01" value={d.fulfillment} onChange={(e) => cambiar({ fulfillment: e.target.value })} placeholder="Ej: 1.50" className={`${fieldClass} w-full tabular-nums`} />
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
                  {margen !== null && margen < margenMinimo && <span role="img" aria-label="Margen bajo" className="h-2 w-2 rounded-full bg-destructive" />}
                  {margen === null ? "—" : `${Math.round(margen * 100)} %`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Último cambio de precio</dt>
                {/* Lo detecta la lectura del catálogo de Dropi (Análisis de competencia): ya no se anota a mano. */}
                <dd className="text-xs">
                  {p.cambioPrecioDropi ? (
                    <>
                      <span className="block font-semibold">{fechaLarga(p.cambioPrecioDropi.fecha)}</span>
                      <span className="block text-muted-foreground">
                        de {usd(p.cambioPrecioDropi.antes)} a {usd(p.cambioPrecioDropi.despues)} en Dropi
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="block">{p.lecturaDropiDesde ? `Sin cambios en Dropi desde el ${fechaLarga(p.lecturaDropiDesde)}` : "Sin datos de Dropi"}</span>
                      {p.ultimoCambioPrecio && <span className="block text-muted-foreground">Antes: {fechaLarga(p.ultimoCambioPrecio)}</span>}
                    </>
                  )}
                </dd>
              </div>
            </dl>
          </Seccion>

          {p.ventas && corteVentas && (
            <Seccion icono={MargenIcon} titulo="Ventas en Dropi">
              <VentasEnDropi v={p.ventas} corte={corteVentas} />
            </Seccion>
          )}

          <Seccion icono={InventarioIcon} titulo="Stock">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <span aria-hidden="true" className={labelClassSm}>Dónde está</span>
                <Selector nombre="Dónde está" valor={d.ubicacion} lista={UBICACIONES} cambiar={(v) => cambiar({ ubicacion: v })} />
              </div>
            </div>
          </Seccion>

          {/* Lo que viene en camino del producto vinculado: solo unidades, del país seleccionado (las órdenes que ya salieron y no han llegado). */}
          {p.sku && p.sku.tipo !== "combo" && (
            <Seccion icono={ComprasIcon} titulo="En camino">
              <EnCaminoProducto key={`${p.sku.id}-${codigoPais}`} id={p.sku.id} pais={codigoPais} nombrePais={nombrePais} />
            </Seccion>
          )}

          {/* La competencia del producto vinculado: los mismos datos que se ven en su ficha de Producto y en Compras. Un compuesto no la tiene. */}
          {p.sku && p.sku.tipo !== "combo" && (
            <Seccion icono={InteligenciaIcon} titulo="Competencia del producto">
              <BloqueCompetencia key={p.sku.id} skuId={p.sku.id} />
            </Seccion>
          )}

          <Seccion icono={ComprasIcon} titulo="Notas">
            <label className="flex min-w-0 flex-col gap-1">
              <span className={labelClassSm}>Notas</span>
              <textarea value={d.notas} onChange={(e) => cambiar({ notas: e.target.value })} rows={4} maxLength={5000} placeholder="Ej: competencia en Dropi, por qué se bajó el precio…" className={`${fieldClass} w-full resize-y`} />
            </label>
          </Seccion>
        </fieldset>

        <HistorialGenerico id={p.id} codigoPais={codigoPais} version={version} obtener={obtenerHistorialPublicacion} />
      </form>
      {/* Fuera del formulario: los eventos de un portal suben por el árbol de React y enviarían o ensuciarían este formulario. */}
      <FichaProductoEmbebida productoId={productoAbierto} alCerrar={() => setProductoAbierto(null)} />
    </Ventana>
  );
}
