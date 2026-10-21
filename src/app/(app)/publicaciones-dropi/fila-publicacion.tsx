"use client";

/* eslint-disable @next/next/no-img-element -- fotos de Storage */
import { useTransition, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { ChevronRightIcon, PapeleraIcon } from "@/lib/nav-icons";
import { ESTADOS, ESTADOS_REPOSICION, ESTADOS_VENTA, UBICACIONES, margenBajo, numeroPublicacion, opcion } from "@/lib/publicaciones/publicacion";
import { ETIQUETA_SUGERENCIA } from "@/lib/publicaciones/vincular";
import { eliminarPublicacion } from "./actions";
import type { FilaPublicacion } from "./def-publicaciones";

const usd = (n: number | null) => (n === null ? "—" : `$${n.toFixed(2)}`);
const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
const fechaCorta = (f: string | null) => (f ? new Date(`${f}T12:00:00`).toLocaleDateString("es-PA", { day: "numeric", month: "short" }) : "—");

const Punto = ({ clase, texto }: { clase: string; texto: string }) => (
  <span role="img" aria-label={texto} className={`inline-block h-2 w-2 shrink-0 rounded-full ${clase}`} />
);

/** Un dato que lleva el color de su opción (venta, dónde está, reposición): punto de color y su nombre. */
const ConPunto = ({ color, texto }: { color: string | undefined; texto: string }) => (
  <span className="inline-flex min-w-0 items-center gap-1.5">
    <span aria-hidden="true" style={{ backgroundColor: color }} className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground" />
    <span className="truncate">{texto}</span>
  </span>
);

/** Una celda de la fila: lo principal arriba y lo de apoyo abajo; el nombre del dato solo se lee con lector de pantalla. */
function Celda({ nombre, principal, apoyo, alinear = "izquierda" }: { nombre: string; principal: ReactNode; apoyo?: ReactNode; alinear?: "izquierda" | "derecha" }) {
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${alinear === "derecha" ? "lg:items-end lg:text-right" : ""}`}>
      <span className="sr-only">{nombre}: </span>
      <span className="min-w-0 text-sm">{principal}</span>
      {apoyo && <span className="min-w-0 truncate text-xs text-muted-foreground">{apoyo}</span>}
    </span>
  );
}

/** «Eliminar» de la fila (solo un administrador): pide confirmación y borra la publicación de verdad. */
function BotonEliminarFila({ f, alEliminar }: { f: FilaPublicacion; alEliminar: () => void }) {
  const { mostrarToast } = useToast();
  const [pendiente, empezar] = useTransition();
  function eliminar() {
    if (!confirm(`¿Eliminar "${f.nombre}"? No se puede deshacer.`)) return;
    empezar(async () => {
      const r = await eliminarPublicacion(f.id).catch(() => ({ error: "No se pudo eliminar. Inténtalo de nuevo." }));
      if (r.error) mostrarToast(r.error, "destructive");
      else {
        mostrarToast("Publicación eliminada");
        alEliminar();
      }
    });
  }
  return (
    <Tooltip texto="Eliminar publicación">
      <button
        type="button"
        onClick={eliminar}
        disabled={pendiente}
        aria-label={`Eliminar la publicación ${f.nombre}`}
        className={`mr-3 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive disabled:opacity-50 ${anilloFoco}`}
      >
        <PapeleraIcon className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

/** Las ventas en Dropi de la fila (solo un administrador): netas de 30 días, stock y para cuántos días alcanza. */
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
          {entero(v.netas30)} netas en 30 días
        </span>
      }
      apoyo={<span className="tabular-nums">{v.stock > 0 ? `Stock ${entero(v.stock)}${v.diasInventario !== null ? ` · ${entero(v.diasInventario)} días` : ""}` : "Sin stock"}</span>}
    />
  );
}

/**
 * Una publicación como fila de la lista: foto, nombre con su ID y su SKU, estado, precio, utilidad y margen, dónde está,
 * reposición y próxima revisión. Toda la fila abre su ficha. Las alertas son un punto de color junto al dato, no una caja.
 */
export function FilaPublicacionLista({ f, verVentas = false, alAbrir, alEliminar }: { f: FilaPublicacion; verVentas?: boolean; alAbrir: () => void; alEliminar?: () => void }) {
  const estado = opcion(ESTADOS, f.estado);
  const venta = opcion(ESTADOS_VENTA, f.estadoVenta);
  const ubicacion = opcion(UBICACIONES, f.ubicacion);
  const reposicion = opcion(ESTADOS_REPOSICION, f.estadoReposicion);
  const sugerida = !f.sku && f.sugerencia && f.sugerencia.tipo !== "ninguno" ? f.sugerencia : null;
  const fila = (
    <button
      type="button"
      onClick={alAbrir}
      aria-label={`Abrir la ficha de ${f.nombre}`}
      className={`group grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_1rem] items-center gap-x-4 gap-y-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${verVentas ? "lg:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_1rem]" : "lg:grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.3fr)_minmax(0,1fr)_1rem]"} ${anilloFoco}`}
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
            {f.sku ? (
              <span className="font-mono font-semibold text-foreground">{f.sku.codigo}</span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <Punto clase="bg-warning" texto="Sin vincular" />
                {sugerida ? `${ETIQUETA_SUGERENCIA[sugerida.tipo]}${sugerida.sku ? ` · ${sugerida.sku.codigo}` : ""}` : "Sin SKU"}
              </span>
            )}
            {f.tipo === "privado" && <span>Privado{f.privatizadoA ? ` · ${f.privatizadoA}` : ""}</span>}
          </span>
        </span>
      </span>

      {/* Los datos: en pantalla ancha una columna cada uno; en angosta, debajo del producto en una fila que envuelve. */}
      <span className="order-last col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:order-none lg:contents">
        <Celda nombre="Precio" alinear="derecha" principal={<span className="font-semibold tabular-nums">{usd(f.precioVenta)}</span>} apoyo={`Costo ${usd(f.costoMercancia)} · Fulfillment ${usd(f.fulfillment)}`} />
        <Celda
          nombre="Utilidad bruta y margen bruto"
          alinear="derecha"
          principal={<span className="tabular-nums">{usd(f.utilidad)}</span>}
          apoyo={
            f.margen === null ? (
              "Sin margen"
            ) : (
              <span className="inline-flex items-center gap-1.5 tabular-nums">
                {margenBajo(f.margen) && <Punto clase="bg-destructive" texto="Margen bajo" />}
                {Math.round(f.margen * 100)} % de margen bruto
              </span>
            )
          }
        />
        <Celda
          nombre="Estado y venta"
          principal={estado ? <Badge color={estado.color}>{estado.etiqueta}</Badge> : <span className="text-muted-foreground">—</span>}
          apoyo={venta ? <ConPunto color={venta.color} texto={venta.etiqueta} /> : "Sin estado de venta"}
        />
        {verVentas && <CeldaVentas f={f} />}
        <Celda
          nombre="Dónde está y reposición"
          principal={ubicacion ? <ConPunto color={ubicacion.color} texto={ubicacion.etiqueta} /> : <span className="text-muted-foreground">—</span>}
          apoyo={reposicion ? <ConPunto color={reposicion.color} texto={reposicion.etiqueta} /> : "Sin reposición"}
        />
        <Celda
          nombre="Próxima revisión"
          principal={
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              {f.revisionVencida && <Punto clase="bg-warning" texto="Revisión vencida" />}
              {fechaCorta(f.proximaRevision)}
            </span>
          }
        />
      </span>

      <ChevronRightIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 lg:order-last" />
    </button>
  );
  // Con «Eliminar» (solo un administrador) la fila es el botón que abre la ficha y, al lado, el de eliminar: un botón no va dentro de otro.
  if (!alEliminar) return fila;
  return (
    <div className="flex items-center">
      <div className="min-w-0 flex-1">{fila}</div>
      <BotonEliminarFila f={f} alEliminar={alEliminar} />
    </div>
  );
}
