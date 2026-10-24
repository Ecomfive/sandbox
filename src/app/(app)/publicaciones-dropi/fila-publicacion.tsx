"use client";

/* eslint-disable @next/next/no-img-element -- fotos de Storage */
import { useTransition, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { ArchivarIcon, ChevronRightIcon, DropiIcon } from "@/lib/nav-icons";
import { UBICACIONES, numeroPublicacion, opcion } from "@/lib/publicaciones/publicacion";
import { EN_DROPI } from "@/lib/publicaciones/automatico";
import { ETIQUETA_SUGERENCIA } from "@/lib/publicaciones/vincular";
import { codigoBodega } from "@/lib/publicaciones/sincronizar-dropi";
import { archivarPublicacion } from "./actions";
import { BotonApagarFila } from "./apagar-dropi";
import { InsigniaConectado } from "./insignia-conectado";
import { LlegadaCamino } from "./llegada-camino";
import { conexionDropi, type FilaPublicacion } from "./def-publicaciones";

/** Las columnas de la fila en pantalla ancha; las usa también el encabezado de la lista, así que van juntas. */
const COLUMNAS_CON_VENTAS = "lg:grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_4rem_1rem]";
const COLUMNAS_SIN_VENTAS = "lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_4rem_1rem]";

const usd = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
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
 * Cómo está en Dropi, en poco espacio: el logo de Dropi con un punto del color del estado (verde = activo). El nombre del estado
 * sale al pasar el cursor y lo leen los lectores de pantalla; sin ID o sin datos de Dropi, el logo se ve apagado.
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
 * «Archivar» de la fila (o «Sacar de Archivados» si ya lo está). Ninguna publicación se elimina (regla de Hernán, 23 oct 2026): se
 * archiva, y se puede deshacer.
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
  const texto = archivar ? "Archivar publicación" : "Sacar de Archivados";
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        onClick={cambiar}
        disabled={pendiente}
        aria-label={`${texto}: ${f.nombre}`}
        className={`mr-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 ${anilloFoco}`}
      >
        <ArchivarIcon className="h-4 w-4" />
      </button>
    </Tooltip>
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
      apoyo={<span className="tabular-nums">{v.stock > 0 ? `Stock ${entero(v.stock)}${v.diasInventario !== null ? ` · ${entero(v.diasInventario)} días` : ""}` : "Sin stock"}</span>}
    />
  );
}

/** La mercancía que viene en camino de un producto sin stock: las unidades arriba y la fecha de llegada abajo, en su propia columna. */
function CeldaEnCamino({ f }: { f: FilaPublicacion }) {
  const viene = f.ventas !== null && f.ventas.stock <= 0 && f.enCamino > 0;
  return (
    <Celda
      nombre="En camino"
      alinear="derecha"
      principal={viene ? <span className="font-medium tabular-nums text-success">{entero(f.enCamino)} en camino</span> : <span className="text-muted-foreground">—</span>}
      apoyo={viene ? <span className="flex flex-wrap items-center gap-1.5 whitespace-normal font-medium text-success lg:justify-end"><LlegadaCamino llegada={f.llegadaCamino} sinFecha={f.sinFechaCamino} sinEnvio={f.sinEnvioCamino} /></span> : undefined}
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
    <div className={`hidden items-center gap-x-4 py-2.5 pl-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:grid ${puedeArchivar ? "pr-[6.5rem]" : "pr-4"} ${verVentas ? COLUMNAS_CON_VENTAS : COLUMNAS_SIN_VENTAS}`}>
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
          <span className="truncate text-sm font-medium">{f.nombre}</span>
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
            {f.tipoDropi === "privado" && <span>Privado{f.privatizadoA ? ` · ${f.privatizadoA}` : ""}</span>}
            {f.sinPublicar && (
              <span className={`inline-flex items-center gap-1.5 font-medium ${f.publicarPendiente ? "text-destructive" : ""}`}>
                {f.publicarPendiente && <Punto clase="bg-destructive" texto="Publicación pendiente en Dropi" />}
                {f.publicarPendiente ? "Publicación pendiente" : "Sin publicar"}
              </span>
            )}
            {f.archivadoPendiente && !f.apagadoPendiente && (
              <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
                <Punto clase="bg-destructive" texto="Pendiente en Dropi" />
                {f.archivadoPendiente === "restaurar" ? "Salir de Archivados pendiente" : "Archivar pendiente"}
              </span>
            )}
            {f.apagadoPendiente && (
              <span className="inline-flex items-center gap-1.5 font-medium text-destructive">
                <Punto clase="bg-destructive" texto="Apagado pendiente en Dropi" />
                Apagado pendiente
              </span>
            )}
          </span>
        </span>
      </span>

      {/* Los datos: en pantalla ancha una columna cada uno; en angosta, debajo del producto en una fila que envuelve. */}
      <span className="order-last col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:order-none lg:contents">
        <Celda nombre="Precio" alinear="derecha" principal={<span className="font-semibold tabular-nums">{usd(f.precioVenta)}</span>} apoyo={
            <span className="flex flex-col lg:items-end">
              <span className="max-w-full truncate">Costo de producto {usd(f.costoMercancia)}</span>
              <span className="max-w-full truncate">Fulfillment {usd(f.fulfillment)}</span>
            </span>
          } />
        <Celda
          nombre="Utilidad bruta y margen bruto"
          alinear="derecha"
          principal={<span className="tabular-nums">{usd(f.utilidad)}</span>}
          apoyo={
            f.margen === null ? (
              "Sin margen"
            ) : (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                {(f.nivelMargen === "critico" || f.nivelMargen === "bajo") && <Punto clase="bg-destructive" texto="Margen bajo" />}
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
      {/* Una duplicada no sale de Archivados: en su lugar, un espacio del mismo ancho para que las filas no se corran. */}
      {f.duplicadaDe ? (
        <span aria-hidden="true" className="mr-3 w-[4.75rem] shrink-0" />
      ) : (
        <>
          <BotonApagarFila f={f} />
          <BotonArchivarFila f={f} />
        </>
      )}
    </div>
  );
}
