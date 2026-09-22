"use client";

import { useState, useTransition } from "react";
import { anilloFoco } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { CalendarioIcon, CatalogoIcon, CheckIcon, FlechaAbajoIcon, FlechaArribaIcon, FlechaIzquierdaIcon, ProductoIcon } from "@/lib/nav-icons";
import { formatearFecha } from "@/lib/formato";
import { cambiarEstadoSku, obtenerHistorialSku } from "./actions";
import { ETIQUETA_ESTADO, ETIQUETA_TIPO, TONO_ESTADO, siguientesEstados, type FilaSku } from "./def-catalogo";

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/** Botón de la cabecera para pasar al SKU anterior o siguiente (mismo patrón que `FichaCuenta`). */
function BotonNavegar({ texto, icono: Icono, activo, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; activo: boolean; alHacerClic: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!activo}
        onClick={() => activo && alHacerClic()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${
          activo ? "hover:bg-muted" : "cursor-default opacity-40"
        }`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

/**
 * Ficha de un SKU maestro: el panel a la derecha que se abre al pulsar su fila, con la misma estructura que
 * `FichaCuenta` — cabecera con sus insignias, las flechas de anterior y siguiente, una fila de botones para pasar
 * al siguiente estado (todo pasa por revisión antes de quedar aprobado) y los datos en bloques con ícono. **La
 * tabla ya no tiene columna de acciones**: cambiar el estado se hace desde aquí. La actividad (propuesto, cambios
 * de estado) va al final, siempre la misma línea de tiempo que las demás fichas de detalle.
 */
export function FichaSku({
  sku,
  orden,
  codigoPais,
  puedeEscribir,
  alIr,
  alCerrar,
}: {
  /** El SKU que se ve; sin él (no abierto) el panel está cerrado. */
  sku: FilaSku | undefined;
  /** Las claves de los SKU en el orden de la tabla. */
  orden: string[];
  /** El SKU maestro es igual para todos los países; el código de país solo da formato a las fechas de la actividad. */
  codigoPais: string;
  puedeEscribir: boolean;
  alIr: (id: string) => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Sube cada vez que se cambia el estado, para que la línea de tiempo se vuelva a pedir.
  const [version, setVersion] = useState(0);

  const indice = sku ? orden.indexOf(sku.id) : -1;
  const anterior = indice > 0 ? orden[indice - 1] : null;
  const siguiente = indice >= 0 && indice < orden.length - 1 ? orden[indice + 1] : null;

  function irA(id: string) {
    if (pending) return;
    setError(null);
    alIr(id);
  }

  function cambiarEstado(nuevoEstado: string) {
    if (!sku) return;
    setError(null);
    const formData = new FormData();
    formData.set("id", sku.id);
    formData.set("nuevo_estado", nuevoEstado);
    startTransition(async () => {
      try {
        await cambiarEstadoSku(formData);
        mostrarToast(`Estado cambiado a ${ETIQUETA_ESTADO[nuevoEstado] ?? nuevoEstado}`);
        setVersion((v) => v + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cambiar el estado.");
      }
    });
  }

  return (
    <Ventana
      abierto={!!sku}
      alCerrar={alCerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        sku && (
          <>
            <span className="text-lg font-semibold">{sku.codigo}</span>
            <Badge tone="neutral">{ETIQUETA_TIPO[sku.tipo] ?? sku.tipo}</Badge>
            <Badge tone={TONO_ESTADO[sku.estado]}>{ETIQUETA_ESTADO[sku.estado] ?? sku.estado}</Badge>
          </>
        )
      }
      navegacion={
        <>
          <BotonNavegar texto="SKU anterior" icono={FlechaArribaIcon} activo={!!anterior && !pending} alHacerClic={() => anterior && irA(anterior)} />
          <BotonNavegar texto="SKU siguiente" icono={FlechaAbajoIcon} activo={!!siguiente && !pending} alHacerClic={() => siguiente && irA(siguiente)} />
        </>
      }
    >
      {sku && (
        <div className="flex flex-1 flex-col">
          <p className="px-5 pt-5 pb-4 text-sm text-muted-foreground">{sku.nombre}</p>

          {puedeEscribir && (
            <div className="flex flex-col gap-2 border-y border-border px-5 py-3">
              <div className="flex flex-wrap gap-2">
                {siguientesEstados(sku.estado).map((paso) => {
                  const retrocede = paso.etiqueta.startsWith("Regresar");
                  return (
                    <BotonAccion
                      key={paso.valor}
                      icono={retrocede ? FlechaIzquierdaIcon : CheckIcon}
                      tono={paso.valor === "aprobado" ? "oscuro" : "neutro"}
                      disabled={pending}
                      onClick={() => cambiarEstado(paso.valor)}
                    >
                      {pending ? "Guardando..." : paso.etiqueta}
                    </BotonAccion>
                  );
                })}
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col divide-y divide-border border-t border-border p-5">
            <Seccion icono={CatalogoIcon} titulo="SKU">
              <dl className="flex flex-col gap-3">
                <Dato etiqueta="Nombre">{sku.nombre}</Dato>
                <Dato etiqueta="Tipo">{ETIQUETA_TIPO[sku.tipo] ?? sku.tipo}</Dato>
              </dl>
            </Seccion>

            {sku.tipo === "combo" && (
              <Seccion icono={ProductoIcon} titulo="Componentes">
                <p className="text-sm">{sku.componentes || "—"}</p>
              </Seccion>
            )}

            <Seccion icono={CalendarioIcon} titulo="Fechas">
              <dl className="flex flex-col gap-3">
                <Dato etiqueta="Propuesto el">{formatearFecha(sku.creado)}</Dato>
              </dl>
            </Seccion>
          </div>

          <HistorialGenerico id={sku.id} codigoPais={codigoPais} version={version} obtener={obtenerHistorialSku} />
        </div>
      )}
    </Ventana>
  );
}
