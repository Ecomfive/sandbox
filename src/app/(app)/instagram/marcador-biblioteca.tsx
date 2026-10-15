"use client";

import { useEffect, useRef } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { marcadorBiblioteca } from "@/lib/instagram/marcador";
import { EnlaceIcon } from "@/lib/nav-icons";

const claseBoton = `inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-sm font-medium text-foreground hover:bg-muted ${anilloFoco}`;

/**
 * El marcador «Leer Biblioteca»: no se pulsa aquí, se arrastra a la barra de favoritos del navegador y se pulsa con la Biblioteca de
 * anuncios de Meta abierta (ver `src/lib/instagram/marcador.ts`). Su dirección se pone al montarse con el origen de la plataforma:
 * React no deja escribir un `javascript:` en `href`, y el favorito debe llevar la dirección de esta plataforma, la de cada equipo.
 * Arrastrar no puede ser lo único (WCAG 2.5.7): «Copiar marcador» deja la misma dirección en el portapapeles para pegarla como la
 * dirección de un favorito nuevo.
 */
export function MarcadorBiblioteca() {
  const ref = useRef<HTMLAnchorElement>(null);
  const { mostrarToast } = useToast();
  useEffect(() => {
    try {
      ref.current?.setAttribute("href", marcadorBiblioteca(window.location.origin));
    } catch {
      // Sin una dirección segura (https) no hay marcador: el enlace queda como «#» y su clic lo explica.
    }
  }, []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(marcadorBiblioteca(window.location.origin));
      mostrarToast("Marcador copiado: pégalo como la dirección de un favorito nuevo.");
    } catch {
      mostrarToast("No se pudo copiar el marcador.", "destructive");
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <Tooltip texto="Arrastrar a favoritos">
        <a
          ref={ref}
          href="#"
          draggable
          aria-label="Leer Biblioteca: arrástralo a la barra de favoritos"
          onClick={(e) => {
            e.preventDefault();
            mostrarToast("Arrastra «Leer Biblioteca» a tu barra de favoritos y púlsalo en la Biblioteca de anuncios.", "info");
          }}
          className={`${claseBoton} cursor-grab`}
        >
          <EnlaceIcon className="h-4 w-4" aria-hidden="true" />
          Leer Biblioteca
        </a>
      </Tooltip>
      <Tooltip texto="Copiar marcador">
        <button type="button" onClick={() => void copiar()} aria-label="Copiar el marcador Leer Biblioteca" className={claseBoton}>
          Copiar
        </button>
      </Tooltip>
    </span>
  );
}
