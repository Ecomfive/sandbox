"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { EnlaceIcon } from "@/lib/nav-icons";
import { marcadorAplicarDropi } from "@/lib/publicaciones/marcador-aplicar-dropi";
import { VentanaCambiosPendientes } from "./pendientes-dropi";

const claseBoton = `inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted ${anilloFoco}`;

/**
 * Los cambios que esperan para Dropi y el favorito «Aplicar en Dropi»: no se pulsa aquí, se arrastra a la barra de favoritos y se
 * pulsa con Dropi abierto. Su dirección se pone al montarse con el origen de la plataforma (React no deja escribir un `javascript:` en
 * `href`). Arrastrar no puede ser lo único (WCAG 2.5.7): «cópialo» deja la misma dirección para pegarla en un favorito nuevo.
 */
export function BarraAplicarDropi({ pendientes }: { pendientes: number }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const { mostrarToast } = useToast();
  const [abierta, setAbierta] = useState(false);
  const [verPendientes, setVerPendientes] = useState(false);
  useEffect(() => {
    try {
      ref.current?.setAttribute("href", marcadorAplicarDropi(window.location.origin));
    } catch {
      // Sin https no hay favorito: el enlace queda como «#» y su clic lo explica.
    }
  }, [abierta]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(marcadorAplicarDropi(window.location.origin));
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
          {pendientes ? (
            // Pulsarlo abre la lista de cambios pendientes, donde cada uno se puede deshacer antes de aplicarlo en Dropi.
            <button
              type="button"
              onClick={() => setVerPendientes(true)}
              className={`rounded text-left underline-offset-4 hover:underline hover:decoration-dotted ${anilloFoco}`}
            >
              {`${pendientes} ${pendientes === 1 ? "cambio espera" : "cambios esperan"} para Dropi: pulsa «Aplicar en Dropi» con Dropi abierto.`}
            </button>
          ) : (
            "Nada pendiente para Dropi."
          )}
        </span>
        <button type="button" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta} className={claseBoton}>
          {abierta ? "Ocultar" : "Cómo aplicar en Dropi"}
        </button>
      </p>
      <VentanaCambiosPendientes abierta={verPendientes} alCerrar={() => setVerPendientes(false)} />
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
                  aria-label="Aplicar en Dropi: arrástralo a la barra de favoritos"
                  onClick={(e) => {
                    e.preventDefault();
                    mostrarToast("Arrastra «Aplicar en Dropi» a tu barra de favoritos y púlsalo con Dropi abierto.", "info");
                  }}
                  className={`${claseBoton} cursor-grab`}
                >
                  <EnlaceIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  Aplicar en Dropi
                </a>
              </Tooltip>{" "}
              a la barra de favoritos (Ctrl+Shift+B la muestra), o{" "}
              <button type="button" onClick={() => void copiar()} className="underline">
                cópialo
              </button>{" "}
              y pégalo como la dirección (URL) de un favorito nuevo. Solo la primera vez.
            </li>
            <li>Abre Dropi (app.dropi.pa) con la cuenta de proveedor de ECOMFIVE, en el mismo navegador donde usas esta plataforma.</li>
            <li>Pulsa el favorito en la pestaña de Dropi: se abre una ventana de la plataforma que aplica lo pendiente y dice cómo le fue a cada uno.</li>
          </ol>
          <p className="m-0 text-xs text-muted-foreground">
            La sesión de Dropi no sale de su pestaña: los cambios los hace Dropi desde ahí (solo el nombre y la guía de envío) y la plataforma guarda el resultado.
          </p>
        </div>
      )}
    </div>
  );
}
