"use client";

import { useState, type ReactNode } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { anilloFoco } from "@/components/ui/field";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import {
  AlertaIcon,
  EnlaceIcon,
  EstadoIcon,
  FlechaAbajoIcon,
  FlechaArribaIcon,
  HistorialIcon,
  PersonaIcon,
} from "@/lib/nav-icons";
import { etiquetaFase, type AccesoCrm } from "@/lib/crm/areas";
import { BotonEscalar, LineaDeTiempo, PanelFase, PanelSeguimiento, SeguimientosDropshipper } from "./areas-ficha";
import { CuentasDropshipper } from "./cuentas-dropshipper";
import { DesempenoDropshipper } from "./desempeno-dropshipper";
import { PanelCaso, PanelEditar, PanelNota, PanelPedido } from "./paneles-ficha";
import {
  etiquetaAntiguedad,
  etiquetaCanal,
  etiquetaEstado,
  etiquetaEstadoCaso,
  etiquetaNivel,
  etiquetaTipoCaso,
  etiquetaUltimoPedido,
  montoCorto,
  type FilaCaso,
  type FilaDropshipper,
} from "./def-crm";
import { Etiqueta, Pastilla, Punto } from "@/components/panel/piezas-panel";

export const tonoEstado = (estado: string) => (estado === "activo" ? "exito" : estado === "prospecto" ? "aviso" : "neutro");

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Pedidos de los últimos seis meses; el mes en curso va en oscuro. */
function GraficaPedidos({ serie, hoy }: { serie: number[]; hoy: string }) {
  const mesActual = Number(hoy.slice(5, 7)) - 1;
  const maximo = Math.max(...serie, 1);
  return (
    <figure className="m-0">
      <div role="img" aria-label={`Pedidos de los últimos seis meses: ${serie.join(", ")}`} className="flex h-16 items-end gap-3">
        {serie.map((v, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end">
            <div className={`w-full rounded-[3px] ${i === serie.length - 1 ? "bg-foreground-soft" : "bg-accent"}`} style={{ height: `${Math.max(4, (v / maximo) * 100)}%` }} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-1 flex gap-3 text-[10px] text-muted-foreground">
        {serie.map((_, i) => (
          <span key={i} className="flex-1 text-center">
            {MESES_CORTOS[(mesActual - (serie.length - 1 - i) + 12) % 12]}
          </span>
        ))}
      </div>
    </figure>
  );
}

function Bloque({ icono: Icono, titulo, children }: { icono: typeof PersonaIcon; titulo: string; children: ReactNode }) {
  return (
    <section className="border-b border-border p-3.5 last:border-b-0">
      <h4 className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold tracking-[0.05em] text-muted-foreground uppercase">
        <Icono className="h-3.5 w-3.5" />
        {titulo}
      </h4>
      {children}
    </section>
  );
}

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

/**
 * Ficha de un dropshipper, fija a la derecha de la lista (en pantallas angostas, debajo): insignias, acciones,
 * desempeño, datos, casos abiertos, la conversación de WhatsApp (próximamente, con Chatwoot) y la actividad.
 * `orden` son los ids en el orden de la lista, para las flechas anterior y siguiente.
 */
export function FichaLateral({
  dropshipper,
  casos,
  orden,
  alIr,
  codigoPais,
  hoy,
  acceso,
}: {
  dropshipper: FilaDropshipper | null;
  casos: FilaCaso[];
  orden: string[];
  alIr: (id: string) => void;
  codigoPais: string;
  hoy: string;
  acceso: AccesoCrm;
}) {
  const d = dropshipper;
  // Sube cuando algo de la ficha se guarda, para que la actividad y los seguimientos se vuelvan a pedir.
  const [version, setVersion] = useState(0);
  const alGuardar = () => setVersion((v) => v + 1);
  if (!d) {
    return (
      <aside aria-label="Ficha del dropshipper" className="rounded-[10px] border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        Elige un dropshipper para ver su ficha.
      </aside>
    );
  }

  const posicion = orden.indexOf(d.id);
  const anterior = posicion > 0 ? orden[posicion - 1] : null;
  const siguiente = posicion >= 0 && posicion < orden.length - 1 ? orden[posicion + 1] : null;
  const abiertos = casos.filter((c) => c.dropshipperId === d.id && c.estado !== "resuelto");
  return (
    <aside aria-label={`Ficha de ${d.nombre}`} className="overflow-hidden rounded-[10px] border border-border bg-card min-[1100px]:sticky min-[1100px]:top-3 min-[1100px]:max-h-[calc(100vh-1.5rem)] min-[1100px]:overflow-y-auto">
      <div className="sticky top-0 z-[2] flex flex-col gap-2 border-b border-border bg-card p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="m-0 text-base font-semibold tracking-tight">{d.nombre}</h3>
            <p className="m-0 text-xs text-muted-foreground tabular-nums">
              {d.codigo}
              {d.tienda ? ` · ${d.tienda}` : ""}
            </p>
          </div>
          <div className="flex gap-1">
            <BotonNavegar texto="Dropshipper anterior" icono={FlechaArribaIcon} activo={!!anterior} alHacerClic={() => anterior && alIr(anterior)} />
            <BotonNavegar texto="Dropshipper siguiente" icono={FlechaAbajoIcon} activo={!!siguiente} alHacerClic={() => siguiente && alIr(siguiente)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Pastilla tono={tonoEstado(d.estado)}>{etiquetaEstado(d.estado)}</Pastilla>
          <Pastilla tono={d.nivel === "vip" ? "oscuro" : "neutro"}>{etiquetaNivel(d.nivel)}</Pastilla>
          {d.fase !== "activo" && <Pastilla tono="aviso">{etiquetaFase(d.fase)}</Pastilla>}
          {abiertos.length > 0 && (
            <Pastilla>
              <Punto />
              {abiertos.length} {abiertos.length === 1 ? "caso abierto" : "casos abiertos"}
            </Pastilla>
          )}
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(58px,1fr))] gap-1.5">
          {acceso.escribeAtencion && (
            <>
              <PanelCaso key={`caso-${d.id}`} d={d} codigoPais={codigoPais} alGuardar={alGuardar} />
              <PanelPedido key={`pedido-${d.id}`} d={d} codigoPais={codigoPais} alGuardar={alGuardar} />
              <PanelNota key={`nota-${d.id}`} d={d} acceso={acceso} alGuardar={alGuardar} />
              <PanelEditar key={`editar-${d.id}`} d={d} alGuardar={alGuardar} />
            </>
          )}
          {acceso.escribeComercial && (
            <>
              <PanelSeguimiento key={`seg-${d.id}`} d={d} alGuardar={alGuardar} />
              <PanelFase key={`fase-${d.id}`} d={d} alGuardar={alGuardar} />
            </>
          )}
          {d.telefono ? (
            <a
              href={`https://wa.me/${d.telefono.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex flex-col items-center gap-0.5 rounded-lg bg-accent px-1 py-2 text-[11.5px] font-medium hover:bg-accent-hover ${anilloFoco}`}
            >
              <EnlaceIcon className="h-4 w-4" />
              WhatsApp
            </a>
          ) : (
            <span aria-disabled="true" className="flex flex-col items-center gap-0.5 rounded-lg bg-accent px-1 py-2 text-[11.5px] font-medium opacity-40">
              <EnlaceIcon className="h-4 w-4" />
              WhatsApp
            </span>
          )}
        </div>
      </div>

      <Bloque icono={EstadoIcon} titulo="Desempeño">
        <div className="mb-3 grid grid-cols-3 gap-2">
          {[
            ["Pedidos mes", d.pedidosMes ? String(d.pedidosMes) : "—"],
            ["Ventas mes", d.ventasMes ? montoCorto(d.ventasMes, codigoPais) : "—"],
            ["Último pedido", etiquetaUltimoPedido(d.ultimoPedido, hoy)],
          ].map(([titulo, valor]) => (
            <div key={titulo} className="min-w-0 rounded-lg border border-border px-2.5 py-2">
              <p className="m-0 text-[11.5px] text-muted-foreground">{titulo}</p>
              <p className="m-0 truncate text-base font-semibold tabular-nums">{valor}</p>
            </div>
          ))}
        </div>
        {d.pedidosPorMes.length > 0 && d.pedidosMes > 0 ? (
          <GraficaPedidos serie={d.pedidosPorMes} hoy={hoy} />
        ) : (
          <p className="m-0 text-xs text-muted-foreground">Todavía no tiene pedidos registrados este mes.</p>
        )}
        {d.ventasMes > 0 && <p className="mt-2 mb-0 text-xs text-muted-foreground tabular-nums">Ventas exactas: {formatearMoneda(d.ventasMes, codigoPais)}</p>}
      </Bloque>

      <Bloque icono={PersonaIcon} titulo="Datos">
        <dl className="m-0 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-[13px]">
          {[
            ["Teléfono", <span key="t" className="tabular-nums">{d.telefono ?? "—"}</span>],
            ["Ciudad", d.ciudad ?? "—"],
            ["Ingreso", d.ingreso ? formatearFecha(d.ingreso) : "—"],
            ["Responsable", d.responsable ?? "Sin asignar"],
            ["Último pedido", etiquetaUltimoPedido(d.ultimoPedido, hoy)],
            ...(d.etapa ? [["Etapa", d.etapa]] : []),
            ...(d.productos.length ? [["Productos", d.productos.map((p) => <Etiqueta key={p}>{p}</Etiqueta>)]] : []),
            ["Etiquetas", d.etiquetas.length ? d.etiquetas.map((e) => <Etiqueta key={e}>{e}</Etiqueta>) : "—"],
            ...(d.email ? [["Correo", d.email]] : []),
            ...(d.notas ? [["Notas", d.notas]] : []),
          ].map(([titulo, valor]) => (
            <div key={String(titulo)} className="contents">
              <dt className="text-muted-foreground">{titulo}</dt>
              <dd className="m-0 min-w-0">{valor}</dd>
            </div>
          ))}
        </dl>
      </Bloque>

      {abiertos.length > 0 && (
        <Bloque icono={AlertaIcon} titulo="Casos abiertos">
          <ul className="-my-2.5 -mx-3.5 m-0 flex list-none flex-col p-0">
            {abiertos.map((c) => (
              <li key={c.id} className="flex items-start gap-2.5 border-b border-border px-3.5 py-2.5 last:border-b-0">
                <Punto tono={c.prioridad === "alta" ? "peligro" : "aviso"} className="mt-1.5" />
                <div className="min-w-0 flex-1">
                <p className="m-0 text-[13px] font-medium">{c.titulo}</p>
                  <p className="m-0 text-xs text-muted-foreground">
                    {etiquetaTipoCaso(c.tipo)} · {etiquetaEstadoCaso(c.estado)}
                    {c.numeroPedido ? ` · ${c.numeroPedido}` : ""} · {etiquetaCanal(c.canal)}
                  </p>
                </div>
                <div className="ml-auto flex flex-col items-end gap-1">
                  <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{etiquetaAntiguedad(c.horasAbierto)}</span>
                  {acceso.escribeAtencion && <BotonEscalar casoId={c.id} escalado={c.escalado} />}
                </div>
              </li>
            ))}
          </ul>
        </Bloque>
      )}

      <Bloque icono={EnlaceIcon} titulo="Cuentas">
        <CuentasDropshipper key={`cuentas-${d.id}`} d={d} codigoPais={codigoPais} puedeEscribir={acceso.escribeAtencion} />
      </Bloque>

      {acceso.comercial && (
        <Bloque icono={AlertaIcon} titulo="Seguimientos">
          <SeguimientosDropshipper key={`seguimientos-${d.id}`} dropshipperId={d.id} puedeEscribir={acceso.escribeComercial} version={version} />
        </Bloque>
      )}

      <Bloque icono={EstadoIcon} titulo="Desempeño en la plataforma">
        <DesempenoDropshipper key={`desempeno-${d.id}`} dropshipperId={d.id} tieneCuentas={d.cuentas.length > 0} />
      </Bloque>

      <Bloque icono={EnlaceIcon} titulo="Conversación">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>WhatsApp Business · vía Chatwoot</span>
          <Pastilla tono="aviso">Próximamente</Pastilla>
        </div>
        <p className="m-0 text-[13px] text-muted-foreground">Cuando se conecte Chatwoot, aquí aparecerá el historial de WhatsApp de este dropshipper.</p>
      </Bloque>

      <Bloque icono={HistorialIcon} titulo="Actividad">
        <LineaDeTiempo key={`linea-${d.id}`} dropshipperId={d.id} acceso={acceso} version={version} />
      </Bloque>
    </aside>
  );
}
