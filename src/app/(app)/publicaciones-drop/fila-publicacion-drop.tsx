"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { BotonIconoFila } from "@/app/(app)/publicaciones-dropi/boton-icono-fila";
import { useToast } from "@/components/ui/toast";
import { anilloFoco } from "@/components/ui/field";
import { ApagarIcon, CandadoIcon, EtiquetaIcon, InventarioIcon, PapeleraIcon, ReactivarIcon } from "@/lib/nav-icons";
import { accionDeEstado, ETIQUETA_ESTADO_DROP, motivoAccesoPrivado, motivoCambioEstado, motivoEliminar, motivoGestionarInventario, motivoLiquidacion } from "@/lib/publicaciones-drop/acciones";
import { formatoEnDolares, formatoMonto, type MonedaPublicaciones } from "@/lib/publicaciones/moneda";
import { vincularPublicacionDrop } from "./actions";
import { margenBajoDrop, sinStockDrop, type FilaPublicacionDrop } from "./def-publicaciones-drop";
import { DialogoAccesoPrivado, DialogoSolicitudInventario } from "./dialogos-fila-drop";

const AVISO_SIN_CONEXION = "Todavía no se escribe en Drop desde el sistema: por ahora solo se leen sus publicaciones. Hazlo en Drop.";

/**
 * Una publicación de Drop como fila de la lista (datos de Drop desde la migración 0221, 3 nov 2026): foto, nombre, ID de Drop, precio (en colones, con su valor
 * en dólares), inventario, margen y el producto vinculado; si no está vinculada, la sugerencia de la lectura con «Vincular» para confirmarla. Los botones
 * de Drop: inactivar o activar, gestionar inventario (pedir un ingreso: el stock no se edita), dar acceso privado (desde el mismo ID, con el correo del cliente), liquidación (pendiente) y
 * eliminar; no hay «Republicar» ni «Archivar» como en Dropi (DROP-REFERENCIA.md). Los botones no se esconden: si no se
 * pueden usar van apagados y dicen por qué. Todavía no escriben en Drop, así que pulsarlos solo avisa.
 */
export function FilaPublicacionDropLista({ f, moneda, puedeEscribir }: { f: FilaPublicacionDrop; moneda: MonedaPublicaciones; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const router = useRouter();
  const [pendiente, empezar] = useTransition();
  const estado = { estado: f.estado, idDrop: f.idDrop };
  const cambio = accionDeEstado(estado);
  const aviso = () => mostrarToast(AVISO_SIN_CONEXION);
  const [dialogo, setDialogo] = useState<"inventario" | "privado" | null>(null);
  const enDolares = formatoEnDolares(f.precio, moneda);
  const vincular = (skuId: string) =>
    empezar(async () => {
      const r = await vincularPublicacionDrop(f.id, skuId).catch(() => ({ error: "No se pudo vincular. Inténtalo de nuevo." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      mostrarToast(`${f.nombre}: vinculada a ${r.producto.codigo}.`);
      router.refresh();
    });
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap">
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {f.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- fotos de Drop (Google Cloud Storage)
          <img src={f.fotoUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{f.nombre}</span>
          {f.estado === "inactivo" && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{ETIQUETA_ESTADO_DROP[f.estado]}</span>}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {f.idDrop || "Sin ID de Drop"} · SKU de Drop: {f.skuDrop || "—"}
        </span>
        {/* Los códigos de Producto no tienen espacios («ACEITE/OREGANO/CAPSULAS/300/BLANCO»): se cortan donde haga falta en pantallas angostas. */}
        <span className="min-w-0 text-xs [overflow-wrap:anywhere]">
          {f.producto ? (
            <span className="text-muted-foreground">
              Vinculada a <span className="font-medium text-foreground">{f.producto.codigo}</span> {f.producto.nombre}
            </span>
          ) : f.sugerido ? (
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-muted-foreground">
                Sugerido: <span className="font-medium text-foreground">{f.sugerido.codigo}</span> {f.sugerido.nombre}
              </span>
              {puedeEscribir && (
                <button
                  type="button"
                  disabled={pendiente}
                  onClick={() => vincular(f.sugerido!.id)}
                  className={`rounded px-1.5 py-0.5 font-medium text-primario hover:underline disabled:opacity-50 ${anilloFoco}`}
                >
                  {pendiente ? "Vinculando…" : "Vincular"}
                </button>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground">Sin vincular a un producto (sin candidato)</span>
          )}
        </span>
      </div>
      <div className="grid shrink-0 grid-cols-3 gap-4 text-right text-xs sm:w-[19rem]">
        <span className="flex flex-col">
          <span className="text-muted-foreground">Precio</span>
          <span className="font-semibold tabular-nums">{formatoMonto(f.precio, moneda)}</span>
          {enDolares && <span className="text-[11px] text-muted-foreground tabular-nums">{enDolares}</span>}
        </span>
        <span className="flex flex-col">
          <span className="text-muted-foreground">Inventario</span>
          <span className={`font-semibold tabular-nums ${sinStockDrop(f) ? "text-destructive" : ""}`}>{f.inventario === null ? "—" : f.inventario.toLocaleString("es-PA")}</span>
        </span>
        <span className="flex flex-col">
          <span className="text-muted-foreground">Margen</span>
          <span className={`font-semibold tabular-nums ${margenBajoDrop(f) ? "text-destructive" : ""}`}>{f.margen === null ? "—" : `${Math.round(f.margen * 100)} %`}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">{f.utilidad !== null ? formatoMonto(f.utilidad, moneda) : f.producto ? "sin costo" : "sin vincular"}</span>
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <BotonIconoFila
          texto={cambio.texto}
          motivo={motivoCambioEstado(estado)}
          icono={cambio.accion === "inactivar" ? ApagarIcon : ReactivarIcon}
          nombre={f.nombre}
          onClick={aviso}
          activo={cambio.accion === "activar" ? "azul" : undefined}
        />
        <BotonIconoFila texto="Gestionar inventario" motivo={motivoGestionarInventario(estado)} icono={InventarioIcon} nombre={f.nombre} onClick={() => setDialogo("inventario")} />
        <BotonIconoFila texto="Dar acceso privado" motivo={motivoAccesoPrivado(estado)} icono={CandadoIcon} nombre={f.nombre} onClick={() => setDialogo("privado")} />
        <BotonIconoFila texto="Poner en liquidación" motivo={motivoLiquidacion()} icono={EtiquetaIcon} nombre={f.nombre} onClick={aviso} />
        <BotonIconoFila
          texto="Eliminar publicación"
          motivo={motivoEliminar(estado)}
          icono={PapeleraIcon}
          nombre={f.nombre}
          onClick={aviso}
          clase="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
        />
      </div>
      {dialogo === "inventario" && <DialogoSolicitudInventario nombre={f.nombre} alCerrar={() => setDialogo(null)} />}
      {dialogo === "privado" && <DialogoAccesoPrivado nombre={f.nombre} alCerrar={() => setDialogo(null)} />}
    </div>
  );
}
