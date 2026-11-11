"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { EnlaceIcon } from "@/lib/nav-icons";
import { marcadorAplicarPrecios, VERSION_FAVORITO_PRECIOS, type PlataformaPrecios } from "@/lib/publicaciones/marcador-aplicar-precios";

const claseBoton = `inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted ${anilloFoco}`;
const DATOS: Record<PlataformaPrecios, { nombre: string; sitio: string }> = {
  drop: { nombre: "Drop", sitio: "app.soydrop.com" },
  dunamixfy: { nombre: "Dunamixfy", sitio: "dunamixfy.cr" },
};

/**
 * Los cambios de precio que esperan para Drop o Dunamixfy y el favorito «Aplicar precios» (el mismo para las dos): no se pulsa aquí, se arrastra a la barra
 * de favoritos y se pulsa con la plataforma abierta. Como «Aplicar en Dropi» (`barra-aplicar-dropi.tsx`): su dirección se pone al montarse (React no deja un
 * `javascript:` en `href`) y «cópialo» deja la misma dirección para pegarla en un favorito nuevo.
 */
export function BarraAplicarPrecios({ plataforma, pendientes }: { plataforma: PlataformaPrecios; pendientes: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const { mostrarToast } = useToast();
  const [abierta, setAbierta] = useState(false);
  const { nombre, sitio } = DATOS[plataforma];
  useEffect(() => {
    try {
      ref.current?.setAttribute("href", marcadorAplicarPrecios(window.location.origin));
    } catch {
      // Sin https no hay favorito: el enlace queda como «#» y su clic lo explica.
    }
  }, [abierta]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(marcadorAplicarPrecios(window.location.origin));
      mostrarToast("Favorito copiado: pégalo como la dirección de un favorito nuevo.");
    } catch {
      mostrarToast("No se pudo copiar el favorito.", "destructive");
    }
  }

  return (
    <div className="-mb-2 flex flex-col gap-2 text-xs text-muted-foreground">
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`inline-flex items-center gap-1.5 ${pendientes ? "font-medium text-destructive" : ""}`}>
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${pendientes ? "bg-destructive" : "bg-success"}`} />
          {pendientes
            ? `${pendientes} ${pendientes === 1 ? "cambio de precio espera" : "cambios de precio esperan"} para ${nombre}: pulsa «Aplicar precios» con ${nombre} abierto.`
            : `Ningún cambio de precio espera para ${nombre}.`}
        </span>
        <button type="button" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta} className={claseBoton}>
          {abierta ? "Ocultar" : `Cómo aplicar en ${nombre}`}
        </button>
      </p>
      {abierta && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
          <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">
            <li>
              Arrastra{" "}
              <Tooltip texto="Arrastrar a favoritos">
                <a
                  ref={ref}
                  href="#"
                  draggable
                  aria-label={`Aplicar precios, versión ${VERSION_FAVORITO_PRECIOS}: arrástralo a la barra de favoritos`}
                  onClick={(e) => {
                    e.preventDefault();
                    mostrarToast(`Arrastra «Aplicar precios» a tu barra de favoritos y púlsalo con ${nombre} abierto.`, "info");
                  }}
                  className={`${claseBoton} cursor-grab`}
                >
                  <EnlaceIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  Aplicar precios
                  <span className="font-normal text-muted-foreground tabular-nums">v{VERSION_FAVORITO_PRECIOS}</span>
                </a>
              </Tooltip>{" "}
              a la barra de favoritos (Ctrl+Shift+B la muestra), o{" "}
              <button type="button" onClick={() => void copiar()} className="underline">
                cópialo
              </button>{" "}
              y pégalo como la dirección (URL) de un favorito nuevo. Es el mismo para Drop y Dunamixfy; repítelo cuando cambie la versión.
            </li>
            <li>
              Abre {nombre} ({sitio}) con la cuenta de proveedor de Costa Rica, en el mismo navegador donde usas esta plataforma.
            </li>
            <li>Pulsa el favorito en la pestaña de {nombre}: se abre una ventana de la plataforma que aplica los precios pendientes y dice cómo le fue a cada uno.</li>
          </ol>
          <p className="m-0 text-xs text-muted-foreground">
            La sesión de {nombre} no sale de su pestaña: los cambios los hace {nombre} desde ahí y la plataforma guarda el resultado.
            {plataforma === "drop" ? " Al pulsarlo también se leen los precios de todos los productos de Drop (sin comisión y sugerido)." : ""}
          </p>
        </div>
      )}
    </div>
  );
}
