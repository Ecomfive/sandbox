"use client";

import { useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { formatearFecha } from "@/lib/formato";
import { EnlaceIcon, FlechaAbajoIcon, FlechaArribaIcon, GastoIcon, SeleccionIcon } from "@/lib/nav-icons";
import { obtenerHistorialSeleccion } from "./actions";
import { colorFuente, etiquetaFuente, numeroSeleccion, type FilaSeleccion } from "./def-seleccion";
import { FormularioSeleccion, type Responsable } from "./formulario-seleccion";
import { SelectorEstado } from "./selector-estado";

function BotonNavegar({ texto, icono: Icono, activo, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; activo: boolean; alHacerClic: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!activo}
        onClick={() => activo && alHacerClic()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${activo ? "hover:bg-muted" : "cursor-default opacity-40"}`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

const usd = (n: number | null) => (n === null ? "—" : `$${n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="m-0 text-sm">{children}</dd>
    </div>
  );
}

function Enlace({ url }: { url: string | null }) {
  return url ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`break-all text-primario hover:underline ${anilloFoco}`}>
      {url}
    </a>
  ) : (
    <span className="text-muted-foreground">—</span>
  );
}

/** Lo que la fila trae de los cruces: el motivo del descarte, la prioridad, el precio original y sus ofertas. */
function AvisosFila({ fila }: { fila: FilaSeleccion }) {
  const lineas = [
    fila.estado === "descartado" && fila.motivoDescarte ? { punto: "bg-destructive", texto: fila.motivoDescarte } : null,
    fila.prioridad.length ? { punto: "bg-destructive", texto: `Prioridad: también está en ${fila.prioridad.join(", ")}. Se está vendiendo fuerte.` } : null,
    fila.precioOriginal !== null && fila.monedaOriginal && fila.monedaOriginal !== "USD"
      ? { punto: "bg-border-control", texto: `Costo en el proveedor: ${fila.precioOriginal.toLocaleString("es-PA", { minimumFractionDigits: 2 })} ${fila.monedaOriginal} (pasado a dólares con el tipo de cambio del día en que llegó).` }
      : null,
    fila.ofertas || fila.estado === "crear_oferta" ? { punto: "bg-border-control", texto: `${fila.ofertas} de 3 ofertas en Creación de ofertas.`, href: "/creacion-ofertas" } : null,
  ].filter(Boolean) as { punto: string; texto: string; href?: string }[];
  if (!lineas.length) return null;
  return (
    <ul className="flex flex-col gap-1.5 border-b border-border px-5 py-3 text-sm">
      {lineas.map((l) => (
        <li key={l.texto} className="flex items-start gap-2">
          <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${l.punto}`} />
          {l.href ? (
            <a href={l.href} className="underline underline-offset-2">
              {l.texto}
            </a>
          ) : (
            <span>{l.texto}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Lo que se ve de una fila sin permiso de escritura. */
function DatosDeLaFila({ fila }: { fila: FilaSeleccion }) {
  return (
    <div className="flex flex-col divide-y divide-border p-5">
      <Seccion icono={SeleccionIcon} titulo="Producto">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dato etiqueta="Fecha de captación">{formatearFecha(fila.fechaCaptacion)}</Dato>
          <Dato etiqueta="Categoría">{fila.categoria ?? "—"}</Dato>
          <Dato etiqueta="Responsable">{fila.responsableNombre ?? "—"}</Dato>
          <Dato etiqueta="Notas">{fila.notas ?? "—"}</Dato>
        </dl>
      </Seccion>
      <Seccion icono={EnlaceIcon} titulo="Enlaces">
        <dl className="flex flex-col gap-3">
          <Dato etiqueta="Página del producto">
            <Enlace url={fila.urlPagina} />
          </Dato>
          <Dato etiqueta="Ad Library">
            <Enlace url={fila.urlAdLibrary} />
          </Dato>
        </dl>
      </Seccion>
      <Seccion icono={GastoIcon} titulo="Precios de referencia (USD)">
        <dl className="grid grid-cols-2 gap-3">
          <Dato etiqueta="Costo proveedor">{usd(fila.costoProveedor)}</Dato>
          <Dato etiqueta="Precio de venta">{usd(fila.precioVenta)}</Dato>
        </dl>
      </Seccion>
    </div>
  );
}

/**
 * La ficha de una fila de Selección: el panel a la derecha que se abre al pulsar su nombre (como `FichaFiltro`), con
 * flechas para pasar a la de arriba o la de abajo. En la cabecera, su N.º, su fuente con el código y el estado, que se
 * cambia ahí mismo; el cuerpo ya es el formulario, y la actividad va al final.
 */
export function FichaSeleccion({
  fila,
  orden,
  codigoPais,
  puedeEscribir,
  responsables,
  categorias,
  alCambiarEstado,
  alIr,
  alCerrar,
}: {
  fila: FilaSeleccion | undefined;
  orden: string[];
  codigoPais: string;
  puedeEscribir: boolean;
  responsables: Responsable[];
  categorias: string[];
  alCambiarEstado: (id: string, estado: string) => Promise<boolean>;
  alIr: (id: string) => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [guardando, setGuardando] = useState(false);
  const [sinGuardarId, setSinGuardarId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [versionHistorial, setVersionHistorial] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const sinGuardar = !!fila && sinGuardarId === fila.id;

  const puedeDescartar = () => !sinGuardar || confirm("Hay cambios sin guardar. ¿Descartarlos?");
  const enfocarPrimerCampo = () => requestAnimationFrame(() => raiz.current?.querySelector<HTMLElement>("[data-enfocar]")?.focus());

  function cerrar() {
    if (guardando || !puedeDescartar()) return;
    setSinGuardarId(null);
    alCerrar();
  }

  function irA(id: string) {
    if (guardando || !puedeDescartar()) return;
    setSinGuardarId(null);
    alIr(id);
  }

  const indice = fila ? orden.indexOf(fila.id) : -1;
  const anterior = indice > 0 ? orden[indice - 1] : null;
  const siguiente = indice >= 0 && indice < orden.length - 1 ? orden[indice + 1] : null;

  return (
    <Ventana
      abierto={!!fila}
      alCerrar={cerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        fila && (
          <>
            <span className="text-sm font-medium text-muted-foreground tabular-nums">{numeroSeleccion(fila.numero)}</span>
            <span className="text-lg font-semibold">{fila.nombre}</span>
            <Badge color={colorFuente(fila.fuente)}>
              {etiquetaFuente(fila.fuente)} · {fila.codigoFuente}
            </Badge>
            <SelectorEstado
              estado={fila.estado}
              aria={`Estado de ${fila.nombre}`}
              puedeEscribir={puedeEscribir}
              alCambiar={async (estado) => {
                if (await alCambiarEstado(fila.id, estado)) setVersionHistorial((v) => v + 1);
              }}
            />
          </>
        )
      }
      navegacion={
        <>
          <BotonNavegar texto="Fila anterior" icono={FlechaArribaIcon} activo={!!anterior && !guardando} alHacerClic={() => anterior && irA(anterior)} />
          <BotonNavegar texto="Fila siguiente" icono={FlechaAbajoIcon} activo={!!siguiente && !guardando} alHacerClic={() => siguiente && irA(siguiente)} />
        </>
      }
    >
      {fila && (
        <div ref={raiz} className="flex flex-1 flex-col">
          <AvisosFila fila={fila} />
          {puedeEscribir ? (
            <FormularioSeleccion
              key={`${fila.id}-${version}`}
              fila={fila}
              responsables={responsables}
              categorias={categorias}
              botonesArriba
              alGuardar={() => {
                setGuardando(false);
                setSinGuardarId(null);
                setVersionHistorial((v) => v + 1);
                mostrarToast("Cambios guardados");
                enfocarPrimerCampo();
              }}
              alCancelar={() => {
                setSinGuardarId(null);
                setVersion((v) => v + 1);
                enfocarPrimerCampo();
              }}
              alCambiarGuardando={setGuardando}
              alModificar={() => setSinGuardarId(fila.id)}
            />
          ) : (
            <DatosDeLaFila fila={fila} />
          )}
          <div className="border-t border-border p-5">
            <HistorialGenerico id={fila.id} codigoPais={codigoPais} version={versionHistorial} obtener={obtenerHistorialSeleccion} />
          </div>
        </div>
      )}
    </Ventana>
  );
}
