"use client";

import { useState, useTransition } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { ArchivarIcon } from "@/lib/nav-icons";
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
 * «Apagar en Dropi» de la ficha (pedido de Hernán, 23 oct 2026): el mismo proceso que se hace a mano en Dropi cuando un producto se queda
 * sin stock. Lista la publicación y las demás del mismo producto (el público y sus privadas «P-MA …»), cada una con lo que se le va a hacer,
 * y la persona elige cuáles se apagan. No toca Dropi en el momento: en el sistema quedan como apagadas (en Archivados, «Apagado pendiente») y
 * «Aplicar en Dropi» hace los pasos en Dropi. Si Dropi no deja archivar, se reintenta en cada «Aplicar en Dropi».
 */
export function BotonApagarDropi({ p, deshabilitado }: { p: FilaPublicacion; deshabilitado: boolean }) {
  const { mostrarToast } = useToast();
  const [abierta, setAbierta] = useState(false);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function abrir() {
    // Desde un público, sus privadas vienen marcadas (es lo que se hace casi siempre); desde una privada, las demás vienen sin marcar.
    setElegidas(new Set(p.tipoDropi === "privado" ? [] : p.grupo.map((x) => x.id)));
    setError(null);
    setAbierta(true);
  }
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
      setAbierta(false);
      mostrarToast(r.detalle ?? "Apagado pendiente");
    });
  }

  const yo: Paso = { id: p.id, nombre: p.nombre, dropiId: p.dropiId, tipo: p.tipoDropi, stock: p.stockProveedor, correo: p.privatizadoEmail };
  return (
    <>
      <BotonAccion icono={ArchivarIcon} disabled={deshabilitado || p.apagadoPendiente} onClick={abrir}>
        {p.apagadoPendiente ? "Apagado pendiente" : "Apagar en Dropi"}
      </BotonAccion>
      <Ventana abierto={abierta} alCerrar={() => setAbierta(false)} titulo="Apagar en Dropi" ancho="md">
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
            <button type="button" onClick={() => setAbierta(false)} className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
              Cancelar
            </button>
          </div>
        </div>
      </Ventana>
    </>
  );
}
