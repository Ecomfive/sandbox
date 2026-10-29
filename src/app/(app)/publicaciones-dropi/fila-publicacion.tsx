"use client";

/* eslint-disable @next/next/no-img-element -- fotos de Storage */
import { useState, useTransition, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { ActualizarIcon, ArchivarIcon, CandadoIcon, ChevronRightIcon, DropiIcon, EtiquetaIcon, PausaIcon, ReactivarIcon } from "@/lib/nav-icons";
import { UBICACIONES, numeroPublicacion, opcion } from "@/lib/publicaciones/publicacion";
import { EN_DROPI } from "@/lib/publicaciones/automatico";
import { ConfirmarRepublicar } from "./confirmar-republicar";
import { ETIQUETA_SUGERENCIA } from "@/lib/publicaciones/vincular";
import { codigoBodega } from "@/lib/publicaciones/sincronizar-dropi";
import { detalleCompuesto } from "@/lib/compras/en-camino";
import { archivarPublicacion, pausarPublicacion, republicarPublicacion } from "./actions";
import { BotonIconoFila } from "./boton-icono-fila";
import { motivoArchivar, motivoPausar, motivoRepublicar } from "@/lib/publicaciones/botones-fila";
import { BotonApagarFila } from "./apagar-dropi";
import { BotonPrivatizarFila } from "./privatizar-dropi";
import { BotonLiquidacionFila } from "./liquidacion";
import { InsigniaConectado } from "./insignia-conectado";
import { Monto, useMoneda } from "./moneda-contexto";
import { EtapaCotizando, LlegadaCamino } from "./llegada-camino";
import { conexionDropi, estadoBotones, paraReactivar, pausada, puedeRepublicar, republicacionPendiente, type FilaPublicacion } from "./def-publicaciones";

/** Las columnas de la fila en pantalla ancha; las usa también el encabezado de la lista, así que van juntas. */
const COLUMNAS_CON_VENTAS = "lg:grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_4rem_1rem]";
const COLUMNAS_SIN_VENTAS = "lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_4rem_1rem]";

const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });

const Punto = ({ clase, texto }: { clase: string; texto: string }) => (
  <span role="img" aria-label={texto} className={`inline-block h-2 w-2 shrink-0 rounded-full ${clase}`} />
);

/** Un dato que lleva el color de su opción (venta, dónde está, reposición): punto de color y su nombre. */
const ConPunto = ({ color, texto }: { color: string | undefined; texto: string }) => (
  <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
    <span aria-hidden="true" style={{ backgroundColor: color }} className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />
    <span className="truncate">{texto}</span>
  </span>
);

/**
 * Cómo está en Dropi, en poco espacio: el logo de Dropi con un punto del color del estado (verde = activo, rojo = no conectado). El
 * nombre del estado sale al pasar el cursor y lo leen los lectores de pantalla; sin ID o sin datos de Dropi, el logo se ve apagado.
 */
function IconoEnDropi({ estado }: { estado: { valor: string; etiqueta: string; color: string } }) {
  const apagado = estado.valor === "sin_id" || estado.valor === "sin_datos";
  return (
    <Tooltip texto={estado.etiqueta}>
      <span role="img" aria-label={estado.etiqueta} className="relative inline-flex h-7 w-7 items-center justify-center">
        <DropiIcon marca className={`h-6 w-6 ${apagado ? "opacity-40 grayscale" : ""}`} />
        <span aria-hidden="true" style={{ backgroundColor: estado.color }} className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card" />
      </span>
    </Tooltip>
  );
}

/** Una celda de la fila: lo principal arriba y lo de apoyo abajo; el nombre del dato solo se lee con lector de pantalla. */
function Celda({ nombre, principal, apoyo, alinear = "izquierda" }: { nombre: string; principal: ReactNode; apoyo?: ReactNode; alinear?: "izquierda" | "derecha" }) {
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${alinear === "derecha" ? "lg:items-end lg:text-right" : ""}`}>
      <span className="sr-only">{nombre}: </span>
      <span className="min-w-0 max-w-full overflow-hidden text-sm">{principal}</span>
      {apoyo && <span className="min-w-0 max-w-full truncate text-xs text-muted-foreground">{apoyo}</span>}
    </span>
  );
}

/**
 * «Pausar por falta de stock» de la fila (27 oct 2026), o «Reactivar» si ya está pausada. Siempre se ve: apagado, dice por qué.
 */
function BotonPausarFila({ f }: { f: FilaPublicacion }) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const estaPausada = pausada(f);
  const reactivarYa = paraReactivar(f);
  function cambiar() {
    empezar(async () => {
      const r = await (estaPausada ? archivarPublicacion(f.id, false) : pausarPublicacion(f.id)).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      mostrarToast(r.error ?? r.detalle ?? (estaPausada ? "Publicación reactivada" : "Publicación pausada"), r.error ? "destructive" : undefined);
    });
  }
  return (
    <BotonIconoFila
      texto={estaPausada ? (reactivarYa ? "Reactivar: volvió el stock" : "Reactivar publicación") : "Pausar por falta de stock"}
      motivo={motivoPausar(estadoBotones(f))}
      icono={estaPausada ? ReactivarIcon : PausaIcon}
      nombre={f.nombre}
      onClick={cambiar}
      ocupado={pendiente}
      activo={estaPausada ? (reactivarYa ? "verde" : "azul") : undefined}
    />
  );
}

/**
 * «Archivar» de la fila (o «Sacar de Archivados» si ya lo está). Ninguna publicación con ID de Dropi se elimina (regla de Hernán, 23 oct
 * 2026): se archiva, y se puede deshacer. Siempre se ve, también sin stock (27 oct 2026).
 */
function BotonArchivarFila({ f }: { f: FilaPublicacion }) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  const archivar = !f.archivada;
  function cambiar() {
    empezar(async () => {
      const r = await archivarPublicacion(f.id, archivar).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      mostrarToast(r.error ?? r.detalle ?? (archivar ? "Publicación archivada" : "Publicación fuera de Archivados"), r.error ? "destructive" : undefined);
    });
  }
  return (
    <BotonIconoFila
      texto={archivar ? "Archivar publicación" : "Sacar de Archivados"}
      motivo={motivoArchivar(estadoBotones(f))}
      icono={ArchivarIcon}
      nombre={f.nombre}
      onClick={cambiar}
      ocupado={pendiente}
      activo={archivar ? undefined : "rojo"}
    />
  );
}

/**
 * «Republicar» desde la fila, sin abrir la ficha (pedido de Hernán, 27 oct 2026): pide confirmar y lo deja pendiente para «Aplicar en Dropi»,
 * como el botón de la ficha. Si ya está pendiente, el ícono va en rojo y no se puede volver a pedir. Donde no se ofrece, va apagado
 * y dice por qué.
 */
function BotonRepublicarFila({ f }: { f: FilaPublicacion }) {
  const { mostrarToast } = useToast();
  const [enviando, empezar] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const yaPendiente = puedeRepublicar(f) && republicacionPendiente(f);
  // Pide el precio del producto nuevo antes de dejarlo pendiente (27 oct 2026).
  function republicar(precio: number) {
    empezar(async () => {
      const r = await republicarPublicacion(f.id, precio).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      mostrarToast(r.error ?? r.detalle ?? "Republicación pendiente", r.error ? "destructive" : undefined);
      if (!r.error) setConfirmando(false);
    });
  }
  return (
    <>
      {confirmando && <ConfirmarRepublicar p={f} enviando={enviando} alCerrar={() => setConfirmando(false)} alConfirmar={republicar} />}
      <BotonIconoFila
        texto={yaPendiente ? "Republicación pendiente" : "Republicar en Dropi"}
        motivo={yaPendiente ? null : motivoRepublicar(estadoBotones(f))}
        icono={ActualizarIcon}
        nombre={f.nombre}
        onClick={() => !yaPendiente && setConfirmando(true)}
        ocupado={enviando}
        activo={yaPendiente ? "rojo" : undefined}
      />
    </>
  );
}

/** Las ventas en Dropi de la fila: netas de los últimos 30 días, stock y para cuántos días alcanza. */
function CeldaVentas({ f }: { f: FilaPublicacion }) {
  const v = f.ventas;
  if (!v) return <Celda nombre="Ventas en Dropi" alinear="derecha" principal={<span className="text-muted-foreground">—</span>} apoyo="Sin datos de Dropi" />;
  return (
    <Celda
      nombre="Ventas en Dropi, últimos 30 días"
      alinear="derecha"
      principal={
        <span className="inline-flex items-center gap-1.5 tabular-nums">
          {v.stockEstado === "sin_stock_vende" && <Punto clase="bg-destructive" texto="Sin stock y se vende" />}
          {v.stockEstado === "se_acaba" && <Punto clase="bg-warning" texto="Se acaba el stock" />}
          {entero(v.netas30)} {v.netas30 === 1 ? "venta" : "ventas"} en 30 días
        </span>
      }
      apoyo={v.stock > 0 ? <span className="tabular-nums">{`Stock ${entero(v.stock)}${v.diasInventario !== null ? ` · ${entero(v.diasInventario)} días` : ""}`}</span> : <span className="font-medium text-destructive">Sin stock</span>}
    />
  );
}

/**
 * La mercancía que viene en camino de un producto sin stock: las unidades arriba y la fecha de llegada abajo, en su propia columna. De un
 * compuesto (pack o combo), lo que viene de sus componentes y de cuál es.
 */
function CeldaEnCamino({ f }: { f: FilaPublicacion }) {
  // Sale siempre que haya algo en camino (26 oct 2026): antes pedía datos de ventas y cero stock, y un producto nuevo o con unidades no lo mostraba.
  const viene = f.enCamino > 0;
  // Lo que todavía se cotiza (01 - Cotizar y 02 - Cotizado): se sabe cuánto se piensa pedir, aún no viene.
  const cotiza = f.enCotizacion > 0;
  const de = f.componentesCamino ? detalleCompuesto(f.componentesCamino) : null;
  return (
    <Celda
      nombre="En camino"
      alinear="derecha"
      principal={
        viene ? (
          <span className="font-medium tabular-nums text-success">{entero(f.enCamino)} en camino</span>
        ) : cotiza ? (
          <span className="font-medium tabular-nums text-warning">{entero(f.enCotizacion)} en cotización</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )
      }
      apoyo={
        viene ? (
          <span className="flex flex-wrap items-center gap-1.5 whitespace-normal font-medium text-success lg:justify-end">
            <LlegadaCamino llegada={f.llegadaCamino} sinFecha={f.sinFechaCamino} sinEnvio={f.sinEnvioCamino} />
            {de && <span className="w-full font-normal text-muted-foreground lg:text-right">{de}</span>}
            {cotiza && (
              <span className="flex w-full flex-wrap items-center gap-1.5 font-normal text-warning lg:justify-end">
                + {entero(f.enCotizacion)} en cotización
                {f.etapaCotizacion && <EtapaCotizando c={f.etapaCotizacion} />}
              </span>
            )}
          </span>
        ) : cotiza ? (
          <span className="flex flex-wrap items-center gap-1.5 whitespace-normal lg:justify-end">{f.etapaCotizacion ? <EtapaCotizando c={f.etapaCotizacion} /> : "aún no viene"}</span>
        ) : undefined
      }
    />
  );
}

/**
 * El nombre de cada columna de la lista, en una franja que queda fija arriba al bajar (`encabezado` de `ListaDatos`). Solo en pantalla
 * ancha: en angosta los datos van debajo del producto y cada uno ya dice cuál es. Usa la misma rejilla que `FilaPublicacionLista`; con
 * «Archivar» la fila deja a la derecha el botón (36 px y 12 px de margen), que aquí se compensa con el relleno.
 */
export function EncabezadoFilasPublicacion({ verVentas = false, puedeArchivar = false }: { verVentas?: boolean; puedeArchivar?: boolean }) {
  const derecha = "text-right";
  const columnas: { nombre: string; clase?: string }[] = [
    { nombre: "Producto" },
    { nombre: "Precio", clase: derecha },
    { nombre: "Utilidad y margen", clase: derecha },
    ...(verVentas ? [{ nombre: "Ventas · 30 días", clase: derecha }, { nombre: "En camino", clase: derecha }] : []),
    { nombre: "Dónde está" },
    { nombre: "En Dropi" },
  ];
  return (
    <div className={`hidden items-center gap-x-4 py-2.5 pl-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:grid ${puedeArchivar ? "pr-[16.5rem]" : "pr-4"} ${verVentas ? COLUMNAS_CON_VENTAS : COLUMNAS_SIN_VENTAS}`}>
      {columnas.map((c) => (
        <span key={c.nombre} className={`min-w-0 truncate ${c.clase ?? ""}`}>
          {c.nombre}
        </span>
      ))}
      <span aria-hidden="true" />
    </div>
  );
}

/**
 * Una publicación como fila de la lista: foto, nombre con su ID y su SKU, precio, utilidad y margen, sus ventas,
 * dónde está y cómo está en Dropi,
 * reposición y próxima revisión. Toda la fila abre su ficha. Las alertas son un punto de color junto al dato, no una caja.
 */
export function FilaPublicacionLista({ f, verVentas = false, alAbrir, puedeArchivar = false }: { f: FilaPublicacion; verVentas?: boolean; alAbrir: () => void; puedeArchivar?: boolean }) {
  // Los montos en la moneda del país (Costa Rica en colones, con su valor en dólares en pequeño).
  const { monto } = useMoneda();
  const enDropi = EN_DROPI.find((e) => e.valor === (f.archivada && f.enDropi !== "archivado" ? "archivado" : f.enDropi));
  const ubicacion = opcion(UBICACIONES, f.ubicacion);
  const sugerida = !f.sku && f.sugerencia && f.sugerencia.tipo !== "ninguno" ? f.sugerencia : null;
  const fila = (
    <button
      type="button"
      onClick={alAbrir}
      aria-label={`Abrir la ficha de ${f.nombre}`}
      className={`group grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_1rem] items-center gap-x-4 gap-y-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${verVentas ? COLUMNAS_CON_VENTAS : COLUMNAS_SIN_VENTAS} ${anilloFoco}`}
    >
      {/* Producto */}
      <span className="flex min-w-0 items-center gap-3">
        {f.fotoUrl ? (
          <img src={f.fotoUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover" />
        ) : (
          <span aria-hidden="true" className="h-12 w-12 shrink-0 rounded-lg border border-dashed border-border-control" />
        )}
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium">{f.nombre}</span>
            {/* Privado: insignia violeta sólida con candado junto al nombre, para verla de lejos (28 oct 2026). */}
            {f.tipoDropi === "privado" && (
              <span className="inline-flex max-w-48 shrink-0 items-center gap-1 rounded-full bg-privado px-2 py-0.5 text-xs font-semibold text-white">
                <CandadoIcon aria-hidden="true" className="h-3 w-3 shrink-0" />
                <span className="truncate">Privado{f.privatizadoA ? ` · ${f.privatizadoA}` : ""}</span>
              </span>
            )}
            {/* En liquidación: insignia roja sólida junto al nombre, como «Privado» (29 oct 2026, pedido de Alcides; antes era un punto). */}
            {f.liquidacionDesde && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-xs font-semibold text-background">
                <EtiquetaIcon aria-hidden="true" className="h-3 w-3 shrink-0" />
                En liquidación
              </span>
            )}
          </span>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-medium tabular-nums">{numeroPublicacion(f.numero)}</span>
            <span className="tabular-nums">{f.dropiId ? `ID ${f.dropiId}` : "Sin ID de Dropi"}</span>
            {conexionDropi(f) && <InsigniaConectado estado={conexionDropi(f)!} />}
            {/* A qué bodega de Dropi pertenece («B280»): la que muestra Dropi o, si hoy no tiene stock, la última que se conoció. */}
            {f.bodega ? (
              <span className="rounded border border-border-control px-1 font-mono font-semibold text-foreground">
                <span className="sr-only">Bodega {f.bodega.nombre}: </span>
                {codigoBodega(f.bodega.id)}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Punto clase="bg-warning" texto="Sin bodega" />
                Sin bodega
              </span>
            )}
            {f.sku ? (
              <span className="font-mono font-semibold text-foreground">{f.sku.codigo}</span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Punto clase="bg-warning" texto="Sin vincular producto" />
                {sugerida ? `${ETIQUETA_SUGERENCIA[sugerida.tipo]}${sugerida.sku ? ` · ${sugerida.sku.codigo}` : ""}` : "Sin SKU"}
              </span>
            )}
            {f.sinPublicar && (
              <span className={`inline-flex items-center gap-1.5 font-medium ${f.publicarPendiente ? "text-destructive" : ""}`}>
                {f.publicarPendiente && <Punto clase="bg-destructive" texto="Publicación pendiente en Dropi" />}
                {f.publicarPendiente ? "Publicación pendiente" : "Sin publicar"}
              </span>
            )}
            {pausada(f) && (
              <span className={`inline-flex items-center gap-1.5 font-medium ${paraReactivar(f) ? "text-success" : ""}`}>
                <Punto clase={paraReactivar(f) ? "bg-success" : "bg-azul"} texto={paraReactivar(f) ? "Volvió el stock" : "Pausada por falta de stock"} />
                {paraReactivar(f) ? "Volvió el stock: reactivar" : "Pausada sin stock"}
              </span>
            )}
            {f.tareasPendientes.total > 0 && (
              <span className={`inline-flex items-center gap-1.5 font-medium ${f.tareasPendientes.atrasadas ? "text-destructive" : ""}`}>
                <Punto clase={f.tareasPendientes.atrasadas ? "bg-destructive" : "bg-warning"} texto={f.tareasPendientes.atrasadas ? "Tarea atrasada" : "Tarea pendiente"} />
                {f.tareasPendientes.total === 1 ? "1 tarea" : `${f.tareasPendientes.total} tareas`}
                {f.tareasPendientes.atrasadas ? " · atrasada" : ""}
              </span>
            )}
            {f.archivadoPendiente && !f.apagadoPendiente && (
              <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
                <Punto clase="bg-destructive" texto="Pendiente en Dropi" />
                {f.archivadoPendiente === "restaurar" ? (pausada(f) ? "Reactivar pendiente" : "Salir de Archivados pendiente") : pausada(f) ? "Pausar pendiente" : "Archivar pendiente"}
              </span>
            )}
            {f.apagadoPendiente && (
              <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
                <Punto clase="bg-destructive" texto="Apagado pendiente en Dropi" />
                Apagado pendiente
              </span>
            )}
            {f.privatizaciones.length > 0 && (
              <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
                <Punto clase="bg-destructive" texto="Privatización pendiente en Dropi" />
                {f.privatizaciones.length === 1 ? `Privatización pendiente · ${f.privatizaciones[0].dropshipper || f.privatizaciones[0].correo}` : `${f.privatizaciones.length} privatizaciones pendientes`}
              </span>
            )}
            {f.stockPendiente.length > 0 && (
              <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
                <Punto clase="bg-destructive" texto="Stock pendiente en Dropi" />
                {f.stockPendiente.length === 1
                  ? `Stock pendiente · ${codigoBodega(f.stockPendiente[0].bodega)} a ${f.stockPendiente[0].unidades.toLocaleString("es-PA")} u.`
                  : `Stock pendiente en ${f.stockPendiente.length} bodegas`}
              </span>
            )}
          </span>
        </span>
      </span>

      {/* Los datos: en pantalla ancha una columna cada uno; en angosta, debajo del producto en una fila que envuelve. */}
      <span className="order-last col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:order-none lg:contents">
        <Celda nombre="Precio" alinear="derecha" principal={<Monto valor={f.precioVenta} className="font-semibold tabular-nums" />} apoyo={
            <span className="flex flex-col lg:items-end">
              <span className="max-w-full truncate">Costo de producto {monto(f.costoMercancia)}</span>
              <span className="max-w-full truncate">Fulfillment {monto(f.fulfillment)}</span>
            </span>
          } />
        <Celda
          nombre="Utilidad bruta y margen bruto"
          alinear="derecha"
          principal={<Monto valor={f.utilidad} className="tabular-nums" />}
          apoyo={
            f.margen === null ? (
              "Sin margen"
            ) : (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                {(f.nivelMargen === "critico" || f.nivelMargen === "bajo") &&
                  (f.liquidacionDesde ? <Punto clase="bg-warning" texto="Margen bajo, en liquidación" /> : <Punto clase="bg-destructive" texto="Margen bajo" />)}
                {Math.round(f.margen * 100)} % de margen bruto
              </span>
            )
          }
        />
        {verVentas && <CeldaVentas f={f} />}
        {verVentas && <CeldaEnCamino f={f} />}
        <Celda
          nombre="Dónde está"
          principal={ubicacion ? <ConPunto color={ubicacion.color} texto={ubicacion.etiqueta} /> : <span className="text-muted-foreground">—</span>}
          apoyo={
            f.stockProveedor !== null ? (
              <span className="tabular-nums">
                {f.stockProveedor.toLocaleString("es-PA")} u. en Dropi
                {f.stockPrivadoProveedor ? ` · ${f.stockPrivadoProveedor.toLocaleString("es-PA")} privadas` : ""}
              </span>
            ) : undefined
          }
        />
        <Celda nombre="En Dropi" principal={f.sinPublicar ? <span className="text-xs text-muted-foreground">Sin publicar</span> : enDropi ? <IconoEnDropi estado={enDropi} /> : <span className="text-muted-foreground">—</span>} />
      </span>

      <ChevronRightIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 lg:order-last" />
    </button>
  );
  // Con «Archivar» la fila es el botón que abre la ficha y, al lado, el de archivar: un botón no va dentro de otro.
  if (!puedeArchivar) return fila;
  return (
    <div className="flex items-center">
      <div className="min-w-0 flex-1">{fila}</div>
      {/* Siempre los mismos seis botones, en el mismo orden; los que no aplican van apagados y dicen por qué (27 oct 2026; liquidación, 28 oct). */}
      <div className="mr-3 flex shrink-0 items-center gap-1">
        <BotonRepublicarFila f={f} />
        <BotonPrivatizarFila f={f} />
        <BotonApagarFila f={f} />
        <BotonPausarFila f={f} />
        <BotonLiquidacionFila f={f} />
        <BotonArchivarFila f={f} />
      </div>
    </div>
  );
}
