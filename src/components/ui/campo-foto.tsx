"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { labelClass } from "@/components/ui/field";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { AdjuntoIcon, PapeleraIcon } from "@/lib/nav-icons";
import { AvisoSoltar, leerSoltado, pareceImagen, useSoltarImagen } from "@/components/ui/soltar-imagen";

const BUCKET = "wms-productos";
const MAX_BYTES = 5 * 1024 * 1024;

const urlPublica = (ruta: string) => `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${ruta}`;

/**
 * Foto del producto: un único archivo, se sube apenas se elige (no se espera a «Guardar»). Usa una URL
 * firmada (que trae `prepararSubida`, propia de cada módulo) para subir directo desde el navegador sin
 * pasar el archivo por la acción del servidor. El campo real (`nombreCampo`) es un input oculto controlado
 * por estado de React (no por ref): así el formulario siempre lo lee con el valor correcto en el FormData
 * al enviar, sin depender de que una mutación imperativa haya alcanzado a aplicarse antes del submit.
 *
 * También se puede **soltar una imagen** encima del cuadro (desde el escritorio o desde otra página) y, con `soltarEnTodo`,
 * en cualquier parte de la página o pegarla con Ctrl+V. Una imagen de internet la descarga el servidor con `subirDesdeUrl`
 * (solo de sitios públicos); sin ella, se pide guardarla primero en el escritorio.
 */
export function CampoFoto({
  nombreCampo,
  valorInicial,
  alCambiarSubiendo,
  prepararSubida,
  etiqueta = "Foto del producto",
  subirDesdeUrl,
  soltarEnTodo = false,
}: {
  nombreCampo: string;
  valorInicial: string | null;
  alCambiarSubiendo?: (subiendo: boolean) => void;
  prepararSubida: (nombreArchivo: string) => Promise<{ ruta: string; token: string } | { error: string }>;
  /** El nombre del campo (en Compras, «Foto real del producto»: la que manda el proveedor). */
  etiqueta?: string;
  /** Para una imagen arrastrada desde internet: el servidor la descarga y la sube; devuelve su ruta. */
  subirDesdeUrl?: (url: string) => Promise<{ ruta: string } | { error: string }>;
  /** Soltar o pegar una imagen en cualquier parte de la página (un panel de crear), no solo sobre el cuadro. */
  soltarEnTodo?: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(valorInicial);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ampliada, setAmpliada] = useState(false);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    alCambiarSubiendo?.(subiendo);
  }, [subiendo, alCambiarSubiendo]);

  async function subir(archivo: File) {
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

  async function alElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (archivo) await subir(archivo);
  }

  async function recibir(dt: DataTransfer) {
    const soltado = await leerSoltado(dt);
    if (!soltado) return setError("No encontré una imagen en lo que soltaste.");
    if ("archivo" in soltado) return subir(soltado.archivo);
    if (!subirDesdeUrl) return setError("Esa imagen viene de internet: guárdala en el escritorio y arrástrala desde ahí.");
    setError(null);
    setSubiendo(true);
    try {
      const r = await subirDesdeUrl(soltado.url);
      if ("error" in r) setError(r.error);
      else setPreview(urlPublica(r.ruta));
    } catch {
      setError("No se pudo traer la imagen.");
    } finally {
      setSubiendo(false);
    }
  }
  const arrastrando = useSoltarImagen(soltarEnTodo, (dt) => void recibir(dt));
  const [encima, setEncima] = useState(false);

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
      <div
        className={`flex items-center gap-3 rounded-lg ${encima ? "ring-2 ring-primario ring-offset-2 ring-offset-card" : ""}`}
        onDragOver={(e) => {
          if (!pareceImagen(e.dataTransfer)) return;
          e.preventDefault();
          setEncima(true);
        }}
        onDragLeave={() => setEncima(false)}
        onDrop={(e) => {
          setEncima(false);
          if (!pareceImagen(e.dataTransfer)) return;
          e.preventDefault();
          void recibir(e.dataTransfer);
        }}
      >
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
          <div className="flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-border-control text-center text-[10px] leading-tight text-muted-foreground">
            <AdjuntoIcon className="h-5 w-5" />
            {subiendo ? "Subiendo…" : "Arrastra aquí"}
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
      <AvisoSoltar visible={arrastrando} detalle={`Será la ${etiqueta.toLowerCase()}`} />
    </div>
  );
}
