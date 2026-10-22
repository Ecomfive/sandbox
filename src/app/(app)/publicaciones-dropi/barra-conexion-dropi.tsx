"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { EnlaceIcon } from "@/lib/nav-icons";
import { marcadorConectarDropi } from "@/lib/publicaciones/marcador-conectar-dropi";
import { desconectarDropi } from "./conexion-actions";

const claseBoton = `inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted ${anilloFoco}`;

/**
 * Cómo está la conexión con Dropi (migración 0137) y, para un administrador, el favorito «Conectar Dropi»: no se pulsa aquí, se
 * arrastra a la barra de favoritos y se pulsa con Dropi abierto en la cuenta de proveedor. Su dirección se pone al montarse con el
 * origen de la plataforma (React no deja escribir un `javascript:` en `href`). Arrastrar no puede ser lo único (WCAG 2.5.7): «Copiar»
 * deja la misma dirección para pegarla en un favorito nuevo.
 */
export function BarraConexionDropi({
  paisId,
  conectada,
  hasta,
  por,
  pendientes,
  esAdmin,
}: {
  paisId: string;
  conectada: boolean;
  /** Hasta cuándo dura la sesión, ya escrito en hora de Panamá. */
  hasta: string | null;
  por: string | null;
  pendientes: number;
  esAdmin: boolean;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const { mostrarToast } = useToast();
  const [abierta, setAbierta] = useState(false);
  const [pendiente, empezar] = useTransition();
  useEffect(() => {
    try {
      ref.current?.setAttribute("href", marcadorConectarDropi(window.location.origin));
    } catch {
      // Sin https no hay favorito: el enlace queda como «#» y su clic lo explica.
    }
  }, [abierta]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(marcadorConectarDropi(window.location.origin));
      mostrarToast("Favorito copiado: pégalo como la dirección de un favorito nuevo.");
    } catch {
      mostrarToast("No se pudo copiar el favorito.", "destructive");
    }
  }

  const textoPendientes = pendientes ? ` · ${pendientes} ${pendientes === 1 ? "cambio pendiente" : "cambios pendientes"} en Dropi` : "";
  return (
    <div className="-mb-2 flex flex-col gap-2 text-xs text-muted-foreground">
      <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${conectada ? "bg-success" : "bg-warning"}`} />
          {conectada ? `Dropi conectado hasta el ${hasta}${por ? ` (lo conectó ${por})` : ""}: «Usar este título» lo cambia en Dropi al instante.` : "Dropi sin conectar: lo que se cambie queda pendiente hasta conectar."}
          {textoPendientes}
        </span>
        {esAdmin && (
          <button type="button" onClick={() => setAbierta((a) => !a)} aria-expanded={abierta} className={claseBoton}>
            {conectada ? "Volver a conectar" : "Conectar Dropi"}
          </button>
        )}
        {esAdmin && conectada && (
          <button
            type="button"
            disabled={pendiente}
            onClick={() =>
              empezar(async () => {
                const r = await desconectarDropi(paisId);
                mostrarToast(r.error ?? "Dropi desconectado.", r.error ? "destructive" : undefined);
              })
            }
            className={claseBoton}
          >
            Desconectar
          </button>
        )}
      </p>
      {esAdmin && abierta && (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground">
          <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">
            <li>
              Arrastra{" "}
              <Tooltip texto="Arrastrar a favoritos">
                <a
                  ref={ref}
                  href="#"
                  draggable
                  aria-label="Conectar Dropi: arrástralo a la barra de favoritos"
                  onClick={(e) => {
                    e.preventDefault();
                    mostrarToast("Arrastra «Conectar Dropi» a tu barra de favoritos y púlsalo con Dropi abierto.", "info");
                  }}
                  className={`${claseBoton} cursor-grab`}
                >
                  <EnlaceIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  Conectar Dropi
                </a>
              </Tooltip>{" "}
              a la barra de favoritos (o{" "}
              <button type="button" onClick={() => void copiar()} className="underline">
                cópialo
              </button>{" "}
              y pégalo como la dirección de un favorito nuevo). Solo la primera vez.
            </li>
            <li>Abre Dropi (app.dropi.pa) con la cuenta de proveedor de ECOMFIVE.</li>
            <li>Pulsa el favorito: se abre esta plataforma, guarda la conexión y aplica lo pendiente.</li>
          </ol>
          <p className="m-0 text-xs text-muted-foreground">
            La conexión dura lo que dura la sesión en Dropi (12 horas). Se guarda cifrada y el sistema solo la usa para cambiar el nombre y la guía de envío de los productos.
          </p>
        </div>
      )}
    </div>
  );
}
