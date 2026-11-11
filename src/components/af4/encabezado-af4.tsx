import type { ReactNode } from "react";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { anilloFoco } from "@/components/ui/field";
import { DescargarIcon } from "@/lib/nav-icons";
import { fechaHora, mesMedio } from "@/lib/af4/fecha";
import { BotonImprimir } from "./boton-imprimir";
import { claseAccionAF4 } from "./estilos-af4";
import { DatosIcon, RelojIcon } from "./iconos-af4";

export interface DescargaAF4 {
  href: string;
  /** «Descargar Excel» por defecto. */
  etiqueta?: string;
}

/**
 * La cabecera común de las páginas del Portal AF4 360°: el título (oculto, porque las migas ya lo dicen), una sola barra
 * de contexto con los filtros a la izquierda (período, entidad, tienda, escenario: `ControlPeriodo`, `SelectorEntidad`,
 * `ControlSegmentado`) y, a la derecha, de qué fecha son los datos («Datos hasta Sep 2026»), cuándo se calcularon y las
 * acciones (Descargar Excel, Imprimir). Ninguna página arma esta barra a mano.
 */
export function EncabezadoAF4({
  titulo,
  filtros,
  datosHasta,
  actualizado,
  descarga,
  imprimir = true,
  acciones,
}: {
  titulo: string;
  filtros?: ReactNode;
  /** El último mes con datos («AAAA-MM-01»): «Datos hasta Sep 2026». */
  datosHasta?: string | null;
  /** Cuándo se calculó o se cargó por última vez (instante ISO): «Actualizado 23 oct 2026, 10:05». */
  actualizado?: string | null;
  descarga?: DescargaAF4 | null;
  imprimir?: boolean;
  /** Otras acciones de la página (un botón de supuestos), antes de Descargar e Imprimir. */
  acciones?: ReactNode;
}) {
  const hayMeta = !!(datosHasta || actualizado);
  // Sin nada que mostrar en la barra (una lista sin filtros ni acciones) queda solo el título oculto: no una raya suelta.
  if (!filtros && !hayMeta && !acciones && !descarga && !imprimir) return <EncabezadoPagina titulo={titulo} oculto />;
  return (
    <header className="flex flex-col gap-3 border-b border-border pb-4">
      <EncabezadoPagina titulo={titulo} oculto />
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">{filtros}</div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {hayMeta && (
            <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {datosHasta && (
                <div className="flex items-center gap-1.5">
                  <DatosIcon className="h-3.5 w-3.5" />
                  <dt>Datos hasta</dt>
                  <dd className="font-medium text-foreground-soft">{mesMedio(datosHasta)}</dd>
                </div>
              )}
              {actualizado && (
                <div className="flex items-center gap-1.5">
                  <RelojIcon className="h-3.5 w-3.5" />
                  <dt>Actualizado</dt>
                  <dd className="tabular-nums">{fechaHora(actualizado)}</dd>
                </div>
              )}
            </dl>
          )}
          {(acciones || descarga || imprimir) && (
            <div data-sin-imprimir className="flex items-center gap-1.5">
              {acciones}
              {descarga && (
                <a href={descarga.href} download className={`${claseAccionAF4} ${anilloFoco}`}>
                  <DescargarIcon className="h-4 w-4" aria-hidden="true" />
                  {descarga.etiqueta ?? "Descargar Excel"}
                </a>
              )}
              {imprimir && <BotonImprimir />}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
