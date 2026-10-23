"use client";

import { useState, useTransition } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { ArchivarIcon } from "@/lib/nav-icons";
import { apagarPublicacion } from "./actions";
import type { FilaPublicacion } from "./def-publicaciones";

/**
 * «Apagar en Dropi» de la ficha (pedido de Hernán, 23 oct 2026): lo que se hace a mano cuando un producto se queda sin stock. No apaga
 * nada en el momento: deja pendiente que «Aplicar en Dropi» saque el stock y archive. De una publicación pública, la persona elige cuáles de
 * sus privadas («P-MA …») se apagan con ella; una privada se apaga sola y además se le quita la privatización.
 */
export function BotonApagarDropi({ p, deshabilitado }: { p: FilaPublicacion; deshabilitado: boolean }) {
  const { mostrarToast } = useToast();
  const [abierta, setAbierta] = useState(false);
  const [elegidas, setElegidas] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();
  const esPrivada = p.tipoDropi === "privado";
  const apagadoPendiente = p.cambioDropi?.tipo === "apagar" && p.cambioDropi.estado !== "aplicado";

  function abrir() {
    // Por defecto, todas las privadas con el producto (es lo que se hace casi siempre); la persona quita las que no.
    setElegidas(new Set(p.privadas.map((x) => x.id)));
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

  return (
    <>
      <BotonAccion icono={ArchivarIcon} disabled={deshabilitado || apagadoPendiente} onClick={abrir}>
        {apagadoPendiente ? "Apagado pendiente" : "Apagar en Dropi"}
      </BotonAccion>
      <Ventana abierto={abierta} alCerrar={() => setAbierta(false)} titulo="Apagar en Dropi" ancho="sm">
        <div className="flex flex-col gap-4 p-5 text-sm">
          <p className="m-0">
            <strong className="font-medium">{p.nombre}</strong> (ID {p.dropiId}): en Dropi se saca todo el stock{esPrivada ? ", se quita la privatización" : ""} y se archiva. Queda pendiente hasta que alguien pulse «Aplicar en Dropi». Si
            Dropi no deja archivarlo (tiene órdenes pendientes de despacho), se reintenta en cada «Aplicar en Dropi».
          </p>
          {p.privadas.length > 0 && (
            <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
              <legend className="mb-1 p-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Sus publicaciones privadas</legend>
              {p.privadas.map((x) => (
                <label key={x.id} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
                  <input type="checkbox" checked={elegidas.has(x.id)} onChange={() => alternar(x.id)} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{x.nombre}</span>
                    <span className="block text-xs text-muted-foreground">
                      {x.dropiId ? `ID ${x.dropiId}` : "Sin ID de Dropi"}
                      {x.archivada ? " · ya archivada en el sistema" : ""}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
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
              {pendiente ? "Un momento..." : elegidas.size > 0 ? `Dejar pendiente (${elegidas.size + 1})` : "Dejar pendiente"}
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
