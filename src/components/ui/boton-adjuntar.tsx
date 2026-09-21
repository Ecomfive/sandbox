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
 *
 * Con `obligatorio` el campo es `required` (el formulario no se da por completo sin archivo, ver `useFaltantes`): el
 * botón lleva un asterisco rojo hasta que hay archivo y, al señalarlo como el dato que falta (`invalido`), un borde
 * rojo. `id` es el del campo oculto (el que `useFaltantes` marca); el botón es el que recibe el foco.
 */
export function BotonAdjuntar({
  id,
  name,
  accept,
  nombreAccesible = "Adjuntar soporte",
  obligatorio,
  invalido,
}: {
  id: string;
  name: string;
  accept?: string;
  /** Lo que dice el tooltip y lee un lector de pantalla cuando aún no hay archivo. */
  nombreAccesible?: string;
  obligatorio?: boolean;
  /** Marca el botón como el dato que falta (ver `useFaltantes`). */
  invalido?: boolean;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const texto = archivo ? `${nombreAccesible}: ${archivo}. Pulsa para cambiarlo` : nombreAccesible;
  const idBoton = `${id}-boton`;

  return (
    <>
      <input
        ref={campo}
        id={id}
        type="file"
        name={name}
        accept={accept}
        required={obligatorio}
        data-destino={idBoton}
        tabIndex={-1}
        aria-label={nombreAccesible}
        className="sr-only"
        onChange={(e) => setArchivo(e.target.files?.[0]?.name ?? null)}
      />
      <Tooltip texto={archivo ?? nombreAccesible}>
        <button
          id={idBoton}
          type="button"
          onClick={() => campo.current?.click()}
          aria-label={obligatorio ? `${texto} (obligatorio)` : texto}
          className={`relative flex h-12 w-12 items-center justify-center border bg-card transition-colors ${anilloFoco} !rounded-lg ${
            archivo
              ? "border-success text-success hover:bg-success-soft"
              : invalido
                ? "border-destructive text-foreground hover:bg-muted"
                : "border-border-control text-foreground hover:bg-muted"
          }`}
        >
          <AdjuntoIcon className="h-7 w-7" />
          {archivo ? (
            <span
              aria-hidden="true"
              className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-success text-background"
            >
              <CheckIcon className="h-3 w-3" />
            </span>
          ) : (
            obligatorio && (
              <span aria-hidden="true" className="absolute -top-1 -right-1 text-base leading-none font-semibold text-destructive">
                *
              </span>
            )
          )}
        </button>
      </Tooltip>
    </>
  );
}
