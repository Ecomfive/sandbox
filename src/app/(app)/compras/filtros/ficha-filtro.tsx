"use client";

import { useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { VisorImagen } from "@/components/ui/visor-imagen";
import { formatearMoneda } from "@/lib/formato";
import { CalendarioIcon, FiltroIcon, FlechaAbajoIcon, FlechaArribaIcon, GastoIcon, InteligenciaIcon } from "@/lib/nav-icons";
import {
  claseMetrica,
  colorEstado,
  colorEstadoRegistro,
  colorPrioridad,
  etiquetaEstado,
  etiquetaEstadoRegistro,
  etiquetaPrioridad,
  etiquetaTipoEnvio,
  nivelCpa,
  nivelCpm,
  nivelCtr,
  nivelCvr,
  nivelEfectividad,
  nivelGasto,
  nivelHookRate,
  type FilaFiltro,
} from "./def-filtros";
import { EliminarFiltroBoton } from "./eliminar-filtro-boton";
import { EtiquetaTienda } from "./etiqueta-tienda";
import { FormularioFiltro } from "./formulario-filtro";

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

const SIN_DATO = <span className="text-muted-foreground">—</span>;

/** Las métricas de Meta Ads siempre vienen en dólares (así las reporta Meta), sin importar la moneda
 * del país — a diferencia del resto de la ficha, que sí usa `formatearMoneda` con la moneda local. */
const dolar = (valor: number) => `$${valor.toFixed(2)}`;
const porcentaje = (valor: number) => `${valor.toFixed(2)}%`;

function ValorMetrica({ texto, clase }: { texto: string; clase: string }) {
  return <span className={`font-semibold tabular-nums ${clase}`}>{texto}</span>;
}

/**
 * Las métricas del test en Meta Ads que se usan para decidir cuánto pedir de cada producto — siempre al
 * final de la ficha, se editen o no los demás datos ahí mismo. El color de cada número se calcula del
 * valor (no se guarda un color aparte); Oferta y Compras nunca cambian de color.
 */
function MetricasMeta({ filtro }: { filtro: FilaFiltro }) {
  const hay =
    filtro.landingUrl ||
    filtro.metricaOferta !== null ||
    filtro.metricaCpm !== null ||
    filtro.metricaEfectividad !== null ||
    filtro.metricaHookRate !== null ||
    filtro.metricaCtr !== null ||
    filtro.metricaCpa !== null ||
    filtro.metricaGasto !== null ||
    filtro.metricaCompras !== null ||
    filtro.metricaCvr !== null;
  if (!hay) return null;

  return (
    <div className="border-t border-border p-5">
      <Seccion icono={InteligenciaIcon} titulo="Métricas de Meta Ads">
        {filtro.landingUrl && (
        <Dato etiqueta="Landing">
          <a
            href={filtro.landingUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm break-all text-accent-foreground underline underline-offset-2 hover:no-underline"
          >
            {filtro.landingUrl}
          </a>
        </Dato>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Dato etiqueta="Oferta">{filtro.metricaOferta !== null ? <ValorMetrica texto={dolar(filtro.metricaOferta)} clase="text-foreground" /> : SIN_DATO}</Dato>
        <Dato etiqueta="CPM">
          {filtro.metricaCpm !== null ? <ValorMetrica texto={dolar(filtro.metricaCpm)} clase={claseMetrica(nivelCpm(filtro.metricaCpm))} /> : SIN_DATO}
        </Dato>
        <Dato etiqueta="% Efectividad">
          {filtro.metricaEfectividad !== null ? (
            <ValorMetrica texto={porcentaje(filtro.metricaEfectividad)} clase={claseMetrica(nivelEfectividad(filtro.metricaEfectividad))} />
          ) : (
            SIN_DATO
          )}
        </Dato>
        <Dato etiqueta="Hook Rate">
          {filtro.metricaHookRate !== null ? (
            <ValorMetrica texto={porcentaje(filtro.metricaHookRate)} clase={claseMetrica(nivelHookRate(filtro.metricaHookRate))} />
          ) : (
            SIN_DATO
          )}
        </Dato>
        <Dato etiqueta="CTR">
          {filtro.metricaCtr !== null ? <ValorMetrica texto={porcentaje(filtro.metricaCtr)} clase={claseMetrica(nivelCtr(filtro.metricaCtr))} /> : SIN_DATO}
        </Dato>
        <Dato etiqueta="CPA">
          {filtro.metricaCpa !== null ? <ValorMetrica texto={dolar(filtro.metricaCpa)} clase={claseMetrica(nivelCpa(filtro.metricaCpa))} /> : SIN_DATO}
        </Dato>
        <Dato etiqueta="Gasto">
          {filtro.metricaGasto !== null ? <ValorMetrica texto={dolar(filtro.metricaGasto)} clase={claseMetrica(nivelGasto(filtro.metricaGasto))} /> : SIN_DATO}
        </Dato>
        <Dato etiqueta="Compras">{filtro.metricaCompras !== null ? <ValorMetrica texto={String(filtro.metricaCompras)} clase="text-foreground" /> : SIN_DATO}</Dato>
        <Dato etiqueta="CVR">
          {filtro.metricaCvr !== null ? <ValorMetrica texto={porcentaje(filtro.metricaCvr)} clase={claseMetrica(nivelCvr(filtro.metricaCvr))} /> : SIN_DATO}
        </Dato>
      </dl>
      </Seccion>
    </div>
  );
}

function BotonNavegar({ texto, icono: Icono, activo, alHacerClic }: {
  texto: string;
  icono: typeof FlechaArribaIcon;
  activo: boolean;
  alHacerClic: () => void;
}) {
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

/** Los datos de un producto candidato solo para leer: lo que ve quien no tiene permiso de escritura en Compras. */
function DatosDelFiltro({ filtro, codigoPais }: { filtro: FilaFiltro; codigoPais: string }) {
  const dinero = (valor: number | null) => (valor !== null ? formatearMoneda(valor, codigoPais) : SIN_DATO);
  const [ampliada, setAmpliada] = useState(false);
  return (
    <div className="flex flex-col divide-y divide-border border-t border-border p-5">
      <Seccion icono={FiltroIcon} titulo="Producto">
        {filtro.fotoUrl && (
          <button
            type="button"
            onClick={() => setAmpliada(true)}
            className="h-32 w-32 overflow-hidden rounded-md border border-border"
            aria-label="Ver la foto más grande"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={filtro.fotoUrl} alt="" className="h-full w-full object-cover" />
          </button>
        )}
        {ampliada && <VisorImagen src={filtro.fotoUrl} onClose={() => setAmpliada(false)} />}
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dato etiqueta="Tipo de Envío">{etiquetaTipoEnvio(filtro.tipoEnvio) ?? SIN_DATO}</Dato>
          <Dato etiqueta="Prioridad">
            <Badge color={colorPrioridad(filtro.prioridad)}>{etiquetaPrioridad(filtro.prioridad)}</Badge>
          </Dato>
          <Dato etiqueta="Asignado a:">{filtro.asignadoNombre || SIN_DATO}</Dato>
          <Dato etiqueta="Aprobación Gestionada">{filtro.aprobacionGestionada ? "Sí" : "No"}</Dato>
        </dl>
      </Seccion>
      <Seccion icono={GastoIcon} titulo="Cantidad y precio">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dato etiqueta="QTY Producto">{filtro.qtyProducto ?? SIN_DATO}</Dato>
          <Dato etiqueta="Precio Total">{dinero(filtro.precioTotal)}</Dato>
          <Dato etiqueta="Precio Unitario">{dinero(filtro.precioUnitario)}</Dato>
        </dl>
      </Seccion>
      <Seccion icono={CalendarioIcon} titulo="Seguimiento">
        <dl className="flex flex-col gap-3">
          <Dato etiqueta="Comentarios">{filtro.comentarios || SIN_DATO}</Dato>
        </dl>
      </Seccion>
    </div>
  );
}

/**
 * Ficha de un producto candidato de Filtros: el panel a la derecha que se abre al pulsar su fila (igual que
 * `FichaCompra`), con flechas para pasar al de arriba o de abajo en el orden de la tabla.
 */
export function FichaFiltro({
  filtro,
  orden,
  paisId,
  codigoPais,
  puedeEscribir,
  alIr,
  alCerrar,
}: {
  /** El producto que se ve; sin él el panel está cerrado. */
  filtro: FilaFiltro | undefined;
  /** Las claves de los productos en el orden de la tabla. */
  orden: string[];
  paisId: string;
  codigoPais: string;
  puedeEscribir: boolean;
  alIr: (id: string) => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [guardando, setGuardando] = useState(false);
  const [sinGuardarId, setSinGuardarId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const sinGuardar = !!filtro && sinGuardarId === filtro.id;

  function puedeDescartar() {
    return !sinGuardar || confirm("Hay cambios sin guardar. ¿Descartarlos?");
  }

  function enfocarPrimerCampo() {
    requestAnimationFrame(() => raiz.current?.querySelector<HTMLElement>("[data-enfocar]")?.focus());
  }

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

  function alGuardar() {
    setGuardando(false);
    setSinGuardarId(null);
    mostrarToast("Cambios guardados");
    enfocarPrimerCampo();
  }

  function alCancelar() {
    setSinGuardarId(null);
    setVersion((v) => v + 1);
    enfocarPrimerCampo();
  }

  const indice = filtro ? orden.indexOf(filtro.id) : -1;
  const anterior = indice > 0 ? orden[indice - 1] : null;
  const siguiente = indice >= 0 && indice < orden.length - 1 ? orden[indice + 1] : null;

  return (
    <Ventana
      abierto={!!filtro}
      alCerrar={cerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        filtro && (
          <>
            {filtro.tienda && <EtiquetaTienda valor={filtro.tienda} />}
            <span className="text-lg font-semibold">{filtro.nombre}</span>
            <Badge color={colorEstadoRegistro(filtro.estadoRegistro)}>{etiquetaEstadoRegistro(filtro.estadoRegistro)}</Badge>
            <Badge color={colorEstado(filtro.estado)}>{etiquetaEstado(filtro.estado)}</Badge>
          </>
        )
      }
      navegacion={
        <>
          <BotonNavegar texto="Producto anterior" icono={FlechaArribaIcon} activo={!!anterior && !guardando} alHacerClic={() => anterior && irA(anterior)} />
          <BotonNavegar texto="Producto siguiente" icono={FlechaAbajoIcon} activo={!!siguiente && !guardando} alHacerClic={() => siguiente && irA(siguiente)} />
        </>
      }
    >
      {filtro && (
        <div ref={raiz} className="flex flex-1 flex-col">
          {puedeEscribir ? (
            <FormularioFiltro
              key={`${filtro.id}-${version}`}
              paisId={paisId}
              filtro={filtro}
              botonesArriba
              acciones={<EliminarFiltroBoton id={filtro.id} nombre={filtro.nombre} alEliminar={alCerrar} />}
              alGuardar={alGuardar}
              alCancelar={alCancelar}
              alCambiarGuardando={setGuardando}
              alModificar={() => setSinGuardarId(filtro.id)}
            />
          ) : (
            <DatosDelFiltro filtro={filtro} codigoPais={codigoPais} />
          )}
          <MetricasMeta filtro={filtro} />
        </div>
      )}
    </Ventana>
  );
}
