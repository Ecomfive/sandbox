"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { AdjuntoIcon, PapeleraIcon } from "@/lib/nav-icons";
import { supabase } from "@/lib/supabase/client";
import { descartarComprobanteSubido, eliminarComprobante, guardarComprobante, listarComprobantes, prepararSubidaComprobante, type Comprobante } from "./comprobantes-actions";

const ACEPTA = "image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf";
const MAX = 15 * 1024 * 1024;

/** Los comprobantes de un movimiento (factura, recibo): se adjuntan desde su ficha y se abren con un enlace firmado. */
export function ComprobantesMovimiento({ movimientoId, puedeEscribir }: { movimientoId: string; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [lista, setLista] = useState<Comprobante[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const cargar = useCallback(async () => {
    const r = await listarComprobantes(movimientoId).catch(() => ({ error: "No se pudieron leer los comprobantes." }));
    if ("error" in r) setError(r.error);
    else {
      setError(null);
      setLista(r.comprobantes);
    }
  }, [movimientoId]);

  useEffect(() => {
    let vigente = true;
    listarComprobantes(movimientoId)
      .catch(() => ({ error: "No se pudieron leer los comprobantes." }))
      .then((r) => {
        if (!vigente) return;
        if ("error" in r) setError(r.error);
        else setLista(r.comprobantes);
      });
    return () => {
      vigente = false;
    };
  }, [movimientoId]);

  async function subir(archivo: File) {
    if (archivo.size > MAX) {
      mostrarToast("El archivo pesa más de 15 MB.", "destructive");
      return;
    }
    setSubiendo(true);
    try {
      const permiso = await prepararSubidaComprobante(movimientoId, archivo.name);
      if ("error" in permiso) throw new Error(permiso.error);
      const { error: e } = await supabase.storage.from("fin-comprobantes").uploadToSignedUrl(permiso.ruta, permiso.token, archivo, { contentType: archivo.type || "application/octet-stream" });
      if (e) {
        await descartarComprobanteSubido(movimientoId, permiso.ruta);
        throw new Error("No se pudo subir el archivo.");
      }
      const r = await guardarComprobante(movimientoId, permiso.ruta, archivo.name);
      if (r.error) throw new Error(r.error);
      mostrarToast("Comprobante adjuntado");
      await cargar();
    } catch (e) {
      mostrarToast(e instanceof Error ? e.message : "No se pudo adjuntar.", "destructive");
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function quitar(c: Comprobante) {
    if (!confirm(`¿Quitar el comprobante «${c.nombre}»?`)) return;
    const r = await eliminarComprobante(c.id).catch(() => ({ error: "No se pudo quitar." }));
    if (r.error) mostrarToast(r.error, "destructive");
    else await cargar();
  }

  return (
    <Seccion icono={AdjuntoIcon} titulo="Comprobantes">
      {error && <p className="text-sm text-muted-foreground">{error}</p>}
      {lista && lista.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {lista.map((c) => (
            <li key={c.id} className="flex items-center gap-2">
              {c.tipo.startsWith("image/") && c.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.url} alt="" className="h-10 w-10 shrink-0 rounded border border-border object-cover" />
              ) : (
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-border text-xs text-muted-foreground">
                  PDF
                </span>
              )}
              {c.url ? (
                <a href={c.url} target="_blank" rel="noopener noreferrer" className={`min-w-0 flex-1 truncate underline ${anilloFoco}`}>
                  {c.nombre}
                  <span className="sr-only"> (se abre en una pestaña nueva)</span>
                </a>
              ) : (
                <span className="min-w-0 flex-1 truncate">{c.nombre}</span>
              )}
              {puedeEscribir && (
                <Tooltip texto="Quitar comprobante">
                  <button type="button" onClick={() => quitar(c)} aria-label={`Quitar ${c.nombre}`} className={`flex min-h-8 min-w-8 items-center justify-center !rounded-md text-muted-foreground hover:bg-muted ${anilloFoco}`}>
                    <PapeleraIcon className="h-4 w-4" />
                  </button>
                </Tooltip>
              )}
            </li>
          ))}
        </ul>
      )}
      {puedeEscribir && (
        <div>
          <label htmlFor={`comprobante-${movimientoId}`} className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm font-medium hover:bg-muted ${subiendo ? "pointer-events-none opacity-50" : ""}`}>
            <AdjuntoIcon className="h-4 w-4" />
            {subiendo ? "Subiendo…" : "Adjuntar factura o recibo"}
          </label>
          <input
            ref={entrada}
            id={`comprobante-${movimientoId}`}
            type="file"
            accept={ACEPTA}
            className="sr-only"
            disabled={subiendo}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void subir(f);
            }}
          />
        </div>
      )}
    </Seccion>
  );
}
