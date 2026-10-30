"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BloqueCompetencia, FotoAmpliable } from "@/components/competencia/piezas-competencia";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { ActualizarIcon, CerrarIcon, CheckIcon, ComprasIcon, EstadoIcon, FlechaAbajoIcon, FlechaArribaIcon, InteligenciaIcon, InventarioIcon, LapizIcon, MargenIcon, PapeleraIcon, ProductoIcon, ArchivarIcon, FotosIcon, PausaIcon, ReactivarIcon, ApagarIcon, CandadoAbiertoIcon, CandadoIcon } from "@/lib/nav-icons";
import {
  ESTADOS_PUBLICACION,
  fulfillmentFijo,
  TIPOS,
  UBICACIONES,
  numeroPublicacion,
  type OpcionPublicacion,
} from "@/lib/publicaciones/publicacion";
import { masReciente } from "@/lib/publicaciones/cambio-precio";
import { MAX_NOMBRE_DROPI } from "@/lib/publicaciones/dropi-guardado";
import { ComprasProducto } from "../producto/compras-producto";
import { EnCaminoProducto } from "../producto/en-camino-producto";
import { detalleCompuesto } from "@/lib/compras/en-camino";
import type { OpcionesCrear } from "@/lib/publicaciones/crear-dropi";
import { BotonAccionApagado } from "./boton-icono-fila";
import { motivoApagar, motivoArchivar, motivoPausar, motivoPrivatizar, motivoQuitarPrivatizacion, motivoRepublicar } from "@/lib/publicaciones/botones-fila";
import { actualizarPublicacion, archivarPublicacion, eliminarPublicacion, pausarPublicacion, publicarEnDropi, republicarPublicacion } from "./actions";
import { DatosParaDropi } from "./datos-para-dropi";
import { ActividadPublicacion } from "./actividad-publicacion";
import { conexionDropi, estadoBotones, paraReactivar, pausada, puedePausar, puedeRepublicar, republicacionPendiente, type FilaPublicacion } from "./def-publicaciones";
import { AvisoEnCamino, VentasEnDropi } from "./ventas-publicacion";
import { ConfirmarRepublicar } from "./confirmar-republicar";
import { ACCIONES, EN_DROPI } from "@/lib/publicaciones/automatico";
import { OptimizacionFicha } from "./optimizacion-publicacion";
import { RecomendacionesFicha } from "./recomendacion-publicacion";
import { FichaProductoEmbebida } from "../producto/ficha-producto-embebida";
import { InsigniaConectado } from "./insignia-conectado";
import { BotonApagarDropi, puedeApagar } from "./apagar-dropi";
import { BotonPrivatizarDropi, puedePrivatizar } from "./privatizar-dropi";
import { EstadoCambioDropi } from "./estado-cambio-dropi";
import { BodegasStockDropi } from "./stock-dropi";
import { BotonLiquidacionFicha } from "./liquidacion";
import { TareasPublicacion } from "./tareas-publicacion";
import { codigoBodega } from "@/lib/publicaciones/sincronizar-dropi";
import { VinculoSku } from "./vinculo-sku";
import { FotosPublicacion } from "./fotos-publicacion";
import { PublicacionesDelProducto } from "./mismo-producto";
import { Monto } from "./moneda-contexto";
import { VentasDropiProducto } from "../producto/ventas-dropi-producto";

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
});

const n = (s: string) => (s.trim() === "" ? null : Number(s));
const fechaLarga = (iso: string) => new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("es-PA", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Panama" });

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


/** Un botón de acción que espera «Aplicar en Dropi» (apagado) se ve en azul suave y no en gris: sigue siendo una acción en curso. */
const PENDIENTE_EN_COLOR = "disabled:!border-azul/30 disabled:!bg-azul-soft disabled:!text-azul";
/**
 * Ficha de una publicación: el panel a la derecha que se abre al pulsar su fila. **La ficha ya es el formulario**: se cambia
 * un dato y arriba aparecen «Guardar cambios» y «Cancelar»; al guardar, la ficha sigue abierta. Utilidad y
 * margen se calculan solos. Con cambios sin guardar, cerrar o pasar a otra pide confirmación.
 */
export function FichaPublicacion({
  publicacion,
  codigoPais,
  nombrePais,
  puedeEscribir,
  puedeArchivar,
  puedeVerCompras,
  puedeEliminar = false,
  corteVentas = null,
  margenMinimo,
  decisionesDisponibles,
  opcionesCrear,
  anterior,
  siguiente,
  alCerrar,
  mismoProducto = [],
  alAbrirOtra,
}: {
  publicacion: FilaPublicacion | undefined;
  codigoPais: string;
  nombrePais: string;
  puedeEscribir: boolean;
  /** Solo un administrador: elimina la publicación de verdad. */
  puedeArchivar: boolean;
  /** Solo un administrador: las compras del producto vinculado (el servidor lo vuelve a comprobar). */
  puedeVerCompras: boolean;
  /** Solo un administrador: elimina para siempre una publicación sin ID de Dropi (el servidor lo vuelve a comprobar). */
  puedeEliminar?: boolean;
  /** Hasta qué día llegan las ventas de Dropi (solo un administrador las ve); `null` si no se muestran. */
  corteVentas?: string | null;
  /** El margen mínimo de las reglas: por debajo, el punto rojo. */
  margenMinimo: number;
  /** false si falta la migración 0127: las recomendaciones se ven pero no se pueden decidir. */
  decisionesDisponibles: boolean;
  /** Categorías y bodegas que ofrece el formulario de los datos para Dropi de una publicación «Sin publicar». */
  opcionesCrear: OpcionesCrear;
  /** Las demás publicaciones del mismo producto (mismo SKU vinculado), públicas y privadas, y cómo abrir una. */
  mismoProducto?: FilaPublicacion[];
  alAbrirOtra?: (id: string) => void;
  anterior?: () => void;
  siguiente?: () => void;
  alCerrar: () => void;
}) {
  if (!publicacion) return null;
  return (
    <ContenidoFicha
      key={publicacion.id}
      p={publicacion}
      codigoPais={codigoPais}
      nombrePais={nombrePais}
      puedeEscribir={puedeEscribir}
      puedeArchivar={puedeArchivar}
      puedeVerCompras={puedeVerCompras}
      puedeEliminar={puedeEliminar}
      corteVentas={corteVentas}
      margenMinimo={margenMinimo}
      decisionesDisponibles={decisionesDisponibles}
      opcionesCrear={opcionesCrear}
      anterior={anterior}
      siguiente={siguiente}
      alCerrar={alCerrar}
      mismoProducto={mismoProducto}
      alAbrirOtra={alAbrirOtra}
    />
  );
}

function ContenidoFicha({
  p,
  codigoPais,
  nombrePais,
  puedeEscribir,
  puedeArchivar,
  puedeVerCompras,
  puedeEliminar,
  corteVentas,
  margenMinimo,
  decisionesDisponibles,
  opcionesCrear,
  anterior,
  siguiente,
  alCerrar,
  mismoProducto,
  alAbrirOtra,
}: {
  p: FilaPublicacion;
  codigoPais: string;
  nombrePais: string;
  puedeEscribir: boolean;
  puedeArchivar: boolean;
  puedeVerCompras: boolean;
  puedeEliminar: boolean;
  corteVentas: string | null;
  margenMinimo: number;
  decisionesDisponibles: boolean;
  opcionesCrear: OpcionesCrear;
  anterior?: () => void;
  siguiente?: () => void;
  alCerrar: () => void;
  mismoProducto: FilaPublicacion[];
  alAbrirOtra?: (id: string) => void;
}) {
  const { mostrarToast } = useToast();
  const [d, setD] = useState<Formulario>(desde(p));
  // «Eliminado» no se ofrece (ninguna publicación se elimina), salvo que ya lo tenga.
  // «Sin publicar» tampoco se elige a mano: lo da «Publicar en Dropi» y se quita al publicarla.
  const estadosParaElegir = ESTADOS_PUBLICACION.filter((o) => (o.valor !== "eliminado" || d.estado_publicacion === "eliminado") && o.valor !== "borrador");
  // Lo último guardado (o lo que llegó del servidor): con eso se compara para saber si hay cambios sin guardar. Al guardar no se
  // rearma la ficha (antes cambiaba su clave y parecía que se cerraba): cuando llegan los datos nuevos, el formulario los toma
  // solo si no hay cambios a medio escribir.
  // Con un ID de Dropi guardado la publicación está conectada y el ID queda bloqueado hasta pulsar el lápiz; al llegar los datos
  // guardados vuelve a quedar bloqueado.
  const [editandoId, setEditandoId] = useState(false);
  const actual = JSON.stringify(desde(p));
  const [base, setBase] = useState(actual);
  const [recibido, setRecibido] = useState(actual);
  if (actual !== recibido) {
    setRecibido(actual);
    setEditandoId(false);
    if (JSON.stringify(d) === base) setD(desde(p));
    setBase(actual);
  }
  const [pendiente, empezar] = useTransition();
  // Archivar va aparte: así, mientras termina de guardar, el botón no dice «Un momento...».
  const [archivando, setArchivando] = useState(false);
  const [republicando, setRepublicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  // La ficha del producto vinculado, abierta encima de esta (no lleva al módulo Producto).
  const [productoAbierto, setProductoAbierto] = useState<string | null>(null);
  const conectado = p.dropiId.trim() !== "";
  const idBloqueado = conectado && !editandoId;
  // Sin stock en Dropi no se archiva (27 oct 2026): «Archivar» queda apagado y, al pulsarlo, dice por qué.
  // Sin stock, además de «Archivar» se puede pausar (27 oct 2026), si está en Dropi. Una pausada se reactiva con «Reactivar».
  const sePausa = puedePausar(p);
  const botones = estadoBotones(p);
  const estaPausada = pausada(p);
  const reactivarYa = paraReactivar(p);
  const campoId = useRef<HTMLInputElement>(null);
  // Al desbloquear con el lápiz, el cursor entra en el campo.
  useEffect(() => {
    if (editandoId) campoId.current?.focus();
  }, [editandoId]);
  const sinGuardar = JSON.stringify(d) !== base;
  const cambiar = (c: Partial<Formulario>) => setD((a) => ({ ...a, ...c }));

  // En Panamá el fulfillment es fijo (27 oct 2026): se ve, pero no se escribe.
  const fijo = fulfillmentFijo(codigoPais);
  const precio = n(d.precio_venta);
  const utilidad = precio === null ? null : precio - (n(d.costo_mercancia) ?? 0) - (fijo ?? n(d.fulfillment) ?? 0);
  const margen = precio && utilidad !== null ? utilidad / precio : null;
  // La fecha anotada (sin montos) solo si es más nueva que el cambio con montos.
  const cambioPrecio = masReciente([p.cambioPrecioDropi, p.ultimoCambioPrecio ? { fecha: p.ultimoCambioPrecio, antes: null, despues: null } : null]);

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
      const r: { error?: string; dropi?: string } = await actualizarPublicacion(formData).catch(() => ({ error: "No se pudo guardar. Inténtalo de nuevo." }));
      if (r.error) setError(r.error);
      else {
        setBase(JSON.stringify(d));
        mostrarToast(r.dropi ? `Cambios guardados. ${r.dropi}` : "Cambios guardados");
        setVersion((v) => v + 1);
      }
    });
  }

  // «Publicar en Dropi» (24 oct 2026): una publicación «Sin publicar» vuelve a quedar pendiente para «Aplicar en Dropi» (por ejemplo, después de deshacer).
  const [publicando, setPublicando] = useState(false);
  function publicar() {
    setError(null);
    setPublicando(true);
    empezar(async () => {
      const r = await publicarEnDropi(p.id).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      setPublicando(false);
      if (r.error) setError(r.error);
      else mostrarToast(r.detalle ?? "Publicación pendiente");
    });
  }

  // Un borrador se elimina para siempre (24 oct 2026); una publicación sin ID de Dropi, solo un administrador (27 oct 2026).
  // Las que tienen ID de Dropi solo se archivan.
  const [eliminando, setEliminando] = useState(false);
  const eliminable = !p.publicarPendiente && !p.dropiId && (p.sinPublicar || puedeEliminar);
  function eliminar() {
    const que = p.sinPublicar ? "el borrador" : "la publicación";
    if (!confirm(`Se va a eliminar para siempre ${que} «${p.nombre}», con sus datos y sus fotos. Esto no se puede deshacer. ¿Seguir?`)) return;
    setError(null);
    setEliminando(true);
    empezar(async () => {
      const r = await eliminarPublicacion(p.id).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      setEliminando(false);
      if (r.error) setError(r.error);
      else {
        mostrarToast(r.detalle ?? "Eliminada");
        alCerrar();
      }
    });
  }

  // Ninguna publicación se elimina (regla de Hernán, 23 oct 2026): se archiva, y se puede sacar de Archivados.
  function archivar(pausarla = false) {
    const archivarla = !p.archivada;
    setError(null);
    setArchivando(true);
    empezar(async () => {
      const r = await (pausarla ? pausarPublicacion(p.id) : archivarPublicacion(p.id, archivarla)).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      setArchivando(false);
      if (r.error) setError(r.error);
      else mostrarToast(r.detalle ?? (pausarla ? "Publicación pausada" : archivarla ? "Publicación archivada" : estaPausada ? "Publicación reactivada" : "Publicación fuera de Archivados"));
    });
  }

  // «Republicar» (pedido de Hernán, 23 oct 2026): nada se republica solo; el botón lo deja para «Aplicar en Dropi». Solo con ID de
  // Dropi, sin archivar y de nuestra bodega (lo de la B280 es de Dropi).
  const sePuedeRepublicar = puedeRepublicar(p);
  const yaRepublicando = republicacionPendiente(p);
  // Lo que espera «Aplicar en Dropi» (o dio error) va arriba, junto a los botones, para que se vea (27 oct 2026); lo ya aplicado sigue abajo.
  const cambioEsperando = p.cambioDropi && p.cambioDropi.estado !== "aplicado" ? p.cambioDropi : null;
  // Pide el precio del producto nuevo antes de dejarlo pendiente (27 oct 2026: el 11446 salió con el precio viejo).
  const [confirmandoRepublicar, setConfirmandoRepublicar] = useState(false);
  function republicar() {
    setError(null);
    setConfirmandoRepublicar(true);
  }
  function confirmarRepublicar(precio: number) {
    setRepublicando(true);
    empezar(async () => {
      const r = await republicarPublicacion(p.id, precio).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      setRepublicando(false);
      setConfirmandoRepublicar(false);
      if (r.error) setError(r.error);
      else mostrarToast(r.detalle ?? "Republicación pendiente");
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
          {p.duplicadaDe ? (
            <Badge color="#8d8d8d">Duplicada</Badge>
          ) : p.sinPublicar ? (
            <Badge color="#8e4ec6">Sin publicar</Badge>
          ) : estaPausada ? (
            <Badge color={reactivarYa ? "#30a46c" : "#1d4ed8"}>{reactivarYa ? "Volvió el stock" : "Pausada sin stock"}</Badge>
          ) : p.archivada ? (
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
      {confirmandoRepublicar && <ConfirmarRepublicar p={p} enviando={republicando} alCerrar={() => setConfirmandoRepublicar(false)} alConfirmar={confirmarRepublicar} />}
      {/* Una publicación «Sin publicar»: lo que Dropi pide para crearla. Es un formulario aparte (uno no va dentro de otro). */}
      {p.sinPublicar && puedeEscribir && <DatosParaDropi p={p} opciones={opcionesCrear} />}
      <form onSubmit={guardar} aria-busy={pendiente} className="flex flex-1 flex-col">
        {puedeEscribir && (
          <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-col gap-2 border-y border-border bg-card px-5 py-3">
            <div className="flex flex-wrap gap-2">
              {sinGuardar && (
                <>
                  <button type="submit" disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-2 text-sm font-medium text-background hover:bg-success/85 disabled:opacity-50">
                    <CheckIcon className="h-4 w-4" />
                    {pendiente ? "Guardando..." : "Guardar cambios"}
                  </button>
                  <button type="button" onClick={() => setD(JSON.parse(base) as Formulario)} disabled={pendiente} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50">
                    <CerrarIcon className="h-4 w-4" />
                    Cancelar
                  </button>
                </>
              )}
              {!sinGuardar && puedeArchivar && p.sinPublicar && (
                <BotonAccion icono={CheckIcon} tono="exito" className={PENDIENTE_EN_COLOR} disabled={pendiente || p.publicarPendiente} onClick={publicar}>
                  {publicando ? "Un momento..." : p.publicarPendiente ? "Publicación pendiente" : "Publicar en Dropi"}
                </BotonAccion>
              )}
              {!sinGuardar && puedeArchivar && eliminable && (
                <BotonAccion icono={PapeleraIcon} tono="peligro" disabled={pendiente} onClick={eliminar}>
                  {eliminando ? "Un momento..." : p.sinPublicar ? "Eliminar borrador" : "Eliminar"}
                </BotonAccion>
              )}
              {/* Republicar, Apagar, Privatizar, Pausar y Archivar siempre se ven: si no se pueden usar, van apagados y dicen por qué (27 oct 2026). */}
              {!sinGuardar && puedeArchivar && !p.sinPublicar &&
                (sePuedeRepublicar ? (
                  <BotonAccion icono={ActualizarIcon} tono="info" className={PENDIENTE_EN_COLOR} disabled={pendiente || yaRepublicando} onClick={republicar}>
                    {republicando ? "Un momento..." : yaRepublicando ? "Republicación pendiente" : "Republicar"}
                  </BotonAccion>
                ) : (
                  <BotonAccionApagado icono={ActualizarIcon} texto="Republicar" motivo={motivoRepublicar(botones) ?? "No disponible"} />
                ))}
              {/* «Apagar en Dropi»: sacar el stock y archivar allá, con sus privadas a elección. Queda pendiente para «Aplicar en Dropi». */}
              {!sinGuardar && puedeArchivar && !p.sinPublicar &&
                (puedeApagar(p) ? <BotonApagarDropi p={p} deshabilitado={pendiente} /> : <BotonAccionApagado icono={ApagarIcon} texto="Apagar en Dropi" motivo={motivoApagar(botones) ?? "No disponible"} />)}
              {/* El candado: abierto en un público («Privatizar en Dropi», a un solo dropshipper en un producto privado nuevo); cerrado en un privado
                  («Quitar privatización», 30 oct 2026: sus unidades vuelven al público). */}
              {!sinGuardar && puedeArchivar && !p.sinPublicar &&
                (p.tipoDropi === "privado" ? (
                  motivoQuitarPrivatizacion(botones) === null ? (
                    <BotonPrivatizarDropi p={p} deshabilitado={pendiente} />
                  ) : (
                    <BotonAccionApagado icono={CandadoIcon} texto="Quitar privatización" motivo={motivoQuitarPrivatizacion(botones) ?? "No disponible"} />
                  )
                ) : puedePrivatizar(p) ? (
                  <BotonPrivatizarDropi p={p} deshabilitado={pendiente} />
                ) : (
                  <BotonAccionApagado icono={CandadoAbiertoIcon} texto="Privatizar en Dropi" motivo={motivoPrivatizar(botones) ?? "No disponible"} />
                ))}
              {!sinGuardar && puedeArchivar && !p.sinPublicar &&
                (estaPausada ? (
                  <BotonAccion icono={ReactivarIcon} tono="exito" disabled={pendiente} onClick={() => archivar()}>
                    {archivando ? "Un momento..." : "Reactivar"}
                  </BotonAccion>
                ) : sePausa ? (
                  <BotonAccion icono={PausaIcon} tono="info" disabled={pendiente} onClick={() => archivar(true)}>
                    {archivando ? "Un momento..." : "Pausar por falta de stock"}
                  </BotonAccion>
                ) : (
                  <BotonAccionApagado icono={PausaIcon} texto="Pausar por falta de stock" motivo={motivoPausar(botones) ?? "No disponible"} />
                ))}
              {!sinGuardar && puedeArchivar && <BotonLiquidacionFicha f={p} />}
              {!sinGuardar && puedeArchivar &&
                (motivoArchivar(botones) === null ? (
                  <BotonAccion icono={ArchivarIcon} tono={p.archivada ? "exito" : "alerta"} disabled={pendiente} onClick={() => archivar()}>
                    {archivando ? "Un momento..." : p.archivada ? "Sacar de Archivados" : "Archivar"}
                  </BotonAccion>
                ) : (
                  <BotonAccionApagado icono={ArchivarIcon} texto={p.archivada ? "Sacar de Archivados" : "Archivar"} motivo={motivoArchivar(botones)!} />
                ))}
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {cambioEsperando && (
              <div role="status" className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm [&>span]:text-sm [&>span]:font-medium">
                <EstadoCambioDropi c={cambioEsperando} />
              </div>
            )}
          </div>
        )}
        {/* Sin permiso de escritura no hay barra de botones: el aviso va igual arriba. */}
        {!puedeEscribir && cambioEsperando && (
          <div role="status" className="border-b border-border bg-destructive-soft px-5 py-3 [&>span]:text-sm [&>span]:font-medium">
            <EstadoCambioDropi c={cambioEsperando} />
          </div>
        )}

        {estaPausada && (
          <p role="note" className="m-0 flex items-start gap-2 border-b border-border px-5 py-3 text-sm">
            <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${reactivarYa ? "bg-success" : "bg-azul"}`} />
            <span>
              {reactivarYa ? (
                <>
                  <span className="font-semibold">Volvió el stock en Dropi.</span> Reactívala para que se vuelva a ver y vender.
                </>
              ) : (
                <>
                  <span className="font-semibold">Pausada por falta de stock</span> desde el {new Date(p.pausadaDesde!).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: "America/Panama" })}.
                  {p.enCamino > 0 ? ` Vienen ${p.enCamino.toLocaleString("es-PA")} unidades en camino.` : " No hay mercancía en camino."}
                </>
              )}
            </span>
          </p>
        )}
        {p.duplicadaDe && (
          <p role="note" className="m-0 border-b border-border bg-muted/50 px-5 py-3 text-sm">
            <span className="font-semibold">Duplicada de {p.duplicadaDe}.</span> Tiene el mismo ID de Dropi ({p.dropiId}): venía repetida de ClickUp. Usa esa; esta queda en
            Archivados.
          </p>
        )}
        <div className="border-b border-border px-5 py-5">
          <Seccion icono={InventarioIcon} titulo="Producto vinculado (SKU)">
            <VinculoSku p={p} puedeEscribir={puedeEscribir} siguiente={siguiente} alAbrirProducto={setProductoAbierto} />
          </Seccion>
        </div>
        {p.sku && alAbrirOtra && (
          <div className="border-b border-border px-5 py-5">
            <Seccion icono={ProductoIcon} titulo="Otras publicaciones del producto">
              <PublicacionesDelProducto otras={mismoProducto} alAbrir={alAbrirOtra} />
            </Seccion>
          </div>
        )}

        <RecomendacionesFicha p={p} puedeEscribir={puedeEscribir} disponible={decisionesDisponibles} />
        <TareasPublicacion key={`tareas-${p.id}`} p={p} puedeEscribir={puedeEscribir} />
        {!p.archivada && <OptimizacionFicha p={p} puedeEscribir={puedeEscribir} />}

        <fieldset disabled={!puedeEscribir} className="m-0 flex min-w-0 flex-col divide-y divide-border border-0 p-5">
          <Seccion icono={ProductoIcon} titulo="Producto">
            <div className="flex gap-4">
              <FotoAmpliable url={p.fotoUrl} nombre={p.nombre} tam="h-24 w-24" dentroDeFieldset />
              <div className="grid min-w-0 flex-1 gap-3">
                <label className="flex min-w-0 flex-col gap-1">
                  <span className={labelClassSm}>Nombre en Dropi</span>
                  {/* Se edita aquí (22 oct 2026): al guardar queda pendiente para Dropi, como «Usar este título» del Asistente de IA. */}
                  <input
                    value={d.nombre}
                    onChange={(e) => cambiar({ nombre: e.target.value })}
                    required
                    maxLength={MAX_NOMBRE_DROPI}
                    aria-describedby={`largo-nombre-${p.id}`}
                    className={`${fieldClass} w-full`}
                  />
                  <span id={`largo-nombre-${p.id}`} className="text-xs text-muted-foreground tabular-nums">
                    {d.nombre.trim().length} de {MAX_NOMBRE_DROPI} caracteres
                    {!p.sinPublicar && d.nombre.trim() !== p.nombre.trim() && " · al guardar se cambia también en Dropi"}
                  </span>
                </label>
                {p.cambioDropi && !cambioEsperando && <EstadoCambioDropi c={p.cambioDropi} />}
                <div className="flex min-w-0 flex-col gap-1.5">
                  {conexionDropi(p) && (
                    <div className="flex">
                      <InsigniaConectado estado={conexionDropi(p)!} />
                    </div>
                  )}
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className={labelClassSm}>ID en Dropi</span>
                    <span className="flex items-center gap-1.5">
                      <input
                        ref={campoId}
                        value={d.dropi_id}
                        onChange={(e) => cambiar({ dropi_id: e.target.value })}
                        readOnly={idBloqueado || p.sinPublicar}
                        maxLength={60}
                        placeholder={p.sinPublicar ? "Se llena al publicarla en Dropi" : "Ej: 11144"}
                        className={`${fieldClass} min-w-0 flex-1 tabular-nums ${idBloqueado || p.sinPublicar ? "cursor-default bg-muted text-muted-foreground" : ""}`}
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

          {!p.sinPublicar && (
            <Seccion icono={FotosIcon} titulo="Fotos">
              <FotosPublicacion key={p.id} id={p.id} />
            </Seccion>
          )}

          <Seccion icono={EstadoIcon} titulo="Estado">
            {/* Lo que pide la publicación (margen bajo, ventas en caída, republicar…) ya va en la cabecera de la ficha: aquí no se repite. */}
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Se eligen aquí (24 oct 2026, el sistema manda; antes salían de Dropi). Debajo, lo que reporta Dropi, solo de referencia. */}
              <div className="flex min-w-0 flex-col gap-1">
                <span aria-hidden="true" className={labelClassSm}>Estado</span>
                {p.sinPublicar ? (
                  <span className="text-sm font-medium">Sin publicar</span>
                ) : (
                  <Selector nombre="Estado" valor={d.estado_publicacion} lista={estadosParaElegir} cambiar={(v) => cambiar({ estado_publicacion: v })} vacio="Sin anotar" />
                )}
                <span className="text-xs text-muted-foreground">Dropi: {EN_DROPI.find((e) => e.valor === p.enDropi)?.etiqueta ?? "—"}</span>
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <span aria-hidden="true" className={labelClassSm}>Tipo</span>
                <Selector nombre="Tipo" valor={d.tipo_publicacion} lista={TIPOS} cambiar={(v) => cambiar({ tipo_publicacion: v })} vacio="Sin anotar" />
                {p.tipoEnDropi && <span className="text-xs text-muted-foreground">Dropi: {p.tipoEnDropi === "privado" ? "Privado" : "Público"}</span>}
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
              {((d.tipo_publicacion || p.tipoDropi) === "privado" || !!d.privatizado_a) && (
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
                {fijo !== null ? (
                  <>
                    <input value={fijo.toFixed(2)} disabled className={`${fieldClass} w-full tabular-nums disabled:cursor-not-allowed disabled:bg-muted`} />
                    <span className="text-xs text-muted-foreground">Igual en todas las de Panamá</span>
                  </>
                ) : (
                  <input type="number" min={0} step="0.01" value={d.fulfillment} onChange={(e) => cambiar({ fulfillment: e.target.value })} placeholder="Ej: 1.50" className={`${fieldClass} w-full tabular-nums`} />
                )}
              </label>
            </div>
            <dl className="grid grid-cols-3 gap-3 rounded-lg bg-muted px-4 py-3 text-sm tabular-nums">
              <div>
                <dt className="text-xs text-muted-foreground">Utilidad bruta</dt>
                <dd className="font-semibold">
                  <Monto valor={utilidad} />
                </dd>
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
                {/* El más reciente (30 oct 2026): el que vio la lectura del catálogo de Dropi, el aplicado desde el sistema o la fecha anotada. */}
                <dd className="text-xs">
                  {cambioPrecio ? (
                    <>
                      <span className="block font-semibold">{fechaLarga(cambioPrecio.fecha)}</span>
                      <span className="block text-muted-foreground">
                        {cambioPrecio.despues === null ? (
                          <>
                            ahora a <Monto valor={p.precioVenta} />
                          </>
                        ) : (
                          <>
                            {cambioPrecio.antes !== null && (
                              <>
                                de <Monto valor={cambioPrecio.antes} />{" "}
                              </>
                            )}
                            a <Monto valor={cambioPrecio.despues} />{" "}
                            {cambioPrecio.origen === "sistema" ? `· aplicado desde el sistema${cambioPrecio.por ? ` (lo pidió ${cambioPrecio.por})` : ""}` : "en Dropi"}
                          </>
                        )}
                      </span>
                    </>
                  ) : (
                    <span className="block">{p.lecturaDropiDesde ? `Sin cambios en Dropi desde el ${fechaLarga(p.lecturaDropiDesde)}` : "Sin datos de Dropi"}</span>
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

          {/* Las ventas de todo el producto vinculado, con todos sus IDs de Dropi (activos, archivados, públicos y privados), como en Producto. */}
          {p.sku && corteVentas && (
            <Seccion icono={MargenIcon} titulo={`Ventas del producto en Dropi en ${nombrePais} (todos sus IDs)`}>
              <VentasDropiProducto key={`${p.sku.id}-${codigoPais}`} id={p.sku.id} pais={codigoPais} />
            </Seccion>
          )}

          <Seccion icono={InventarioIcon} titulo="Stock">
            <AvisoEnCamino enCamino={p.enCamino} llegada={p.llegadaCamino} sinFecha={p.sinFechaCamino} sinEnvio={p.sinEnvioCamino} de={p.componentesCamino ? detalleCompuesto(p.componentesCamino) : null} enCotizacion={p.enCotizacion} etapaCotizacion={p.etapaCotizacion} />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <span aria-hidden="true" className={labelClassSm}>Dónde está</span>
                <Selector nombre="Dónde está" valor={d.ubicacion} lista={UBICACIONES} cambiar={(v) => cambiar({ ubicacion: v })} />
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <span className={labelClassSm}>Bodega</span>
              <span className="text-sm">
                {p.bodega ? (
                  <>
                    <span className="font-mono font-semibold">{codigoBodega(p.bodega.id)}</span> · {p.bodega.nombre}
                    {p.bodega.origen !== "dropi" && (
                      <span className="block text-xs text-muted-foreground">
                        La última que se conoció: Dropi no muestra la bodega de un producto sin stock
                        {p.bodega.origen === "nombre" ? " (sale del nombre)" : ""}.
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">Sin bodega: no tiene ID de Dropi con stock ni «Dónde está».</span>
                )}
              </span>
            </div>
            {/* Lo que dice «Mis productos» de Dropi (22 oct 2026) y, desde el 28 oct 2026, el lápiz que cambia el stock de una bodega de ECOMFIVE por «Aplicar en Dropi». */}
            <BodegasStockDropi p={p} bodegasEcomfive={opcionesCrear.bodegas} puedeEscribir={puedeEscribir} />
          </Seccion>

          {/* Lo que viene en camino del producto vinculado: solo unidades, del país seleccionado (las órdenes que ya salieron y no han llegado). */}
          {p.sku && p.sku.tipo !== "combo" && (
            <Seccion icono={ComprasIcon} titulo="En camino">
              <EnCaminoProducto key={`${p.sku.id}-${codigoPais}`} id={p.sku.id} pais={codigoPais} nombrePais={nombrePais} />
            </Seccion>
          )}

          {/* De un compuesto (pack o combo) viene en camino lo de sus componentes: cada uno con sus órdenes, del país seleccionado. */}
          {p.sku && p.componentesCamino && p.componentesCamino.length > 0 && (
            <Seccion icono={ComprasIcon} titulo="En camino de sus componentes">
              <div className="flex flex-col gap-4">
                {p.componentesCamino.map((c) => (
                  <div key={c.id} className="flex flex-col gap-1.5">
                    <p className="m-0 text-sm font-medium">
                      {c.nombre}
                      <span className="font-normal text-muted-foreground"> · {c.porPack} por pack</span>
                    </p>
                    <EnCaminoProducto key={`${c.id}-${codigoPais}`} id={c.id} pais={codigoPais} nombrePais={nombrePais} />
                  </div>
                ))}
              </div>
            </Seccion>
          )}

          {/* La competencia del producto vinculado: los mismos datos que se ven en su ficha de Producto y en Compras. Un compuesto no la tiene. */}
          {p.sku && p.sku.tipo !== "combo" && (
            <Seccion icono={InteligenciaIcon} titulo="Competencia del producto">
              <BloqueCompetencia key={p.sku.id} skuId={p.sku.id} />
            </Seccion>
          )}

          {/* Las compras del producto vinculado: solo para un administrador (histórico; las descartadas no suman en los totales). */}
          {puedeVerCompras && p.sku && (
            <Seccion icono={ComprasIcon} titulo="Compras">
              <ComprasProducto key={p.sku.id} id={p.sku.id} />
            </Seccion>
          )}
        </fieldset>

      </form>
      {/* Fuera del formulario: escribir un comentario no debe enviar ni ensuciar la publicación. Se vuelve a pedir al guardar y
          al decidir una recomendación (cambia la cantidad de decisiones o de tareas hechas). */}
      <ActividadPublicacion id={p.id} puedeComentar={puedeEscribir} version={version + p.decisiones.length + p.decisiones.filter((x) => x.hechaEn).length} />
      {/* Fuera del formulario: los eventos de un portal suben por el árbol de React y enviarían o ensuciarían este formulario. */}
      <FichaProductoEmbebida productoId={productoAbierto} alCerrar={() => setProductoAbierto(null)} />
    </Ventana>
  );
}
