"use client";

import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import { useToast } from "@/components/ui/toast";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearFecha } from "@/lib/formato";
import { AdjuntoIcon, CalendarioIcon, CerrarIcon, DropshipperIcon, EstadoIcon, UbicacionIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { numeroSeleccion } from "../seleccion-productos/def-seleccion";
import { SelectorEstado } from "../seleccion-productos/selector-estado";
import { cambiarEstadoSugerencia, crearSugerenciaManual } from "./actions";
import { colorEstadoSugerencia, DEF_SUGERENCIAS, ESTADOS_SUGERENCIA, nombrePaisIso, type FilaSugerencia } from "./def-sugerencias";
import { FichaSugerencia, type ClienteCrm } from "./ficha-sugerencia";

const NOMBRE: NombreFilas = { singular: "sugerencia", plural: "sugerencias" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  dropshipper: DropshipperIcon,
  paisDetectado: UbicacionIcon,
  categoria: EstadoIcon,
  creadoEn: CalendarioIcon,
  notas: EstadoIcon,
};

function columnas(puedeEscribir: boolean, cambiar: (id: string, estado: string) => void): ColumnaTabla<FilaSugerencia, undefined>[] {
  return [
    { id: "codigo", label: "Código", ocultable: false, clase: "tabular-nums whitespace-nowrap text-muted-foreground", render: (f) => f.codigo },
    {
      id: "foto",
      label: "Foto",
      ocultable: true,
      render: (f) =>
        f.fotoUrl ? (
          <TarjetaEmergente
            clase="rounded-lg border border-border bg-card p-1.5 shadow-lg"
            contenido={
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.fotoUrl} alt="" className="max-h-72 max-w-72 rounded-md object-contain" />
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.fotoUrl} alt="" className="h-8 w-8 rounded-md border border-border object-cover" />
          </TarjetaEmergente>
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-dashed border-border text-muted-foreground">
            <AdjuntoIcon className="h-3.5 w-3.5" />
          </div>
        ),
    },
    {
      id: "nombre",
      label: "Producto",
      ocultable: false,
      clase: "font-medium",
      render: (f) => (
        <span className="block max-w-[22rem] truncate" title={f.nombre}>
          {f.nombre}
        </span>
      ),
    },
    {
      id: "estado",
      label: "Estado",
      ocultable: true,
      render: (f) => (
        <SelectorEstado
          estado={f.estado}
          opciones={ESTADOS_SUGERENCIA}
          aria={`Estado de ${f.codigo}`}
          // Una vez en Selección, su recorrido sigue allá.
          puedeEscribir={puedeEscribir && f.estado !== "seleccionado"}
          alCambiar={(e) => cambiar(f.id, e)}
        />
      ),
    },
    { id: "dropshipper", label: "Recomendado por", ocultable: true, clase: "whitespace-nowrap", render: (f) => f.dropshipper },
    { id: "paisDetectado", label: "País donde lo vio", ocultable: true, clase: "text-muted-foreground", render: (f) => nombrePaisIso(f.paisDetectado) },
    { id: "categoria", label: "Categoría", ocultable: true, clase: "text-muted-foreground", render: (f) => f.categoria ?? "—" },
    { id: "creadoEn", label: "Recomendado el", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => formatearFecha(f.creadoEn) },
    {
      id: "seleccion",
      label: "En Selección",
      ocultable: true,
      clase: "tabular-nums whitespace-nowrap",
      render: (f) =>
        f.seleccionNumero !== null ? (
          <a href="/seleccion-productos" className={`text-primario hover:underline ${anilloFoco}`}>
            {numeroSeleccion(f.seleccionNumero)}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { id: "notas", label: "Notas", ocultable: true, clase: "text-muted-foreground", render: (f) => <span className="block max-w-[20rem] truncate" title={f.notas ?? ""}>{f.notas ?? "—"}</span> },
  ];
}

/**
 * Sugerencias de clientes (Testing Lab › Fuentes): lo que los dropshippers nos recomiendan, agrupado por estado. Llegan
 * desde el CRM («Recomendar producto») o con «Agregar», asignadas a un cliente. Al marcar una (o varias) como
 * Seleccionado pasa a Selección de productos con su mismo código SUG-.
 */
export function TablaSugerencias({ filas, puedeEscribir, clientes }: { filas: FilaSugerencia[]; puedeEscribir: boolean; clientes: ClienteCrm[] }) {
  const { mostrarToast } = useToast();
  const [cambios, setCambios] = useState<Record<string, string>>({});
  const [guardandoLote, setGuardandoLote] = useState(false);
  const vistas = useMemo(() => filas.map((f) => (cambios[f.id] && cambios[f.id] !== f.estado ? { ...f, estado: cambios[f.id] } : f)), [filas, cambios]);

  const cambiar = useCallback(
    async (ids: string[], estado: string): Promise<boolean> => {
      setCambios((c) => ({ ...c, ...Object.fromEntries(ids.map((id) => [id, estado])) }));
      const r = await cambiarEstadoSugerencia(ids, estado).catch(() => ({ error: "No se pudo cambiar el estado." }));
      if (r.error) {
        setCambios((c) => Object.fromEntries(Object.entries(c).filter(([id]) => !ids.includes(id))));
        mostrarToast(r.error, "destructive");
        return false;
      }
      if (estado === "seleccionado") mostrarToast(`${ids.length === 1 ? "Pasó" : `Pasaron ${ids.length}`} a Selección de productos`);
      return true;
    },
    [mostrarToast],
  );
  const cols = useMemo(() => columnas(puedeEscribir, (id, estado) => void cambiar([id], estado)), [puedeEscribir, cambiar]);

  return (
    <TablaDatos
      def={DEF_SUGERENCIAS}
      filas={vistas}
      columnas={cols}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(f) => f.id}
      anchoMinimo="64rem"
      aspecto="lista"
      etiquetaGrupo={(campo, grupo) =>
        campo === "estado" ? <Badge color={colorEstadoSugerencia(grupo.clave)}>{grupo.etiqueta}</Badge> : <span className="font-semibold">{grupo.etiqueta}</span>
      }
      seleccion={
        puedeEscribir
          ? {
              etiqueta: (f) => `Seleccionar ${f.codigo}`,
              barra: (marcadas, quitar) => {
                const cantidad = `${marcadas.length} ${marcadas.length === 1 ? "sugerencia seleccionada" : "sugerencias seleccionadas"}`;
                return (
                  <div
                    role="region"
                    aria-label="Sugerencias seleccionadas"
                    aria-busy={guardandoLote}
                    className="sticky bottom-4 z-30 mx-auto my-3 flex w-fit max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-border-control bg-card px-3 py-2 text-sm shadow-lg"
                  >
                    <span className="font-medium tabular-nums">{cantidad}</span>
                    <SelectorEstado
                      estado={null}
                      opciones={ESTADOS_SUGERENCIA}
                      aria={`Cambiar el estado de ${cantidad}`}
                      puedeEscribir
                      alCambiar={async (estado) => {
                        setGuardandoLote(true);
                        await cambiar(
                          marcadas.map((m) => m.id),
                          estado,
                        );
                        setGuardandoLote(false);
                      }}
                    >
                      <span className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1">
                        <EstadoIcon className="h-4 w-4" />
                        Estado
                      </span>
                    </SelectorEstado>
                    <button type="button" onClick={quitar} className={`flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:bg-muted ${anilloFoco}`}>
                      <CerrarIcon className="h-4 w-4" />
                      Quitar selección
                    </button>
                  </div>
                );
              },
            }
          : undefined
      }
      accionPrincipal={puedeEscribir ? <FichaSugerencia action={crearSugerenciaManual} clientes={clientes} /> : undefined}
      ariaLabel="Tabla de sugerencias de clientes"
      vacio="Todavía no hay sugerencias. Llegan desde la ficha del cliente en el CRM («Recomendar producto») o con «Agregar»."
    />
  );
}
