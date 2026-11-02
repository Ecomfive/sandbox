"use client";

/* eslint-disable @next/next/no-img-element -- fotos de Drop (Google Cloud Storage) */
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { BotonIconoFila } from "@/app/(app)/publicaciones-dropi/boton-icono-fila";
import { EtapaCotizando, LlegadaCamino } from "@/app/(app)/publicaciones-dropi/llegada-camino";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { ActualizarIcon, ApagarIcon, ArchivarIcon, CandadoAbiertoIcon, DropIcon, EnlaceIcon, EtiquetaIcon, InventarioIcon, PapeleraIcon, PausaIcon, ReactivarIcon, TareasIcon } from "@/lib/nav-icons";
import { MOTIVO_SOLO_DROPI, accionDeEstado, ETIQUETA_ESTADO_DROP, motivoAccesoPrivado, motivoCambioEstado, motivoEliminar, motivoGestionarInventario, motivoLiquidacion } from "@/lib/publicaciones-drop/acciones";
import { formatoEnDolares, formatoMonto, type MonedaPublicaciones } from "@/lib/publicaciones/moneda";
import { vincularPublicacionDrop } from "./actions";
import { DialogoAccesoPrivado, DialogoSolicitudInventario } from "./dialogos-fila-drop";
import { margenBajoDrop, sinStockDrop, type FilaPublicacionDrop } from "./def-publicaciones-drop";

/** Las columnas de la fila en pantalla ancha (las mismas de Gestión de IDs Dropi con ventas); las usa también el encabezado, así que van juntas. */
const COLUMNAS = "lg:grid-cols-[minmax(0,2.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,1.2fr)_4rem_1rem]";

const AVISO_SIN_CONEXION = "Todavía no se escribe en Drop desde el sistema: por ahora solo se leen sus publicaciones. Hazlo en Drop.";

const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
const urlDrop = (f: FilaPublicacionDrop) => `https://app.soydrop.com/vendor/products/details/${f.dropInterno}/inventory`;

const Punto = ({ clase, texto }: { clase: string; texto: string }) => (
  <span role="img" aria-label={texto} className={`inline-block h-2 w-2 shrink-0 rounded-full ${clase}`} />
);

/** Una celda de la fila: lo principal arriba y lo de apoyo abajo; el nombre del dato solo se lee con lector de pantalla (como en Dropi). */
function Celda({ nombre, principal, apoyo, alinear = "izquierda" }: { nombre: string; principal: ReactNode; apoyo?: ReactNode; alinear?: "izquierda" | "derecha" }) {
  return (
    <span className={`flex min-w-0 flex-col gap-0.5 ${alinear === "derecha" ? "lg:items-end lg:text-right" : ""}`}>
      <span className="sr-only">{nombre}: </span>
      <span className="min-w-0 max-w-full overflow-hidden text-sm">{principal}</span>
      {apoyo && <span className="min-w-0 max-w-full truncate text-xs text-muted-foreground">{apoyo}</span>}
    </span>
  );
}

/** Un monto en la moneda de Drop con su valor en dólares en pequeño («₡3 629 US$7.97»), como `Monto` de Dropi. */
function Monto({ valor, moneda, className = "" }: { valor: number | null; moneda: MonedaPublicaciones; className?: string }) {
  const usd = formatoEnDolares(valor, moneda);
  return (
    <span className={className}>
      {formatoMonto(valor, moneda)}
      {usd && <span className="ml-1 text-xs font-normal text-muted-foreground">{usd}</span>}
    </span>
  );
}

/** Cómo está en Drop, en poco espacio: el logo de Drop con un punto del color del estado (verde = activa, gris = inactiva), como el de Dropi. */
function IconoEnDrop({ f }: { f: FilaPublicacionDrop }) {
  const activa = f.estado === "activo";
  const texto = `${ETIQUETA_ESTADO_DROP[f.estado]} en Drop`;
  return (
    <Tooltip texto={texto}>
      <span role="img" aria-label={texto} className="relative inline-flex h-7 w-7 items-center justify-center">
        <DropIcon marca className={`h-6 w-6 ${activa ? "" : "opacity-40 grayscale"}`} />
        <span aria-hidden="true" className={`absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card ${activa ? "bg-success" : "bg-muted-foreground"}`} />
      </span>
    </Tooltip>
  );
}

/** Lo que viene en camino del producto vinculado (de las compras del país), como en Gestión de IDs Dropi. */
function CeldaEnCamino({ f }: { f: FilaPublicacionDrop }) {
  const viene = f.enCamino > 0;
  const cotiza = f.enCotizacion > 0;
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
          </span>
        ) : cotiza ? (
          <span className="flex flex-wrap items-center gap-1.5 whitespace-normal lg:justify-end">{f.etapaCotizacion ? <EtapaCotizando c={f.etapaCotizacion} /> : "aún no viene"}</span>
        ) : undefined
      }
    />
  );
}

/** El nombre de cada columna, en la franja fija de arriba de la lista (solo en pantalla ancha), con la misma rejilla que la fila. */
export function EncabezadoFilasDrop() {
  const columnas: { nombre: string; derecha?: boolean }[] = [
    { nombre: "Producto" },
    { nombre: "Precio", derecha: true },
    { nombre: "Utilidad y margen", derecha: true },
    { nombre: "Ventas · 30 días", derecha: true },
    { nombre: "En camino", derecha: true },
    { nombre: "Dónde está" },
    { nombre: "En Drop" },
  ];
  return (
    // A la derecha quedan los ocho botones de la fila (36 px cada uno, 4 px entre ellos y 12 px de margen, más los 16 px de relleno de la fila).
    <div className={`hidden items-center gap-x-4 py-2.5 pr-[21.5rem] pl-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase lg:grid ${COLUMNAS}`}>
      {columnas.map((c) => (
        <span key={c.nombre} className={`min-w-0 truncate ${c.derecha ? "text-right" : ""}`}>
          {c.nombre}
        </span>
      ))}
      <span aria-hidden="true" />
    </div>
  );
}

/**
 * Una publicación de Drop como fila de la lista, igual a la de Gestión de IDs Dropi (3 nov 2026, pedido de Hernán): foto, nombre con su ID y su SKU, precio
 * (con el costo del producto y el fulfillment), utilidad y margen, ventas, en camino, dónde está y cómo está en Drop (el logo de Drop con su punto). Toda la
 * fila abre la página del producto en Drop. Si no está vinculada, la sugerencia de la lectura con «Vincular» para confirmarla. A la derecha, los mismos
 * botones que en Dropi y en el mismo orden, más «Eliminar»; los que Drop no tiene van apagados y dicen por qué. Todavía no escriben en Drop: pulsarlos avisa.
 */
export function FilaPublicacionDropLista({ f, moneda, puedeEscribir }: { f: FilaPublicacionDrop; moneda: MonedaPublicaciones; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const estado = { estado: f.estado, idDrop: f.idDrop };
  const cambio = accionDeEstado(estado);
  const aviso = () => mostrarToast(AVISO_SIN_CONEXION);
  const nada = () => {};
  const [dialogo, setDialogo] = useState<"inventario" | "privado" | null>(null);
  const vincular = (skuId: string) =>
    empezar(async () => {
      const r = await vincularPublicacionDrop(f.id, skuId).catch(() => ({ error: "No se pudo vincular. Inténtalo de nuevo." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      mostrarToast(`${f.nombre}: vinculada a ${r.producto.codigo}.`);
      router.refresh();
    });

  return (
    // En pantalla angosta los botones pasan debajo de la fila (no caben al lado); en ancha van a la derecha, como en Dropi.
    <div className="flex flex-wrap items-center lg:flex-nowrap">
      <div className="min-w-0 flex-1 basis-full lg:basis-auto">
        <div className={`group grid w-full grid-cols-[minmax(0,1fr)_1rem] items-center gap-x-4 gap-y-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${COLUMNAS}`}>
          {/* Producto */}
          <span className="flex min-w-0 items-center gap-3">
            {f.fotoUrl ? (
              <img src={f.fotoUrl} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover" />
            ) : (
              <span aria-hidden="true" className="h-12 w-12 shrink-0 rounded-lg border border-dashed border-border-control" />
            )}
            <span className="flex min-w-0 flex-col gap-0.5">
              <a href={urlDrop(f)} target="_blank" rel="noopener noreferrer" className={`truncate rounded text-sm font-medium hover:underline ${anilloFoco}`}>
                {f.nombre}
                <span className="sr-only"> (abre su página en Drop)</span>
              </a>
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                <span className="tabular-nums">{f.idDrop || "Sin ID de Drop"}</span>
                {f.producto ? (
                  <span className="font-mono font-semibold text-foreground">{f.producto.codigo}</span>
                ) : f.sugerido ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <Punto clase="bg-warning" texto="Sin vincular producto" />
                    Sugerido · <span className="font-mono font-semibold text-foreground">{f.sugerido.codigo}</span>
                    {puedeEscribir && (
                      <button
                        type="button"
                        disabled={pendiente}
                        onClick={() => vincular(f.sugerido!.id)}
                        className={`inline-flex items-center gap-1 rounded px-1 font-medium text-primario hover:underline disabled:opacity-50 ${anilloFoco}`}
                      >
                        <EnlaceIcon aria-hidden="true" className="h-3 w-3" />
                        {pendiente ? "Vinculando…" : "Vincular"}
                      </button>
                    )}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Punto clase="bg-warning" texto="Sin vincular producto" />
                    Sin SKU
                  </span>
                )}
                {f.estado === "inactivo" && <span className="font-medium">Inactiva</span>}
              </span>
            </span>
          </span>

          {/* Los datos: en pantalla ancha una columna cada uno; en angosta, debajo del producto en una fila que envuelve. */}
          <span className="order-last col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:order-none lg:contents">
            <Celda
              nombre="Precio"
              alinear="derecha"
              principal={<Monto valor={f.precio} moneda={moneda} className="font-semibold tabular-nums" />}
              apoyo={
                <span className="flex flex-col lg:items-end">
                  <span className="max-w-full truncate">Costo de producto {f.costo === null ? "—" : formatoMonto(f.costo, moneda)}</span>
                  <span className="max-w-full truncate">Fulfillment {f.fulfillment === null ? "—" : formatoMonto(f.fulfillment, moneda)}</span>
                </span>
              }
            />
            <Celda
              nombre="Utilidad bruta y margen bruto"
              alinear="derecha"
              principal={f.utilidad === null ? <span className="text-muted-foreground">—</span> : <Monto valor={f.utilidad} moneda={moneda} className="tabular-nums" />}
              apoyo={
                f.margen === null ? (
                  f.producto ? "Sin costo" : "Sin vincular"
                ) : (
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    {margenBajoDrop(f) && <Punto clase="bg-destructive" texto="Margen bajo" />}
                    {Math.round(f.margen * 100)} % de margen bruto
                  </span>
                )
              }
            />
            <Celda
              nombre="Ventas en Drop, últimos 30 días"
              alinear="derecha"
              principal={<span className="text-muted-foreground">—</span>}
              apoyo={
                f.inventario === null ? (
                  "Sin datos de Drop"
                ) : sinStockDrop(f) ? (
                  <span className="font-medium text-destructive">Sin stock</span>
                ) : (
                  <span className="tabular-nums">Stock {entero(f.inventario)}</span>
                )
              }
            />
            <CeldaEnCamino f={f} />
            <Celda
              nombre="Dónde está"
              principal={
                <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
                  <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-foreground" />
                  <span className="truncate">Bodega Drop</span>
                </span>
              }
              apoyo={f.inventario !== null ? <span className="tabular-nums">{entero(f.inventario)} u. en Drop</span> : undefined}
            />
            <Celda nombre="En Drop" principal={<IconoEnDrop f={f} />} />
          </span>

          <a
            href={urlDrop(f)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir ${f.nombre} en Drop`}
            className={`rounded text-muted-foreground transition-transform group-hover:translate-x-0.5 hover:text-foreground lg:order-last ${anilloFoco}`}
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m9 6 6 6-6 6" />
            </svg>
          </a>
        </div>
      </div>
      {/* Los mismos botones que la fila de Dropi y en su orden, más «Eliminar»: los que no aplican en Drop van apagados y dicen por qué. */}
      <div className="mb-2 ml-3 flex min-w-0 flex-wrap items-center gap-1 lg:mb-0 lg:ml-0 lg:mr-3 lg:shrink-0 lg:flex-nowrap">
        <BotonIconoFila texto="Republicar" motivo={MOTIVO_SOLO_DROPI.republicar} icono={ActualizarIcon} nombre={f.nombre} onClick={nada} />
        <BotonIconoFila texto="Dar acceso privado" motivo={motivoAccesoPrivado(estado)} icono={CandadoAbiertoIcon} nombre={f.nombre} onClick={() => setDialogo("privado")} />
        <BotonIconoFila texto="Gestionar inventario" motivo={motivoGestionarInventario(estado)} icono={InventarioIcon} nombre={f.nombre} onClick={() => setDialogo("inventario")} />
        <BotonIconoFila
          texto={cambio.texto}
          motivo={motivoCambioEstado(estado)}
          icono={cambio.accion === "inactivar" ? ApagarIcon : ReactivarIcon}
          nombre={f.nombre}
          onClick={aviso}
          activo={cambio.accion === "activar" ? "azul" : undefined}
        />
        <BotonIconoFila texto="Pausar por falta de stock" motivo={MOTIVO_SOLO_DROPI.pausar} icono={PausaIcon} nombre={f.nombre} onClick={nada} />
        <BotonIconoFila texto="Poner en liquidación" motivo={motivoLiquidacion()} icono={EtiquetaIcon} nombre={f.nombre} onClick={aviso} />
        <BotonIconoFila texto="Archivar publicación" motivo={MOTIVO_SOLO_DROPI.archivar} icono={ArchivarIcon} nombre={f.nombre} onClick={nada} />
        <BotonIconoFila
          texto="Eliminar publicación"
          motivo={motivoEliminar(estado)}
          icono={PapeleraIcon}
          nombre={f.nombre}
          onClick={aviso}
          clase="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
        />
        <BotonIconoFila texto="Tareas" motivo={MOTIVO_SOLO_DROPI.tareas} icono={TareasIcon} nombre={f.nombre} onClick={nada} />
      </div>
      {dialogo === "inventario" && <DialogoSolicitudInventario nombre={f.nombre} alCerrar={() => setDialogo(null)} />}
      {dialogo === "privado" && <DialogoAccesoPrivado nombre={f.nombre} alCerrar={() => setDialogo(null)} />}
    </div>
  );
}
