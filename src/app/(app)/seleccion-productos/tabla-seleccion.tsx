"use client";

import { useCallback, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { TarjetaEmergente } from "@/components/ui/tarjeta-emergente";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { formatearFecha } from "@/lib/formato";
import { AdjuntoIcon, CalendarioIcon, EnlaceIcon, EstadoIcon, GastoIcon, PersonaIcon, ScrapingIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { cambiarEstadoSeleccion } from "./actions";
import { BarraLoteSeleccion } from "./barra-lote-seleccion";
import { CrearSeleccionPanel } from "./crear-seleccion-panel";
import { colorEstadoSeleccion, colorFuente, DEF_SELECCION, etiquetaFuente, numeroSeleccion, type FilaSeleccion } from "./def-seleccion";
import { FichaSeleccion } from "./ficha-seleccion";
import type { Responsable } from "./formulario-seleccion";
import { SelectorEstado } from "./selector-estado";

const NOMBRE: NombreFilas = { singular: "producto", plural: "productos" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  fuente: ScrapingIcon,
  categoria: EstadoIcon,
  responsable: PersonaIcon,
  fechaCaptacion: CalendarioIcon,
  costoProveedor: GastoIcon,
  precioVenta: GastoIcon,
  notas: EstadoIcon,
};
const usd = (n: number | null) => (n === null ? "—" : `$${n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function Vinculo({ url, texto }: { url: string | null; texto: string }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <Tooltip texto={texto}>
      <a href={url} target="_blank" rel="noopener noreferrer" aria-label={texto} className={`inline-flex h-7 w-7 items-center justify-center rounded-md text-primario hover:bg-muted ${anilloFoco}`}>
        <EnlaceIcon className="h-4 w-4" />
      </a>
    </Tooltip>
  );
}

function columnas(puedeEscribir: boolean, cambiar: (id: string, estado: string) => void): ColumnaTabla<FilaSeleccion, undefined>[] {
  return [
    { id: "numero", label: "N.º", ocultable: false, clase: "tabular-nums text-muted-foreground whitespace-nowrap", render: (f) => numeroSeleccion(f.numero) },
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
        <span className="flex max-w-[24rem] flex-col">
          <span className="block truncate" title={f.nombre}>
            {f.nombre}
          </span>
          {(f.prioridad.length > 0 || (f.estado === "descartado" && f.motivoDescarte)) && (
            <span className="flex flex-wrap items-center gap-1 text-xs font-normal">
              {f.prioridad.length > 0 && (
                <Tooltip texto={`También en: ${f.prioridad.join(", ")}`}>
                  <span tabIndex={0} className="rounded-[5px] bg-destructive-soft px-1.5 py-0.5 text-[11px] font-semibold text-destructive">
                    Prioridad · {f.prioridad.length + 1} fuentes
                  </span>
                </Tooltip>
              )}
              {f.estado === "descartado" && f.motivoDescarte && (
                <span className="truncate text-muted-foreground" title={f.motivoDescarte}>
                  {f.motivoDescarte}
                </span>
              )}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "ofertas",
      label: "Ofertas",
      ocultable: true,
      clase: "tabular-nums whitespace-nowrap text-muted-foreground",
      render: (f) => (f.ofertas ? `${f.ofertas} de 3` : f.estado === "crear_oferta" ? "Sin ofertas" : "—"),
    },
    {
      id: "estado",
      label: "Estado",
      ocultable: true,
      render: (f) => <SelectorEstado estado={f.estado} aria={`Estado de ${f.nombre}`} puedeEscribir={puedeEscribir} alCambiar={(e) => cambiar(f.id, e)} />,
    },
    { id: "fuente", label: "Fuente", ocultable: true, render: (f) => <Badge color={colorFuente(f.fuente)}>{etiquetaFuente(f.fuente)}</Badge> },
    { id: "codigoFuente", label: "Código fuente", ocultable: true, clase: "tabular-nums whitespace-nowrap", render: (f) => f.codigoFuente },
    { id: "fechaCaptacion", label: "Captado", ocultable: true, clase: "whitespace-nowrap text-muted-foreground", render: (f) => formatearFecha(f.fechaCaptacion) },
    { id: "categoria", label: "Categoría", ocultable: true, clase: "text-muted-foreground", render: (f) => f.categoria ?? "—" },
    { id: "costoProveedor", label: "Costo proveedor", ocultable: true, clase: "text-right tabular-nums", render: (f) => usd(f.costoProveedor) },
    { id: "precioVenta", label: "Precio de venta", ocultable: true, clase: "text-right tabular-nums", render: (f) => usd(f.precioVenta) },
    { id: "responsable", label: "Responsable", ocultable: true, clase: "text-muted-foreground", render: (f) => f.responsableNombre ?? "—" },
    { id: "urlPagina", label: "Página", ocultable: true, render: (f) => <Vinculo url={f.urlPagina} texto={`Abrir la página de ${f.nombre}`} /> },
    { id: "urlAdLibrary", label: "Ad Library", ocultable: true, render: (f) => <Vinculo url={f.urlAdLibrary} texto={`Abrir los anuncios de ${f.nombre}`} /> },
    { id: "notas", label: "Notas", ocultable: true, oculta: true, clase: "text-muted-foreground", render: (f) => <span className="block max-w-[18rem] truncate">{f.notas ?? "—"}</span> },
  ];
}

/**
 * El tablero de Selección de productos (Testing Lab › Selección), con la barra de herramientas común y el aspecto de lista
 * de Compras: arranca agrupado por estado, el estado se cambia en su celda (o en varias filas a la vez) y pulsar el nombre
 * abre la ficha. El cambio de estado se ve al instante y vuelve atrás si el servidor lo rechaza.
 */
export function TablaSeleccion({
  filas,
  codigoPais,
  puedeEscribir,
  responsables,
  categorias,
}: {
  filas: FilaSeleccion[];
  codigoPais: string;
  puedeEscribir: boolean;
  responsables: Responsable[];
  categorias: string[];
}) {
  const { mostrarToast } = useToast();
  const [abierta, setAbierta] = useState<{ id: string; orden: string[] } | null>(null);
  // Los estados cambiados que el servidor todavía no devolvió (se ven al instante).
  const [cambios, setCambios] = useState<Record<string, string>>({});
  const [guardandoLote, setGuardandoLote] = useState(false);
  const vistas = useMemo(() => filas.map((f) => (cambios[f.id] && cambios[f.id] !== f.estado ? { ...f, estado: cambios[f.id] } : f)), [filas, cambios]);
  const fila = abierta ? vistas.find((f) => f.id === abierta.id) : undefined;

  const cambiar = useCallback(
    async (ids: string[], estado: string): Promise<boolean> => {
      setCambios((c) => ({ ...c, ...Object.fromEntries(ids.map((id) => [id, estado])) }));
      const r = await cambiarEstadoSeleccion(ids, estado).catch(() => ({ error: "No se pudo cambiar el estado." }));
      if (r.error) {
        setCambios((c) => Object.fromEntries(Object.entries(c).filter(([id]) => !ids.includes(id))));
        mostrarToast(r.error, "destructive");
        return false;
      }
      return true;
    },
    [mostrarToast],
  );
  const cols = useMemo(() => columnas(puedeEscribir, (id, estado) => void cambiar([id], estado)), [puedeEscribir, cambiar]);

  return (
    <>
      <TablaDatos
        def={DEF_SELECCION}
        filas={vistas}
        columnas={cols}
        iconos={ICONOS}
        nombre={NOMBRE}
        claveFila={(f) => f.id}
        anchoMinimo="64rem"
        aspecto="lista"
        // Al agrupar, el título de cada grupo lleva el color de su estado o su fuente (como en Compras y en ClickUp).
        etiquetaGrupo={(campo, grupo) =>
          campo === "estado" ? (
            <Badge color={colorEstadoSeleccion(grupo.clave)}>{grupo.etiqueta}</Badge>
          ) : campo === "fuente" ? (
            <Badge color={colorFuente(grupo.clave)}>{grupo.etiqueta}</Badge>
          ) : (
            <span className="font-semibold">{grupo.etiqueta}</span>
          )
        }
        abrirFila={{
          etiqueta: (f) => `Abrir la ficha de ${f.nombre}`,
          alAbrir: (f, orden) => setAbierta({ id: f.id, orden }),
          columna: "nombre",
          soloColumna: true,
        }}
        seleccion={
          puedeEscribir
            ? {
                etiqueta: (f) => `Seleccionar ${f.nombre}`,
                barra: (marcadas, quitar) => (
                  <BarraLoteSeleccion
                    filas={marcadas}
                    alQuitar={quitar}
                    guardando={guardandoLote}
                    alCambiarEstado={async (estado) => {
                      setGuardandoLote(true);
                      if (await cambiar(marcadas.map((m) => m.id), estado)) mostrarToast(`${marcadas.length} ${marcadas.length === 1 ? "fila movida" : "filas movidas"}`);
                      setGuardandoLote(false);
                    }}
                  />
                ),
              }
            : undefined
        }
        accionPrincipal={puedeEscribir ? <CrearSeleccionPanel responsables={responsables} categorias={categorias} /> : undefined}
        ariaLabel="Tablero de selección de productos"
        vacio="Todavía no hay productos para seleccionar. Agrega uno a mano o envíalo desde una fuente."
      />
      <FichaSeleccion
        fila={fila}
        orden={abierta?.orden ?? []}
        codigoPais={codigoPais}
        puedeEscribir={puedeEscribir}
        responsables={responsables}
        categorias={categorias}
        alCambiarEstado={(id, estado) => cambiar([id], estado)}
        alIr={(id) => setAbierta((a) => (a ? { ...a, id } : a))}
        alCerrar={() => setAbierta(null)}
      />
    </>
  );
}
