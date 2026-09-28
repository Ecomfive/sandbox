"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { prepararSubidaFotoFiltro } from "./actions";
import { labelClass } from "@/components/ui/field";
import { AdjuntoIcon, PapeleraIcon } from "@/lib/nav-icons";

const BUCKET = "wms-productos";
const MAX_BYTES = 5 * 1024 * 1024;

const urlPublica = (ruta: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${ruta}`;

/**
 * Foto del producto: un único archivo, se sube apenas se elige (no se espera a «Guardar»). Usa el mismo
 * patrón de URL firmada que las fichas de producto Shopify/Dropi, para subir directo desde el navegador sin
 * pasar el archivo por la acción del servidor. El campo real (`foto_url`) es un input oculto controlado por
 * ref, para que el formulario lo lea como cualquier otro campo del FormData al enviar.
 */
export function CampoFoto({
  nombreCampo,
  valorInicial,
  alCambiarSubiendo,
}: {
  nombreCampo: string;
  valorInicial: string | null;
  alCambiarSubiendo?: (subiendo: boolean) => void;
}) {
  const [preview, setPreview] = useState<string | null>(valorInicial);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputOcultoRef = useRef<HTMLInputElement>(null);
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
      const permiso = await prepararSubidaFotoFiltro(archivo.name);
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
      const url = urlPublica(permiso.ruta);
      setPreview(url);
      if (inputOcultoRef.current) inputOcultoRef.current.value = url;
    } catch {
      setError("No se pudo subir la imagen. Inténtalo de nuevo.");
    } finally {
      setSubiendo(false);
    }
  }

  function quitar() {
    setPreview(null);
    setError(null);
    if (inputOcultoRef.current) inputOcultoRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-1">
      <span className={labelClass}>Foto del producto</span>
      <input ref={inputOcultoRef} type="hidden" name={nombreCampo} defaultValue={valorInicial ?? ""} />
      <input ref={inputArchivoRef} type="file" accept="image/*" className="hidden" onChange={alElegirArchivo} />
      <div className="flex items-center gap-3">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-16 w-16 rounded-md border border-border object-cover" />
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
    </div>
  );
}
