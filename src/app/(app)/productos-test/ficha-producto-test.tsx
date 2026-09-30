"use client";

import { useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import {
  claseMetrica,
  dolar,
  nivelCpa,
  nivelCpm,
  nivelCtr,
  nivelCvr,
  nivelEfectividad,
  nivelGasto,
  nivelHookRate,
  porcentaje,
} from "@/lib/metricas-meta-ads";
import { CalendarioIcon, EtiquetaIcon, FlechaAbajoIcon, FlechaArribaIcon, InteligenciaIcon, TestIcon } from "@/lib/nav-icons";
import {
  colorEstado,
  colorExplotacion,
  colorTestNumero,
  etiquetaEstado,
  etiquetaExplotacion,
  etiquetaTestNumero,
  type FilaProductoTest,
} from "./def-productos-test";
import { EliminarProductoTestBoton } from "./eliminar-producto-test-boton";
import { FormularioProductoTest } from "./formulario-producto-test";

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

const SIN_DATO = <span className="text-muted-foreground">—</span>;

function Enlace({ href }: { href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-sm break-all text-accent-foreground underline underline-offset-2 hover:no-underline">
      {href}
    </a>
  );
}

function ValorMetrica({ texto, clase }: { texto: string; clase: string }) {
  return <span className={`font-semibold tabular-nums ${clase}`}>{texto}</span>;
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

/** Los datos de un producto en test solo para leer: lo que ve quien no tiene permiso de escritura. */
function DatosDelProductoTest({ producto }: { producto: FilaProductoTest }) {
  return (
    <div className="flex flex-col divide-y divide-border border-t border-border p-5">
      <Seccion icono={EtiquetaIcon} titulo="Producto">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dato etiqueta="Fecha Creación">{producto.fechaCreacion ?? SIN_DATO}</Dato>
          <Dato etiqueta="Fuente">{producto.fuente || SIN_DATO}</Dato>
          <Dato etiqueta="Categoría">{producto.categoria || SIN_DATO}</Dato>
          <Dato etiqueta="Worldwide">{producto.worldwide || SIN_DATO}</Dato>
          <Dato etiqueta="Ángulo de Venta">{producto.anguloVenta || SIN_DATO}</Dato>
          <Dato etiqueta="Página de Producto">{producto.paginaProductoUrl ? <Enlace href={producto.paginaProductoUrl} /> : SIN_DATO}</Dato>
          <Dato etiqueta="Video (Fuente)">{producto.videoUrl ? <Enlace href={producto.videoUrl} /> : SIN_DATO}</Dato>
        </dl>
      </Seccion>
      <Seccion icono={TestIcon} titulo="Test">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dato etiqueta="AD Library">{producto.adLibrary || SIN_DATO}</Dato>
          <Dato etiqueta="Fecha Test">{producto.fechaTest ?? SIN_DATO}</Dato>
          <Dato etiqueta="Calculadora">{producto.calculadoraUrl ? <Enlace href={producto.calculadoraUrl} /> : SIN_DATO}</Dato>
          <Dato etiqueta="Campaña">{producto.campanaUrl ? <Enlace href={producto.campanaUrl} /> : SIN_DATO}</Dato>
          <Dato etiqueta="ClickUp">{producto.clickup ? "Sí" : "No"}</Dato>
        </dl>
      </Seccion>
      <Seccion icono={InteligenciaIcon} titulo="Métricas de Meta Ads">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Dato etiqueta="Oferta">{producto.metricaOferta !== null ? <ValorMetrica texto={dolar(producto.metricaOferta)} clase="text-foreground" /> : SIN_DATO}</Dato>
          <Dato etiqueta="CPM">
            {producto.metricaCpm !== null ? <ValorMetrica texto={dolar(producto.metricaCpm)} clase={claseMetrica(nivelCpm(producto.metricaCpm))} /> : SIN_DATO}
          </Dato>
          <Dato etiqueta="% Efectividad">
            {producto.metricaEfectividad !== null ? (
              <ValorMetrica texto={porcentaje(producto.metricaEfectividad)} clase={claseMetrica(nivelEfectividad(producto.metricaEfectividad))} />
            ) : (
              SIN_DATO
            )}
          </Dato>
          <Dato etiqueta="Hook Rate">
            {producto.metricaHookRate !== null ? (
              <ValorMetrica texto={porcentaje(producto.metricaHookRate)} clase={claseMetrica(nivelHookRate(producto.metricaHookRate))} />
            ) : (
              SIN_DATO
            )}
          </Dato>
          <Dato etiqueta="CTR">
            {producto.metricaCtr !== null ? <ValorMetrica texto={porcentaje(producto.metricaCtr)} clase={claseMetrica(nivelCtr(producto.metricaCtr))} /> : SIN_DATO}
          </Dato>
          <Dato etiqueta="CPA">
            {producto.metricaCpa !== null ? <ValorMetrica texto={dolar(producto.metricaCpa)} clase={claseMetrica(nivelCpa(producto.metricaCpa))} /> : SIN_DATO}
          </Dato>
          <Dato etiqueta="Gasto">
            {producto.metricaGasto !== null ? <ValorMetrica texto={dolar(producto.metricaGasto)} clase={claseMetrica(nivelGasto(producto.metricaGasto))} /> : SIN_DATO}
          </Dato>
          <Dato etiqueta="Compras">{producto.metricaCompras !== null ? <ValorMetrica texto={String(producto.metricaCompras)} clase="text-foreground" /> : SIN_DATO}</Dato>
          <Dato etiqueta="CVR">
            {producto.metricaCvr !== null ? <ValorMetrica texto={porcentaje(producto.metricaCvr)} clase={claseMetrica(nivelCvr(producto.metricaCvr))} /> : SIN_DATO}
          </Dato>
        </dl>
      </Seccion>
      <Seccion icono={CalendarioIcon} titulo="Seguimiento">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dato etiqueta="Revisado">{producto.revisado ? "Sí" : "No"}</Dato>
          <Dato etiqueta="Última Revisión">{producto.ultimaRevision ?? SIN_DATO}</Dato>
          <Dato etiqueta="Explotación">
            {producto.explotacion ? <Badge color={colorExplotacion(producto.explotacion)}>{etiquetaExplotacion(producto.explotacion)}</Badge> : SIN_DATO}
          </Dato>
        </dl>
        <Dato etiqueta="Observación">{producto.observacion || SIN_DATO}</Dato>
      </Seccion>
    </div>
  );
}

/**
 * Ficha de un producto en test: el panel a la derecha que se abre al pulsar su fila (igual que
 * `FichaFiltro`), con flechas para pasar al de arriba o de abajo en el orden de la tabla.
 */
export function FichaProductoTest({
  producto,
  orden,
  paisId,
  puedeEscribir,
  alIr,
  alCerrar,
}: {
  producto: FilaProductoTest | undefined;
  orden: string[];
  paisId: string;
  puedeEscribir: boolean;
  alIr: (id: string) => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [guardando, setGuardando] = useState(false);
  const [sinGuardarId, setSinGuardarId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const sinGuardar = !!producto && sinGuardarId === producto.id;

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

  const indice = producto ? orden.indexOf(producto.id) : -1;
  const anterior = indice > 0 ? orden[indice - 1] : null;
  const siguiente = indice >= 0 && indice < orden.length - 1 ? orden[indice + 1] : null;

  return (
    <Ventana
      abierto={!!producto}
      alCerrar={cerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        producto && (
          <>
            <span className="text-lg font-semibold">{producto.nombre}</span>
            <Badge color={colorEstado(producto.estado)}>{etiquetaEstado(producto.estado)}</Badge>
            {producto.testNumero && <Badge color={colorTestNumero(producto.testNumero)}>{etiquetaTestNumero(producto.testNumero)}</Badge>}
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
      {producto && (
        <div ref={raiz} className="flex flex-1 flex-col">
          {puedeEscribir ? (
            <FormularioProductoTest
              key={`${producto.id}-${version}`}
              paisId={paisId}
              producto={producto}
              botonesArriba
              acciones={<EliminarProductoTestBoton id={producto.id} nombre={producto.nombre} alEliminar={alCerrar} />}
              alGuardar={alGuardar}
              alCancelar={alCancelar}
              alCambiarGuardando={setGuardando}
              alModificar={() => setSinGuardarId(producto.id)}
            />
          ) : (
            <DatosDelProductoTest producto={producto} />
          )}
        </div>
      )}
    </Ventana>
  );
}
