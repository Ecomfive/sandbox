"use client";

import { useCallback, useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { ACEPTAR_ADJUNTOS, iconoArchivo, MAX_ADJUNTOS_COMENTARIO, motivoDeRechazo } from "@/lib/compras/adjuntos";
import { AdjuntoIcon, CerrarIcon } from "@/lib/nav-icons";
import { supabase } from "@/lib/supabase/client";
import { descartarAdjuntoSubido, prepararSubidaAdjuntoComentario, type AdjuntoCompra, type AdjuntoSubido } from "./actions";

const BUCKET = "wms-compras";

/** Un archivo que se está adjuntando al comentario que se escribe: sube apenas se elige, sin esperar a «Comentar». */
export interface Pendiente {
  id: string;
  nombre: string;
  tipo: string;
  /** Una vista previa (solo imágenes), del archivo local. */
  vista: string | null;
  estado: "subiendo" | "listo" | "error";
  ruta?: string;
  error?: string;
}

/**
 * Los archivos de un comentario nuevo: se agregan con el botón, pegando una imagen o arrastrándola, suben al instante al
 * almacenamiento privado y se pueden quitar antes de comentar. `listos` es lo que viaja con el comentario. Un archivo que
 * se subió pero no se envió (se quitó o se cerró la ficha) se borra.
 */
export function useAdjuntosPendientes(compraId: string) {
  const { mostrarToast } = useToast();
  const [pendientes, setPendientes] = useState<Pendiente[]>([]);
  const actuales = useRef<Pendiente[]>([]);
  useEffect(() => {
    actuales.current = pendientes;
  }, [pendientes]);

  // Al cerrar la ficha con archivos subidos sin enviar, se borran del almacenamiento (y se sueltan las vistas previas).
  useEffect(
    () => () => {
      for (const p of actuales.current) {
        if (p.vista) URL.revokeObjectURL(p.vista);
        if (p.ruta) void descartarAdjuntoSubido(compraId, p.ruta);
      }
    },
    [compraId],
  );

  const actualizar = useCallback((id: string, cambios: Partial<Pendiente>) => setPendientes((l) => l.map((p) => (p.id === id ? { ...p, ...cambios } : p))), []);

  const agregar = useCallback(
    (archivos: File[]) => {
      let sitio = MAX_ADJUNTOS_COMENTARIO - actuales.current.length;
      for (const archivo of archivos) {
        const motivo = motivoDeRechazo({ tipo: archivo.type, tamano: archivo.size, nombre: archivo.name });
        if (motivo) {
          mostrarToast(`${archivo.name}: ${motivo}`, "destructive");
          continue;
        }
        if (sitio <= 0) {
          mostrarToast(`Un comentario lleva hasta ${MAX_ADJUNTOS_COMENTARIO} archivos.`, "destructive");
          break;
        }
        sitio -= 1;
        const id = crypto.randomUUID();
        const nombre = archivo.name || (archivo.type.startsWith("image/") ? "captura.png" : "archivo");
        const nuevo: Pendiente = { id, nombre, tipo: archivo.type, vista: archivo.type.startsWith("image/") ? URL.createObjectURL(archivo) : null, estado: "subiendo" };
        actuales.current = [...actuales.current, nuevo];
        setPendientes((l) => [...l, nuevo]);
        void (async () => {
          try {
            const permiso = await prepararSubidaAdjuntoComentario(compraId, nombre);
            if ("error" in permiso) return actualizar(id, { estado: "error", error: permiso.error });
            const { error } = await supabase.storage.from(BUCKET).uploadToSignedUrl(permiso.ruta, permiso.token, archivo, { contentType: archivo.type });
            if (error) return actualizar(id, { estado: "error", error: "No se pudo subir el archivo." });
            actualizar(id, { estado: "listo", ruta: permiso.ruta });
          } catch {
            actualizar(id, { estado: "error", error: "No se pudo subir el archivo. Inténtalo de nuevo." });
          }
        })();
      }
    },
    [compraId, mostrarToast, actualizar],
  );

  const quitar = useCallback(
    (id: string) => {
      const p = actuales.current.find((x) => x.id === id);
      if (p?.vista) URL.revokeObjectURL(p.vista);
      if (p?.ruta) void descartarAdjuntoSubido(compraId, p.ruta);
      actuales.current = actuales.current.filter((x) => x.id !== id);
      setPendientes((l) => l.filter((x) => x.id !== id));
    },
    [compraId],
  );

  /** Después de comentar: los archivos ya son del comentario, así que solo se sueltan las vistas previas (no se borra nada). */
  const vaciar = useCallback(() => {
    for (const p of actuales.current) if (p.vista) URL.revokeObjectURL(p.vista);
    actuales.current = [];
    setPendientes([]);
  }, []);

  const listos: AdjuntoSubido[] = pendientes.filter((p) => p.estado === "listo" && p.ruta).map((p) => ({ ruta: p.ruta!, nombre: p.nombre }));
  const subiendo = pendientes.some((p) => p.estado === "subiendo");
  return { pendientes, agregar, quitar, vaciar, listos, subiendo, lleno: pendientes.length >= MAX_ADJUNTOS_COMENTARIO };
}

/** Las imágenes que se pegan (una captura con Ctrl+V) o se sueltan sobre el campo del comentario. */
export function archivosDe(origen: ClipboardEvent | DragEvent): File[] {
  const datos = "clipboardData" in origen ? origen.clipboardData : origen.dataTransfer;
  return [...(datos?.files ?? [])];
}

/** El botón «Adjuntar»: abre el selector de archivos (imágenes, PDF, Excel, Word, PowerPoint, CSV y texto). */
export function BotonAdjuntar({ alElegir, deshabilitado }: { alElegir: (archivos: File[]) => void; deshabilitado?: boolean }) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={entrada}
        type="file"
        multiple
        accept={ACEPTAR_ADJUNTOS}
        aria-label="Elegir archivos para adjuntar"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          alElegir([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={deshabilitado}
        onClick={() => entrada.current?.click()}
        className={`inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`}
      >
        <AdjuntoIcon className="h-3.5 w-3.5" />
        Adjuntar
      </button>
    </>
  );
}

/** Las miniaturas de lo que se va a enviar con el comentario, cada una con su ✕ para quitarla. */
export function TiraPendientes({ pendientes, alQuitar }: { pendientes: Pendiente[]; alQuitar: (id: string) => void }) {
  if (pendientes.length === 0) return null;
  return (
    <ul aria-label="Archivos para adjuntar" className="m-0 flex list-none flex-wrap gap-2 p-0">
      {pendientes.map((p) => (
        <li
          key={p.id}
          title={p.estado === "error" ? p.error : p.nombre}
          className={`group relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border bg-muted text-muted-foreground ${p.estado === "error" ? "border-2 border-destructive" : "border-border"}`}
        >
          {p.vista ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.vista} alt={p.nombre} className={`h-full w-full object-cover ${p.estado === "subiendo" ? "opacity-50" : ""}`} />
          ) : (
            <AdjuntoIcon className="h-4 w-4" aria-hidden="true" />
          )}
          {p.estado === "subiendo" && <span className="sr-only">Subiendo…</span>}
          {p.estado === "error" && <span className="sr-only">Falló: {p.error}</span>}
          <Tooltip texto="Quitar archivo">
            <button
              type="button"
              aria-label={`Quitar ${p.nombre}`}
              onClick={() => alQuitar(p.id)}
              className={`absolute top-0 right-0 flex h-4 w-4 items-center justify-center rounded-bl-md bg-foreground/80 text-background hover:bg-foreground ${anilloFoco}`}
            >
              <CerrarIcon className="h-2.5 w-2.5" />
            </button>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}

/** Los archivos de un comentario ya enviado, debajo de su texto: las imágenes como miniaturas de 40 × 40 (se amplían al pulsarlas) y los documentos (PDF, Excel, Word…) como enlace con su ícono. */
export function GaleriaAdjuntos({ adjuntos }: { adjuntos: AdjuntoCompra[] }) {
  const [ampliada, setAmpliada] = useState<AdjuntoCompra | null>(null);
  if (adjuntos.length === 0) return null;
  const imagenes = adjuntos.filter((a) => a.clase === "foto" && a.url);
  const otros = adjuntos.filter((a) => !(a.clase === "foto" && a.url));
  return (
    <div className="mt-1.5 flex flex-col gap-2">
      {imagenes.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {imagenes.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setAmpliada(a)}
                aria-label={`Ver ${a.nombre} más grande`}
                className={`block overflow-hidden rounded-md border border-border ${anilloFoco}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={a.url!} alt={a.nombre} loading="lazy" className="h-10 w-10 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {otros.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0 text-xs">
          {otros.map((a) => (
            <li key={a.id} className="min-w-0">
              {a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer" className={`inline-flex h-10 max-w-60 items-center gap-2 rounded-md border border-border px-2.5 hover:bg-muted ${anilloFoco}`}>
                  <span aria-hidden="true" className="text-lg leading-none">
                    {iconoArchivo(a.nombre)}
                  </span>
                  <span className="truncate">{a.nombre}</span>
                </a>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <AdjuntoIcon className="h-3.5 w-3.5" />
                  {a.nombre}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {ampliada && <VisorImagen src={ampliada.url} alt={ampliada.nombre} onClose={() => setAmpliada(null)} />}
    </div>
  );
}
