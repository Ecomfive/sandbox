"use client";

import { useEffect, useRef, useState } from "react";
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
 *
 * Con `pegarCaptura` (14 nov 2026, pedido de Hernán: subir el comprobante sin descargarlo del banco) también se puede **pegar una captura** con
 * Ctrl+V en cualquier parte de la página mientras el botón está a la vista, o **arrastrar** la imagen al botón; se ve una miniatura al lado.
 */
export function BotonAdjuntar({
  id,
  name,
  accept,
  nombreAccesible = "Adjuntar soporte",
  obligatorio,
  invalido,
  pegarCaptura,
}: {
  id: string;
  name: string;
  accept?: string;
  /** Lo que dice el tooltip y lee un lector de pantalla cuando aún no hay archivo. */
  nombreAccesible?: string;
  obligatorio?: boolean;
  /** Marca el botón como el dato que falta (ver `useFaltantes`). */
  invalido?: boolean;
  /** Deja pegar una captura (Ctrl+V) o arrastrar la imagen, además de elegir el archivo. */
  pegarCaptura?: boolean;
}) {
  const campo = useRef<HTMLInputElement>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [miniatura, setMiniatura] = useState<string | null>(null);

  // Pone el archivo en el campo real (como si se hubiera elegido) y avisa al formulario.
  function ponerArchivo(f: File) {
    const input = campo.current;
    if (!input) return;
    const dt = new DataTransfer();
    dt.items.add(f);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  useEffect(() => {
    if (!pegarCaptura) return;
    function alPegar(e: ClipboardEvent) {
      const imagen = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith("image/"));
      if (!imagen || !campo.current?.isConnected) return;
      e.preventDefault();
      const ext = imagen.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
      const sello = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
      ponerArchivo(new File([imagen], `captura-${sello}.${ext}`, { type: imagen.type }));
    }
    document.addEventListener("paste", alPegar);
    return () => document.removeEventListener("paste", alPegar);
  }, [pegarCaptura]);

  // La miniatura de la imagen elegida o pegada (se libera al cambiarla o al salir).
  useEffect(() => {
    return () => {
      if (miniatura) URL.revokeObjectURL(miniatura);
    };
  }, [miniatura]);
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
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setArchivo(f?.name ?? null);
          setMiniatura(pegarCaptura && f?.type.startsWith("image/") ? URL.createObjectURL(f) : null);
        }}
      />
      <Tooltip texto={archivo ?? nombreAccesible}>
        <button
          id={idBoton}
          type="button"
          onClick={() => campo.current?.click()}
          onDragOver={pegarCaptura ? (e) => e.preventDefault() : undefined}
          onDrop={
            pegarCaptura
              ? (e) => {
                  const f = e.dataTransfer.files?.[0];
                  if (!f) return;
                  e.preventDefault();
                  ponerArchivo(f);
                }
              : undefined
          }
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
      {pegarCaptura && (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {miniatura ? (
            // eslint-disable-next-line @next/next/no-img-element -- miniatura local (blob:) de la captura, no pasa por el optimizador
            <img src={miniatura} alt="Vista previa del comprobante" className="h-12 w-auto max-w-[8rem] rounded border border-border object-contain" />
          ) : null}
          {archivo ? archivo : "o pega la captura del ingreso (Ctrl+V) o arrástrala aquí"}
        </span>
      )}
    </>
  );
}
