"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { labelClass } from "@/components/ui/field";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { AdjuntoIcon, PapeleraIcon } from "@/lib/nav-icons";

const BUCKET = "wms-productos";
const MAX_BYTES = 5 * 1024 * 1024;

const urlPublica = (ruta: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${ruta}`;

/**
 * Foto del producto: un único archivo, se sube apenas se elige (no se espera a «Guardar»). Usa una URL
 * firmada (que trae `prepararSubida`, propia de cada módulo) para subir directo desde el navegador sin
 * pasar el archivo por la acción del servidor. El campo real (`nombreCampo`) es un input oculto controlado
 * por estado de React (no por ref): así el formulario siempre lo lee con el valor correcto en el FormData
 * al enviar, sin depender de que una mutación imperativa haya alcanzado a aplicarse antes del submit.
 */
export function CampoFoto({
  nombreCampo,
  valorInicial,
  alCambiarSubiendo,
  prepararSubida,
  etiqueta = "Foto del producto",
}: {
  nombreCampo: string;
  valorInicial: string | null;
  alCambiarSubiendo?: (subiendo: boolean) => void;
  prepararSubida: (nombreArchivo: string) => Promise<{ ruta: string; token: string } | { error: string }>;
  /** El nombre del campo (en Compras, «Foto real del producto»: la que manda el proveedor). */
  etiqueta?: string;
}) {
  const [preview, setPreview] = useState<string | null>(valorInicial);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState(false);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    alCambiarSubiendo?.(subiendo);
  }, [subiendo, alCambiarSubiendo]);

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    if (!archivo.type.startsWith("image/")) {
      setError("Elige un archivo de imagen.");
      return;
    }
    if (archivo.size > MAX_BYTES) {
      setError("La imagen pesa más de 5 MB.");
      return;
    }

    setError(null);
    setSubiendo(true);
    try {
      const permiso = await prepararSubida(archivo.name);
      if ("error" in permiso) {
        setError(permiso.error);
        return;
      }
      const { error: errorSubida } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(permiso.ruta, permiso.token, archivo, { contentType: archivo.type });
      if (errorSubida) {
        setError(`No se pudo subir la imagen: ${errorSubida.message}`);
        return;
      }
      setPreview(urlPublica(permiso.ruta));
    } catch {
      setError("No se pudo subir la imagen. Inténtalo de nuevo.");
    } finally {
      setSubiendo(false);
    }
  }

  function quitar() {
    if (!confirm("¿Quitar la foto del producto?")) return;
    setPreview(null);
    setError(null);
  }

  return (
    <div className="flex flex-col gap-1">
      <span className={labelClass}>{etiqueta}</span>
      <input type="hidden" name={nombreCampo} value={preview ?? ""} readOnly />
      <input ref={inputArchivoRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" className="sr-only" onChange={alElegirArchivo} />
      <div className="flex items-center gap-3">
        {preview ? (
          <button
            type="button"
            onClick={() => setAmpliada(true)}
            className="h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border"
            aria-label="Ver la foto más grande"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="" className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
            <AdjuntoIcon className="h-5 w-5" />
          </div>
        )}
        <div className="flex flex-col items-start gap-1">
          <button
            type="button"
            onClick={() => inputArchivoRef.current?.click()}
            disabled={subiendo}
            className="text-sm font-medium text-foreground underline underline-offset-2 hover:no-underline disabled:opacity-50"
          >
            {subiendo ? "Subiendo..." : preview ? "Cambiar foto" : "Subir foto"}
          </button>
          {preview && !subiendo && (
            <button type="button" onClick={quitar} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-destructive">
              <PapeleraIcon className="h-3.5 w-3.5" /> Quitar
            </button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {ampliada && <VisorImagen src={preview} onClose={() => setAmpliada(false)} />}
    </div>
  );
}
