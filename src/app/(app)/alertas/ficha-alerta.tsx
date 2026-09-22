"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { formatearFecha } from "@/lib/formato";
import { CalendarioIcon, CheckIcon, FlechaAbajoIcon, FlechaArribaIcon, InventarioIcon, ProductoIcon } from "@/lib/nav-icons";
import { actualizarEstadoAlerta, obtenerHistorialAlerta } from "./actions";
import { ETIQUETA_ESTADO_ALERTA } from "./def-alertas";
import type { AlertaFila } from "./tabla-alertas";

const ESTADO_TONO = { abierta: "warning", reclamada: "info", resuelta: "success" } as const;

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

function BotonNavegar({ texto, icono: Icono, activo, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; activo: boolean; alHacerClic: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!activo}
        onClick={() => activo && alHacerClic()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${
          activo ? "hover:bg-muted" : "cursor-default opacity-40"
        }`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

/**
 * Ficha de una alerta de inventario: el panel a la derecha que se abre al pulsar su fila, con la misma
 * estructura que `FichaCuenta` y `FichaSku` — cabecera con su insignia de estado, flechas de anterior y
 * siguiente, una fila de botones para pasar de estado y los datos en bloques con ícono. **La tabla no tiene
 * columna de acciones**: se marca reclamada o resuelta desde aquí. La actividad va al final.
 */
export function FichaAlerta({
  alerta,
  orden,
  codigoPais,
  puedeEscribir,
  alIr,
  alCerrar,
}: {
  alerta: AlertaFila | undefined;
  orden: string[];
  codigoPais: string;
  puedeEscribir: boolean;
  alIr: (id: string) => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const indice = alerta ? orden.indexOf(alerta.id) : -1;
  const anterior = indice > 0 ? orden[indice - 1] : null;
  const siguiente = indice >= 0 && indice < orden.length - 1 ? orden[indice + 1] : null;

  function cambiarEstado(estado: "reclamada" | "resuelta") {
    if (!alerta) return;
    setError(null);
    const formData = new FormData();
    formData.set("id", alerta.id);
    formData.set("estado", estado);
    startTransition(async () => {
      try {
        await actualizarEstadoAlerta(formData);
        mostrarToast(`Alerta marcada como ${ETIQUETA_ESTADO_ALERTA[estado].toLowerCase()}`);
        setVersion((v) => v + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cambiar el estado.");
      }
    });
  }

  return (
    <Ventana
      abierto={!!alerta}
      alCerrar={alCerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        alerta && (
          <>
            <span className="text-lg font-semibold">{alerta.sku}</span>
            <Badge tone={ESTADO_TONO[alerta.estado]}>{ETIQUETA_ESTADO_ALERTA[alerta.estado]}</Badge>
          </>
        )
      }
      navegacion={
        <>
          <BotonNavegar texto="Alerta anterior" icono={FlechaArribaIcon} activo={!!anterior && !pending} alHacerClic={() => anterior && alIr(anterior)} />
          <BotonNavegar texto="Alerta siguiente" icono={FlechaAbajoIcon} activo={!!siguiente && !pending} alHacerClic={() => siguiente && alIr(siguiente)} />
        </>
      }
    >
      {alerta && (
        <div className="flex flex-1 flex-col">
          <p className="px-5 pt-5 pb-4 text-sm text-muted-foreground">{alerta.nombre}</p>

          {puedeEscribir && alerta.estado !== "resuelta" && (
            <div className="flex flex-col gap-2 border-y border-border px-5 py-3">
              <div className="flex flex-wrap gap-2">
                {alerta.estado === "abierta" && (
                  <BotonAccion icono={CheckIcon} tono="neutro" disabled={pending} onClick={() => cambiarEstado("reclamada")}>
                    {pending ? "Guardando..." : "Marcar reclamada"}
                  </BotonAccion>
                )}
                <BotonAccion icono={CheckIcon} tono="oscuro" disabled={pending} onClick={() => cambiarEstado("resuelta")}>
                  {pending ? "Guardando..." : "Marcar resuelta"}
                </BotonAccion>
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col divide-y divide-border border-t border-border p-5">
            <Seccion icono={ProductoIcon} titulo="Producto">
              <dl className="flex flex-col gap-3">
                <Dato etiqueta="Nombre">{alerta.nombre}</Dato>
                <Dato etiqueta="SKU">{alerta.sku}</Dato>
              </dl>
            </Seccion>

            <Seccion icono={InventarioIcon} titulo="Cantidad">
              <dl className="flex flex-col gap-3">
                <Dato etiqueta="Pendiente de retorno">{alerta.cantidad}</Dato>
              </dl>
            </Seccion>

            <Seccion icono={CalendarioIcon} titulo="Fechas">
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Dato etiqueta="Detectada">{formatearFecha(alerta.fecha_deteccion)}</Dato>
                <Dato etiqueta="Reclamada">{alerta.fecha_reclamo ? formatearFecha(alerta.fecha_reclamo) : "—"}</Dato>
              </dl>
            </Seccion>
          </div>

          <HistorialGenerico id={alerta.id} codigoPais={codigoPais} version={version} obtener={obtenerHistorialAlerta} />
        </div>
      )}
    </Ventana>
  );
}
