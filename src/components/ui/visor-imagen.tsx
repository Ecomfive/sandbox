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
export function VisorImagen({ src, alt, onClose }: { src: string | null; alt?: string; onClose: () => void }) {
  const cerrarRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!src) return;
    cerrarRef.current?.focus();
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", alTeclear);
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", alTeclear);
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || ""}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[90vw] rounded-md object-contain shadow-2xl"
      />
    </div>,
    document.body
  );
}
