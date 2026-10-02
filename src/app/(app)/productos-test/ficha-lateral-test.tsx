"use client";

import type { ReactNode } from "react";
import { Pastilla, Punto } from "@/components/panel/piezas-panel";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import { formatearFecha } from "@/lib/formato";
import { EnlaceIcon, FlechaAbajoIcon, FlechaArribaIcon, LapizIcon } from "@/lib/nav-icons";
import {
  etiquetaEstado,
  etiquetaExplotacion,
  etiquetaTestNumero,
  type FilaProductoTest,
} from "./def-productos-test";
import { CPA_OBJETIVO, cumpleCriterio, limpiarCategoria, porcentaje, promedio, resultadoDe, usd } from "./informe";

const tonoEstado = (estado: string) => {
  const r = resultadoDe(estado);
  return r === "ganador" ? "exito" : r === "consulta" ? "aviso" : "neutro";
};

function BotonNavegar({ texto, icono: Icono, activo, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; activo: boolean; alHacerClic: () => void }) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!activo}
        onClick={() => activo && alHacerClic()}
        className={`flex h-7 w-7 items-center justify-center rounded-[7px] border border-border bg-card text-muted-foreground ${anilloFoco} ${activo ? "hover:bg-muted hover:text-foreground" : "cursor-default opacity-40"}`}
      >
        <Icono className="h-3.5 w-3.5" />
      </button>
    </Tooltip>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="border-b border-border p-3.5 last:border-b-0">
      <h4 className="mb-2.5 text-xs font-semibold tracking-[0.05em] text-muted-foreground uppercase">{titulo}</h4>
      {children}
    </section>
  );
}

/** Una métrica sobre una pista: la barra es el valor y la marca negra es la referencia (criterio o promedio de winners). */
function Medida({ nombre, valor, maximo, referencia, texto }: { nombre: string; valor: number | null; maximo: number; referencia: number | null; texto: string }) {
  return (
    <div className="mb-2.5 grid grid-cols-[5.5rem_minmax(0,1fr)_4.75rem] items-center gap-2 text-[13px]">
      <span className="text-muted-foreground">{nombre}</span>
      <span className="relative h-1.5 rounded-[3px] bg-accent" role="img" aria-label={`${nombre}: ${texto}`}>
        {valor !== null && <i className="absolute inset-y-0 left-0 rounded-[3px] bg-foreground-soft" style={{ width: `${Math.min(100, (valor / maximo) * 100)}%` }} />}
        {referencia !== null && <u aria-hidden="true" className="absolute -top-[3px] -bottom-[3px] w-0.5 bg-foreground no-underline" style={{ left: `${Math.min(100, (referencia / maximo) * 100)}%` }} />}
      </span>
      <span className="text-right font-medium tabular-nums">{texto}</span>
    </div>
  );
}

function Fila({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-2.5 border-b border-dashed border-border py-1.5 text-[13px] last:border-b-0">
      <span>{etiqueta}</span>
      <span className="min-w-0 text-right text-muted-foreground tabular-nums">{children}</span>
    </div>
  );
}

const vacio = <span className="text-muted-foreground">Sin llenar</span>;

/**
 * Ficha de un producto en test, fija a la derecha de la lista: su resultado frente al criterio, las métricas contra el
 * promedio de los winners, los datos del test, el análisis (con lo que falta por llenar) y los enlaces. «Editar» abre la
 * ficha de edición de siempre. `ganadores` son todos los productos ganadores, para calcular el promedio de referencia.
 */
export function FichaLateralTest({
  producto,
  ganadores,
  orden,
  alIr,
  alEditar,
  puedeEscribir,
}: {
  producto: FilaProductoTest | null;
  ganadores: FilaProductoTest[];
  orden: string[];
  alIr: (id: string) => void;
  alEditar: () => void;
  puedeEscribir: boolean;
}) {
  const p = producto;
  if (!p) {
    return (
      <aside aria-label="Ficha del producto" className="rounded-[10px] border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        Elige un producto para ver su ficha.
      </aside>
    );
  }
  const posicion = orden.indexOf(p.id);
  const anterior = posicion > 0 ? orden[posicion - 1] : null;
  const siguiente = posicion >= 0 && posicion < orden.length - 1 ? orden[posicion + 1] : null;
  const cumple = cumpleCriterio(p);
  const refCtr = promedio(ganadores, (f) => f.metricaCtr);
  const refHook = promedio(ganadores, (f) => f.metricaHookRate);
  const refCvr = promedio(ganadores, (f) => f.metricaCvr);
  const enlaces = [
    ["Página del producto", p.paginaProductoUrl],
    ["Video", p.videoUrl],
    ["Ad Library", p.adLibrary],
    ["Campaña", p.campanaUrl],
    ["Calculadora", p.calculadoraUrl],
  ].filter((e): e is [string, string] => !!e[1]);

  return (
    <aside aria-label={`Ficha de ${p.nombre}`} className="overflow-hidden rounded-[10px] border border-border bg-card min-[1100px]:sticky min-[1100px]:top-3 min-[1100px]:max-h-[calc(100vh-1.5rem)] min-[1100px]:overflow-y-auto">
      <div className="sticky top-0 z-[2] flex flex-col gap-2 border-b border-border bg-card p-3.5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="m-0 min-w-0 text-[15px] leading-snug font-semibold tracking-tight">{p.nombre}</h3>
          <div className="flex shrink-0 gap-1">
            <BotonNavegar texto="Producto anterior" icono={FlechaArribaIcon} activo={!!anterior} alHacerClic={() => anterior && alIr(anterior)} />
            <BotonNavegar texto="Producto siguiente" icono={FlechaAbajoIcon} activo={!!siguiente} alHacerClic={() => siguiente && alIr(siguiente)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pastilla tono={tonoEstado(p.estado)}>{etiquetaEstado(p.estado)}</Pastilla>
          {p.testNumero && <Pastilla>{etiquetaTestNumero(p.testNumero)}</Pastilla>}
          <Pastilla>{limpiarCategoria(p.categoria)}</Pastilla>
        </div>
        <button
          type="button"
          onClick={alEditar}
          className={`flex items-center justify-center gap-1.5 rounded-lg bg-accent px-2 py-2 text-[13px] font-medium hover:bg-accent-hover ${anilloFoco}`}
        >
          <LapizIcon className="h-4 w-4" />
          {puedeEscribir ? "Editar producto" : "Ver todos los campos"}
        </button>
      </div>

      <Bloque titulo="Resultado del test">
        <p className="mb-2.5 flex items-start gap-1.5 text-[13px]">
          <Punto tono={cumple === null ? "gris" : cumple ? "exito" : "peligro"} className="mt-1.5" />
          <span>
            {cumple === null
              ? "Falta el CPA para evaluar el criterio."
              : cumple
                ? `Cumple el criterio: CPA ${usd(p.metricaCpa ?? 0)}, menor a ${usd(CPA_OBJETIVO)}.`
                : `No cumple: CPA ${usd(p.metricaCpa ?? 0)}, no es menor a ${usd(CPA_OBJETIVO)}.`}
          </span>
        </p>
        <Medida nombre="CPA" valor={p.metricaCpa} maximo={20} referencia={CPA_OBJETIVO} texto={p.metricaCpa === null ? "—" : usd(p.metricaCpa)} />
        <Medida nombre="Compras" valor={p.metricaCompras} maximo={12} referencia={promedio(ganadores, (f) => f.metricaCompras)} texto={p.metricaCompras === null ? "—" : String(p.metricaCompras)} />
        <Medida nombre="CTR" valor={p.metricaCtr} maximo={10} referencia={refCtr} texto={p.metricaCtr === null ? "—" : porcentaje(p.metricaCtr)} />
        <Medida nombre="Hook rate" valor={p.metricaHookRate} maximo={80} referencia={refHook} texto={p.metricaHookRate === null ? "—" : porcentaje(p.metricaHookRate)} />
        <Medida nombre="CVR" valor={p.metricaCvr} maximo={20} referencia={refCvr} texto={p.metricaCvr === null ? "—" : porcentaje(p.metricaCvr)} />
        <p className="m-0 text-xs text-muted-foreground">La marca negra es el criterio (CPA) o el promedio de los winners (compras, CTR, Hook y CVR).</p>
      </Bloque>

      <Bloque titulo="Datos del test">
        <Fila etiqueta="Fecha del test">{p.fechaTest ? formatearFecha(p.fechaTest) : vacio}</Fila>
        <Fila etiqueta="Gasto">{p.metricaGasto === null ? vacio : usd(p.metricaGasto)}</Fila>
        <Fila etiqueta="CPM">{p.metricaCpm === null ? vacio : usd(p.metricaCpm)}</Fila>
        <Fila etiqueta="Precio de la oferta">{p.metricaOferta === null ? vacio : usd(p.metricaOferta)}</Fila>
        <Fila etiqueta="Efectividad">{p.metricaEfectividad === null ? vacio : porcentaje(p.metricaEfectividad)}</Fila>
      </Bloque>

      <Bloque titulo="Análisis">
        <Fila etiqueta="Fuente">{p.fuente || vacio}</Fila>
        <Fila etiqueta="Ángulo de venta">{p.anguloVenta || vacio}</Fila>
        <Fila etiqueta="Worldwide">{p.worldwide || vacio}</Fila>
        <Fila etiqueta="Explotación">{p.explotacion ? etiquetaExplotacion(p.explotacion) : vacio}</Fila>
        <Fila etiqueta="Revisado">{p.revisado ? `Sí${p.ultimaRevision ? `, ${formatearFecha(p.ultimaRevision)}` : ""}` : "No"}</Fila>
        <Fila etiqueta="Observación">{p.observacion || vacio}</Fila>
      </Bloque>

      {enlaces.length > 0 && (
        <Bloque titulo="Enlaces">
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
            {enlaces.map(([nombre, url]) => (
              <li key={nombre}>
                <a href={url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 rounded text-[13px] underline underline-offset-2 hover:text-foreground ${anilloFoco}`}>
                  <EnlaceIcon className="h-3.5 w-3.5" />
                  {nombre}
                </a>
              </li>
            ))}
          </ul>
        </Bloque>
      )}
    </aside>
  );
}
