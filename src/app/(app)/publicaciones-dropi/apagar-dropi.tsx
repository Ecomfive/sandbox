"use client";

import { useState, useTransition } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { ApagarIcon } from "@/lib/nav-icons";
import { BODEGA_DROPI } from "@/lib/publicaciones/automatico";
import { apagarPublicacion } from "./actions";
import type { FilaPublicacion } from "./def-publicaciones";

type Paso = { id: string; nombre: string; dropiId: string; tipo: "publico" | "privado" | null; stock: number | null; correo: string };

/** Los pasos que hace Nicole en Dropi con una publicación, en palabras: sacar el stock, quitar la privatización (un privado) y archivar. */
function Pasos({ x }: { x: Paso }) {
  const pasos = [
    x.stock && x.stock > 0 ? `Sacar el stock (${x.stock.toLocaleString("es-PA")} u., concepto «stock»)` : "Sin stock en Dropi",
    ...(x.tipo === "privado" ? [`Quitar la privatización${x.correo ? ` (${x.correo})` : ""}`] : []),
    "Archivar",
  ];
  return (
    <ol className="m-0 flex list-none flex-wrap gap-x-2 gap-y-0.5 p-0 text-xs text-muted-foreground">
      {pasos.map((t, i) => (
        <li key={t}>
          {i + 1}. {t}
        </li>
      ))}
    </ol>
  );
}

/**
 * Si una publicación se puede apagar en Dropi: tiene ID de Dropi, no es una duplicada, Dropi no la tiene ya archivada y su stock no es de la
 * bodega de Dropi (B280, que no se mueve desde aquí). Lo usan el botón de la ficha y el de la fila.
 */
export const puedeApagar = (p: FilaPublicacion): boolean => p.dropiId.trim() !== "" && !p.duplicadaDe && p.enDropi !== "archivado" && p.bodega?.id !== BODEGA_DROPI;

/**
 * «Apagar en Dropi» (pedido de Hernán, 23 oct 2026): el mismo proceso que se hace a mano en Dropi cuando un producto se queda
 * sin stock. Lista la publicación y las demás del mismo producto (el público y sus privadas «P-MA …»), cada una con lo que se le va a hacer,
 * y la persona elige cuáles se apagan. No toca Dropi en el momento: en el sistema quedan como apagadas (en Archivados, «Apagado pendiente») y
 * «Aplicar en Dropi» hace los pasos en Dropi. Si Dropi no deja archivar, se reintenta en cada «Aplicar en Dropi».
 */
function VentanaApagarDropi({ p, abierta, alCerrar }: { p: FilaPublicacion; abierta: boolean; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  // Desde un público, sus privadas vienen marcadas (es lo que se hace casi siempre); desde una privada, las demás vienen sin marcar.
  const [elegidas, setElegidas] = useState<Set<string>>(() => new Set(p.tipoDropi === "privado" ? [] : p.grupo.map((x) => x.id)));
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const alternar = (id: string) =>
    setElegidas((antes) => {
      const ahora = new Set(antes);
      if (ahora.has(id)) ahora.delete(id);
      else ahora.add(id);
      return ahora;
    });
  function confirmar() {
    empezar(async () => {
      const r = await apagarPublicacion(p.id, [...elegidas]).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      if (r.error) return void setError(r.error);
      alCerrar();
      mostrarToast(r.detalle ?? "Apagado pendiente");
    });
  }

  const yo: Paso = { id: p.id, nombre: p.nombre, dropiId: p.dropiId, tipo: p.tipoDropi, stock: p.stockProveedor, correo: p.privatizadoEmail };
  return (
    <>
      <Ventana abierto={abierta} alCerrar={alCerrar} titulo="Apagar en Dropi" ancho="md">
        <div className="flex flex-col gap-4 p-5 text-sm">
          <p className="m-0 text-muted-foreground">
            Elige qué publicaciones de este producto se apagan. En Dropi se hace lo mismo que a mano; queda pendiente hasta que alguien pulse «Aplicar en Dropi». Si Dropi no deja archivar (órdenes pendientes
            de despacho), se reintenta en cada «Aplicar en Dropi».
          </p>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            <li className="flex items-start gap-3 rounded-lg border border-foreground bg-card px-3 py-2.5">
              <input type="checkbox" checked disabled aria-label={`${p.nombre}: se apaga`} className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate font-medium">{p.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {p.dropiId ? `ID ${p.dropiId}` : "Sin ID de Dropi"} · {p.tipoDropi === "privado" ? "privada" : "pública"} · esta publicación
                </span>
                <Pasos x={yo} />
              </span>
            </li>
            {p.grupo.map((x) => (
              <li key={x.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                  <input type="checkbox" checked={elegidas.has(x.id)} onChange={() => alternar(x.id)} className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">{x.nombre}</span>
                    <span className="text-xs text-muted-foreground">
                      {x.dropiId ? `ID ${x.dropiId}` : "Sin ID de Dropi"} · {x.tipo === "privado" ? "privada" : "pública"}
                      {x.archivada ? " · ya archivada en el sistema" : ""}
                    </span>
                    <Pasos x={x} />
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {error && (
            <p role="alert" className="m-0 text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirmar}
              disabled={pendiente}
              className={`inline-flex min-h-10 items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-40 ${anilloFoco}`}
            >
              {pendiente ? "Un momento..." : `Dejar pendiente (${elegidas.size + 1})`}
            </button>
            <button type="button" onClick={alCerrar} className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
              Cancelar
            </button>
          </div>
        </div>
      </Ventana>
    </>
  );
}

/**
 * El botón «Apagar en Dropi» de la ficha. La ventana solo existe mientras está abierta, así cada vez sale con las privadas marcadas como
 * corresponde.
 */
export function BotonApagarDropi({ p, deshabilitado }: { p: FilaPublicacion; deshabilitado: boolean }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <BotonAccion icono={ApagarIcon} disabled={deshabilitado || p.apagadoPendiente} onClick={() => setAbierta(true)}>
        {p.apagadoPendiente ? "Apagado pendiente" : "Apagar en Dropi"}
      </BotonAccion>
      {abierta && <VentanaApagarDropi p={p} abierta alCerrar={() => setAbierta(false)} />}
    </>
  );
}

/**
 * El ícono «Apagar en Dropi» de cada fila de la lista, junto al de archivar: abre la misma ventana que la ficha. Una publicación que no se
 * puede apagar deja un espacio del mismo ancho, para que las filas no se corran.
 */
export function BotonApagarFila({ f }: { f: FilaPublicacion }) {
  const [abierta, setAbierta] = useState(false);
  if (!puedeApagar(f)) return <span aria-hidden="true" className="mr-1 w-9 shrink-0" />;
  const texto = f.apagadoPendiente ? "Apagado pendiente en Dropi" : "Apagar en Dropi";
  return (
    <>
      <Tooltip texto={texto}>
        <button
          type="button"
          onClick={() => setAbierta(true)}
          disabled={f.apagadoPendiente}
          aria-label={`${texto}: ${f.nombre}`}
          className={`mr-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50 ${anilloFoco}`}
        >
          <ApagarIcon className="h-4 w-4" />
        </button>
      </Tooltip>
      {abierta && <VentanaApagarDropi p={f} abierta alCerrar={() => setAbierta(false)} />}
    </>
  );
}
