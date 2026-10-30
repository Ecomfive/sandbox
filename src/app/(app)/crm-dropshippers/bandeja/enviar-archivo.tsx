"use client";

import { useEffect, useState, useTransition } from "react";

/* eslint-disable @next/next/no-img-element -- vista previa local de la foto que se va a mandar (una dirección temporal del navegador) */
import { anilloFoco, fieldClass, labelClass } from "@/components/ui/field";
import { Ventana } from "@/components/ui/ventana";
import { supabase } from "@/lib/supabase/client";
import { motivoDeRechazoEnvio } from "@/lib/whatsapp/archivos";
import { enviarArchivoPorWhatsapp, prepararEnvioArchivo } from "./actions";
import { enviarArchivoInterno, prepararArchivoInterno } from "./interno-actions";

/** Lo que se acepta al elegir un archivo para mandar por WhatsApp (el servidor vuelve a revisar el contenido). */
export const ACEPTAR_ENVIO = "image/jpeg,image/png,audio/*,video/mp4,video/3gpp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.m4a,.aac,.ogg,.amr";

/** Lo que se acepta en el chat interno: fotos JPG o PNG, audios y documentos (el servidor vuelve a revisar el contenido). Sin video. */
export const ACEPTAR_INTERNO = "image/jpeg,image/png,audio/*,.m4a,.aac,.ogg,.mp3,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt";

const tamanoLegible = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * Mandar un archivo por WhatsApp (29 oct 2026): foto, audio, video o documento. Se ve una vista previa, se puede escribir un texto al pie (menos en un audio) y al enviar el
 * archivo se sube directo al almacenamiento (permiso firmado) y el servidor lo revisa por su contenido y lo manda.
 */
export function EnviarArchivo({ conversacionId, nombre, archivo, alCerrar, alEnviado, interno = false }: { conversacionId: string; nombre: string; archivo: File; alCerrar: () => void; alEnviado: () => void; interno?: boolean }) {
  const [pie, setPie] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [paso, setPaso] = useState<"subiendo" | "enviando" | null>(null);
  const [, empezar] = useTransition();
  const esImagen = archivo.type.startsWith("image/");
  const esAudio = archivo.type.startsWith("audio/") || /\.(m4a|aac|ogg|amr|mp3)$/i.test(archivo.name);
  const esVideo = archivo.type.startsWith("video/");
  const rechazo = motivoDeRechazoEnvio({ tamano: archivo.size, nombre: archivo.name, tipo: archivo.type });

  // La vista previa es una dirección temporal del navegador: se crea una vez (el cuadro solo se monta con un archivo elegido) y se suelta al cerrar.
  const [vista] = useState(() => (esImagen || esAudio || esVideo ? URL.createObjectURL(archivo) : null));
  useEffect(() => () => (vista ? URL.revokeObjectURL(vista) : undefined), [vista]);

  function enviar() {
    if (rechazo || paso) return;
    setError(null);
    empezar(async () => {
      setPaso("subiendo");
      const permiso = await (interno ? prepararArchivoInterno : prepararEnvioArchivo)(conversacionId, archivo.name, archivo.size).catch(() => ({ error: "No se pudo preparar la subida." }));
      if ("error" in permiso) {
        setPaso(null);
        return setError(permiso.error);
      }
      const { error: errorSubida } = await supabase.storage.from("whatsapp-importados").uploadToSignedUrl(permiso.ruta, permiso.token, archivo, { contentType: archivo.type || undefined });
      if (errorSubida) {
        setPaso(null);
        return setError("No se pudo subir el archivo. Revisa tu conexión e inténtalo de nuevo.");
      }
      setPaso("enviando");
      const r = await (interno ? enviarArchivoInterno : enviarArchivoPorWhatsapp)(conversacionId, permiso.ruta, archivo.name, pie).catch(() => ({ error: "No se pudo mandar. Inténtalo de nuevo." }));
      setPaso(null);
      if ("error" in r) setError(r.error);
      else alEnviado();
    });
  }

  return (
    <Ventana abierto alCerrar={paso ? () => undefined : alCerrar} titulo={interno ? `Mandar a ${nombre} (chat interno)` : `Mandar a ${nombre}`} ancho="sm">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-3">
          {esImagen && vista && <img src={vista} alt={`Vista previa de ${archivo.name}`} className="max-h-64 max-w-full rounded-md object-contain" />}
          {esVideo && vista && <video controls src={vista} className="max-h-64 max-w-full rounded-md" />}
          {esAudio && vista && <audio controls src={vista} className="max-w-full" />}
          <span className="max-w-full truncate text-sm font-medium">{archivo.name}</span>
          <span className="text-xs text-muted-foreground tabular-nums">{tamanoLegible(archivo.size)}</span>
        </div>
        {!esAudio && (
          <label className="flex flex-col gap-1">
            <span className={labelClass}>Texto (opcional)</span>
            <textarea value={pie} onChange={(e) => setPie(e.target.value)} rows={2} maxLength={1024} disabled={!!paso} data-enfocar className={`${fieldClass} w-full resize-y`} />
          </label>
        )}
        {(rechazo || error) && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {rechazo ?? error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {paso && <span className="mr-auto text-sm text-muted-foreground">{paso === "subiendo" ? "Subiendo el archivo…" : "Mandándolo por WhatsApp…"}</span>}
          <button type="button" onClick={alCerrar} disabled={!!paso} className={`inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted disabled:opacity-50 ${anilloFoco}`}>
            Cancelar
          </button>
          <button type="submit" disabled={!!rechazo || !!paso} className={`inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}>
            {paso ? "Enviando…" : "Enviar"}
          </button>
        </div>
      </form>
    </Ventana>
  );
}
