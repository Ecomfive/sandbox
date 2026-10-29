"use client";

import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import { anilloFoco } from "@/components/ui/field";
import { CerrarIcon } from "@/lib/nav-icons";

/**
 * Visor de una imagen a tamaño grande, para cuando una miniatura (foto de producto, etc.) se ve demasiado
 * pequeña para distinguirla bien. Se abre con `src`; con `src` nulo no renderiza nada. Escape o clic afuera
 * cierran, igual que `Ventana`, pero este es más simple (sin foco atrapado) porque solo muestra una imagen,
 * no un formulario.
 */
export function VisorImagen({
  src,
  alt,
  onClose,
  pie,
  descargar,
}: {
  src: string | null;
  alt?: string;
  onClose: () => void;
  /** Un texto bajo la imagen (el pie de una foto de WhatsApp). */
  pie?: string | null;
  /** Con esto se ofrece «Descargar» bajo la imagen (el nombre con que se guarda). */
  descargar?: { href: string; nombre: string };
}) {
  const conInfo = !!pie || !!descargar;
  const cerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!src) return;
    cerrarRef.current?.focus();
    // En `window` y en la fase de captura, y sin dejar que siga: así Escape cierra solo la foto y no también la ficha
    // (`Ventana`) que la abrió, que escucha Escape en `document`.
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    }
    window.addEventListener("keydown", alTeclear, true);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", alTeclear, true);
      document.body.style.overflow = overflowPrevio;
    };
  }, [src, onClose]);

  if (!src) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt || "Imagen ampliada"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
      onClick={onClose}
    >
      <button
        ref={cerrarRef}
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className={`absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 ${anilloFoco}`}
      >
        <CerrarIcon className="h-5 w-5" />
      </button>
      <div className="flex max-h-full max-w-full flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt || ""} className={`${conInfo ? "max-h-[80vh]" : "max-h-[90vh]"} max-w-[90vw] rounded-md object-contain shadow-2xl`} />
        {conInfo && (
          <div className="flex max-w-[90vw] items-center gap-3 rounded-full bg-black/55 px-4 py-2 text-sm text-white">
            {pie && <span className="min-w-0 max-w-[60vw] truncate">{pie}</span>}
            {descargar && (
              <a href={descargar.href} download={descargar.nombre} className={`flex-none rounded-full bg-white/15 px-3 py-1 font-medium hover:bg-white/25 ${anilloFoco}`}>
                Descargar
              </a>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
