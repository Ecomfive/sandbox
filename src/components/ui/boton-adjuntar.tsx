"use client";

import { useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { AdjuntoIcon, CheckIcon } from "@/lib/nav-icons";

/**
 * Adjuntar un archivo con solo un ícono (un documento con un clip), sin texto: el botón abre el selector de archivos
 * del navegador y el archivo va en el formulario con el `name` dado, como un `<input type="file">` cualquiera. Ya con un
 * archivo elegido el botón cambia (borde y ícono verdes y una marca) y su nombre queda en el tooltip y en el nombre
 * accesible; volver a pulsarlo deja cambiarlo. El campo real queda oculto y fuera del orden de Tab (el botón es el que
 * se enfoca).
 */
export function BotonAdjuntar({
  name,
  accept,
  nombreAccesible = "Adjuntar soporte",
}: {
  name: string;
  accept?: string;
  /** Lo que dice el tooltip y lee un lector de pantalla cuando aún no hay archivo. */
  nombreAccesible?: string;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const texto = archivo ? `${nombreAccesible}: ${archivo}. Pulsa para cambiarlo` : nombreAccesible;

  return (
    <>
      <input
        ref={campo}
        type="file"
        name={name}
        accept={accept}
        tabIndex={-1}
        aria-label={nombreAccesible}
        className="sr-only"
        onChange={(e) => setArchivo(e.target.files?.[0]?.name ?? null)}
      />
      <Tooltip texto={archivo ?? nombreAccesible}>
        <button
          type="button"
          onClick={() => campo.current?.click()}
          aria-label={texto}
          className={`relative flex h-12 w-12 items-center justify-center border bg-card transition-colors ${anilloFoco} !rounded-lg ${
            archivo
              ? "border-success text-success hover:bg-success-soft"
              : "border-border-control text-foreground hover:bg-muted"
          }`}
        >
          <AdjuntoIcon className="h-7 w-7" />
          {archivo && (
            <span
              aria-hidden="true"
              className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-success text-background"
            >
              <CheckIcon className="h-3 w-3" />
            </span>
          )}
        </button>
      </Tooltip>
    </>
  );
}
