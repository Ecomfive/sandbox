"use client";

import { useState, type MouseEvent } from "react";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import { VisorImagen } from "@/components/ui/visor-imagen";

/** ¿Es una pantalla sin cursor (celular, tableta)? Ahí la foto se agranda con un toque. */
const sinCursor = () => typeof window !== "undefined" && window.matchMedia?.("(hover: none)").matches;

/**
 * Una foto chica que se ve grande (23 nov 2026, pedido de Hernán: «que en todas se amplíe la imagen al pasar por arriba»): con el cursor encima sale
 * grande al lado; en el celular, un toque la abre a pantalla completa. Se usa igual que un `<img>`: `className` es el de la foto chica.
 * `toque={false}` cuando la foto está dentro de algo que se toca para elegirlo (una opción de una lista): ahí el toque elige, no agranda.
 */
export function FotoAmpliable({ src, alt = "", className = "", toque = true }: { src: string; alt?: string; className?: string; toque?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const alTocar = (e: MouseEvent) => {
    if (!toque || !sinCursor()) return;
    e.preventDefault();
    e.stopPropagation();
    setAbierta(true);
  };
  return (
    <>
      <TarjetaEmergente
        clase="rounded-lg border border-border bg-card p-1.5 shadow-lg"
        contenido={
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="max-h-72 max-w-72 rounded-md object-contain" />
        }
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={alt} loading="lazy" onClick={alTocar} className={className} />
      </TarjetaEmergente>
      {toque && <VisorImagen src={abierta ? src : null} alt={alt} onClose={() => setAbierta(false)} />}
    </>
  );
}
