"use client";

import { useEffect, useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { DeshacerIcon } from "@/lib/nav-icons";
import { deshacerCambioPendiente, listarCambiosPendientes, type CambioPendienteVista } from "./pendientes-actions";

const ETIQUETA_TIPO = { cambio: "Cambio", apagar: "Apagar", republicar: "Republicar", archivar: "Archivar", crear: "Publicar", privatizar: "Privatizar" } as const;
const hora = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });

/**
 * Todos los cambios que esperan «Aplicar en Dropi» (pedido de Hernán, 23 oct 2026): lo que se abre al pulsar «N cambios esperan para Dropi».
 * Cada uno dice qué lleva y qué pasa en el sistema si se deshace, y «Deshacer» lo quita de la cola y deja la publicación como estaba antes
 * (el nombre o el precio anterior, o deja de verse apagada). Solo mientras Dropi no se haya tocado.
 */
export function VentanaCambiosPendientes({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  const [cambios, setCambios] = useState<CambioPendienteVista[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, empezar] = useTransition();

  const leer = () => listarCambiosPendientes().catch(() => ({ error: "No se pudieron leer los cambios pendientes.", cambios: undefined }));
  // Se leen al abrir la ventana (y de nuevo después de deshacer uno).
  useEffect(() => {
    if (!abierta) return;
    let vigente = true;
    void leer().then((r) => {
      if (!vigente) return;
      setError(r.error ?? null);
      setCambios(r.cambios ?? []);
    });
    return () => {
      vigente = false;
    };
  }, [abierta]);

  function deshacer(c: CambioPendienteVista) {
    empezar(async () => {
      const r = await deshacerCambioPendiente(c.id).catch(() => ({ error: "No se pudo. Inténtalo de nuevo.", detalle: undefined }));
      if (r.error) return void mostrarToast(r.error, "destructive");
      mostrarToast(r.detalle ?? "Cambio deshecho");
      const nueva = await leer();
      setError(nueva.error ?? null);
      setCambios(nueva.cambios ?? []);
    });
  }

  return (
    <Ventana abierto={abierta} alCerrar={alCerrar} titulo="Cambios pendientes para Dropi" ancho="lg">
      <div className="flex flex-col gap-4 p-5 text-sm">
        {cambios === null ? (
          <p className="m-0 text-muted-foreground">Buscando los cambios pendientes…</p>
        ) : error ? (
          <p role="alert" className="m-0 text-destructive">
            {error}
          </p>
        ) : cambios.length === 0 ? (
          <p className="m-0 text-muted-foreground">No hay cambios pendientes para Dropi.</p>
        ) : (
          <>
            <p className="m-0 text-muted-foreground">Esto es lo que se aplica en Dropi al pulsar «Aplicar en Dropi». Antes de eso, cualquiera se puede deshacer: el sistema queda como estaba.</p>
            <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0">
              {cambios.map((c) => (
                <li key={c.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="m-0 truncate font-medium">
                      <span className="mr-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{ETIQUETA_TIPO[c.tipo]}</span>
                      {c.publicacion}
                    </p>
                    {c.lineas.map((l) => (
                      <p key={l} className="m-0 text-xs tabular-nums">
                        {l}
                      </p>
                    ))}
                    <p className="m-0 text-xs text-muted-foreground">
                      {c.deshacible ? c.alDeshacer : ""}
                      {c.creadoPor ? `${c.deshacible ? " · " : ""}${c.creadoPor}, ${hora(c.creadoEn)}` : ""}
                    </p>
                    {c.error && (
                      <p className="m-0 flex items-center gap-1.5 text-xs text-destructive">
                        <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
                        {c.error}
                      </p>
                    )}
                    {!c.deshacible && c.motivoNo && <p className="m-0 text-xs text-destructive">{c.motivoNo}</p>}
                  </div>
                  {c.deshacible && (
                    <button
                      type="button"
                      onClick={() => deshacer(c)}
                      disabled={trabajando}
                      aria-label={`Deshacer el cambio de ${c.publicacion}`}
                      className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-40 ${anilloFoco}`}
                    >
                      <DeshacerIcon className="h-4 w-4" />
                      Deshacer
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <div>
          <button type="button" onClick={alCerrar} className={`inline-flex min-h-10 items-center rounded-md border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted ${anilloFoco}`}>
            Cerrar
          </button>
        </div>
      </div>
    </Ventana>
  );
}
