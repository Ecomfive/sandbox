"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { anilloFoco } from "@/components/ui/field";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import {
  AlertaIcon,
  ChatIcon,
  EnlaceIcon,
  EstadoIcon,
  FlechaAbajoIcon,
  FlechaArribaIcon,
  HistorialIcon,
  PersonaIcon,
  SugerenciaIcon,
} from "@/lib/nav-icons";
import { etiquetaFase, type AccesoCrm } from "@/lib/crm/areas";
import { ActividadDropshipper } from "./actividad-dropshipper";
import { BotonEscalar, PanelFase, PanelSeguimiento, SeguimientosDropshipper } from "./areas-ficha";
import { MostrarTelefono } from "./mostrar-telefono";
import { CuentasDropshipper } from "./cuentas-dropshipper";
import { DesempenoDropshipper } from "./desempeno-dropshipper";
import { VentasDropiDropshipperBloque } from "./ventas-dropi-dropshipper";
import { PanelCaso, PanelEditar, PanelNota, PanelPedido, PanelRecomendar } from "./paneles-ficha";
import { RecomendacionesDropshipper } from "./recomendaciones-dropshipper";
import { ConversacionWhatsapp } from "./conversacion-whatsapp";
import { EtiquetasDropshipper } from "./etiquetas-dropshipper";
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

export function Bloque({ icono: Icono, titulo, children }: { icono: typeof PersonaIcon; titulo: string; children: ReactNode }) {
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

export function BotonNavegar({ texto, icono: Icono, activo, alHacerClic }: { texto: string; icono: typeof FlechaArribaIcon; activo: boolean; alHacerClic: () => void }) {
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
 * Lo de adentro de la ficha de un dropshipper (insignias, acciones y todos sus bloques), igual en la ficha que se abre desde la lista
 * (`FichaDropshipper`, una ventana como las de Gestión de IDs Dropi) y en la ficha fija del Ranking (`FichaLateral`).
 */
export function ContenidoFichaDropshipper({ d, casos, codigoPais, hoy, acceso }: { d: FilaDropshipper; casos: FilaCaso[]; codigoPais: string; hoy: string; acceso: AccesoCrm }) {
  // Sube cuando algo de la ficha se guarda, para que la actividad y los seguimientos se vuelvan a pedir.
  const [version, setVersion] = useState(0);
  const alGuardar = () => setVersion((v) => v + 1);
  const abiertos = casos.filter((c) => c.dropshipperId === d.id && c.estado !== "resuelto");
  return (
    <>
      <div className="flex flex-col gap-2 border-b border-border p-3.5">
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
          {d.whatsapp?.sinResponder && (
            <Pastilla tono="peligro">
              <Punto tono="peligro" />
              WhatsApp sin responder
            </Pastilla>
          )}
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(58px,1fr))] gap-1.5">
          {d.whatsapp ? (
            <Link
              href={`/crm-dropshippers/bandeja?abrir=${d.whatsapp.conversacionId}`}
              className={`flex flex-col items-center gap-0.5 rounded-lg bg-primario px-1 py-2 text-[11.5px] font-medium text-white hover:opacity-90 ${anilloFoco}`}
            >
              <ChatIcon className="h-4 w-4" />
              WhatsApp
            </Link>
          ) : (
            <span aria-disabled="true" className="flex flex-col items-center gap-0.5 rounded-lg bg-accent px-1 py-2 text-[11.5px] font-medium opacity-40">
              <ChatIcon className="h-4 w-4" />
              WhatsApp
            </span>
          )}
          <AccionesCrm d={d} codigoPais={codigoPais} acceso={acceso} alGuardar={alGuardar} />
        </div>
      </div>

      <Bloque icono={ChatIcon} titulo="Conversación de WhatsApp">
        <ConversacionWhatsapp key={`chat-${d.id}`} dropshipperId={d.id} />
      </Bloque>

      <Bloque icono={EstadoIcon} titulo="Desempeño">
        <CifrasDelMes d={d} codigoPais={codigoPais} hoy={hoy} />
      </Bloque>

      {abiertos.length > 0 && (
        <Bloque icono={AlertaIcon} titulo="Casos abiertos">
          <CasosAbiertos abiertos={abiertos} acceso={acceso} />
        </Bloque>
      )}

      <Bloque icono={PersonaIcon} titulo="Datos">
        <DatosDropshipper d={d} hoy={hoy} acceso={acceso} />
      </Bloque>

      <Bloque icono={SugerenciaIcon} titulo="Productos recomendados">
        <RecomendacionesDropshipper key={`recomendaciones-${d.id}`} dropshipperId={d.id} version={version} puedeEscribir={acceso.escribeAtencion} />
      </Bloque>

      <Bloque icono={EnlaceIcon} titulo="Cuentas">
        <CuentasDropshipper key={`cuentas-${d.id}`} d={d} codigoPais={codigoPais} puedeEscribir={acceso.escribeAtencion} />
      </Bloque>

      {acceso.comercial && (
        <Bloque icono={AlertaIcon} titulo="Seguimientos">
          <SeguimientosDropshipper key={`seguimientos-${d.id}`} dropshipperId={d.id} puedeEscribir={acceso.escribeComercial} version={version} />
        </Bloque>
      )}

      <Bloque icono={EstadoIcon} titulo="Ventas en Dropi">
        <VentasDropiDropshipperBloque key={`ventas-dropi-${d.id}`} dropshipperId={d.id} tieneCuentas={d.cuentas.length > 0} />
      </Bloque>

      <Bloque icono={EstadoIcon} titulo="Desempeño en la plataforma">
        <DesempenoDropshipper key={`desempeno-${d.id}`} dropshipperId={d.id} tieneCuentas={d.cuentas.length > 0} />
      </Bloque>

      <Bloque icono={HistorialIcon} titulo="Actividad">
        {/* Como la de Compras (29 oct 2026): comentarios con archivos, @menciones y reacciones, y los cambios filtrados por área. */}
        <ActividadDropshipper key={`actividad-${d.id}`} id={d.id} puedeComentar={acceso.escribeAtencion} version={version} />
      </Bloque>
    </>
  );
}

/** Los botones de la ficha que abren una ventana del CRM (caso, pedido, nota, recomendar, editar; seguimiento y fase en Comercial). */
export function AccionesCrm({ d, codigoPais, acceso, alGuardar }: { d: FilaDropshipper; codigoPais: string; acceso: AccesoCrm; alGuardar: () => void }) {
  return (
    <>
      {acceso.escribeAtencion && (
        <>
          <PanelCaso key={`caso-${d.id}`} d={d} codigoPais={codigoPais} alGuardar={alGuardar} />
          <PanelPedido key={`pedido-${d.id}`} d={d} codigoPais={codigoPais} alGuardar={alGuardar} />
          <PanelNota key={`nota-${d.id}`} d={d} acceso={acceso} alGuardar={alGuardar} />
          <PanelRecomendar key={`recomendar-${d.id}`} d={d} alGuardar={alGuardar} />
          <PanelEditar key={`editar-${d.id}`} d={d} alGuardar={alGuardar} />
        </>
      )}
      {acceso.escribeComercial && (
        <>
          <PanelSeguimiento key={`seg-${d.id}`} d={d} alGuardar={alGuardar} />
          <PanelFase key={`fase-${d.id}`} d={d} alGuardar={alGuardar} />
        </>
      )}
    </>
  );
}

/** Pedidos y ventas del mes, el último pedido y la gráfica de seis meses. */
export function CifrasDelMes({ d, codigoPais, hoy }: { d: FilaDropshipper; codigoPais: string; hoy: string }) {
  return (
    <>
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
    </>
  );
}

/** Los casos abiertos del dropshipper, con «Escalar» para quien escribe en Atención. */
export function CasosAbiertos({ abiertos, acceso }: { abiertos: FilaCaso[]; acceso: AccesoCrm }) {
  return (
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
  );
}

/**
 * Sus datos: teléfono (con «Mostrar número»), ciudad, ingreso, responsable, etiquetas (editables, como en ClickUp)… En la ficha del chat
 * `conEtiquetas` va en falso: ahí las mismas etiquetas se editan arriba de todo.
 */
export function DatosDropshipper({ d, hoy, acceso, conEtiquetas = true }: { d: FilaDropshipper; hoy: string; acceso: AccesoCrm; conEtiquetas?: boolean }) {
  return (
    <dl className="m-0 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-[13px]">
      {[
        ...(d.tieneTelefono && acceso.verTelefonos ? [["Teléfono", <MostrarTelefono key="t" tipo="dropshipper" id={d.id} puede />]] : []),
        ["Ciudad", d.ciudad ?? "—"],
        ["Ingreso", d.ingreso ? formatearFecha(d.ingreso) : "—"],
        ["Responsable", d.responsable ?? "Sin asignar"],
        ["Último pedido", etiquetaUltimoPedido(d.ultimoPedido, hoy)],
        ...(d.etapa ? [["Etapa", d.etapa]] : []),
        ...(d.productos.length ? [["Productos", d.productos.map((p) => <Etiqueta key={p}>{p}</Etiqueta>)]] : []),
        ...(conEtiquetas ? [["Etiquetas", <EtiquetasDropshipper key={`etiquetas-${d.id}`} dropshipperId={d.id} iniciales={d.etiquetas} puedeEscribir={acceso.escribeAtencion} />]] : []),
        ...(d.email ? [["Correo", d.email]] : []),
        ...(d.notas ? [["Notas", d.notas]] : []),
      ].map(([titulo, valor]) => (
        <div key={String(titulo)} className="contents">
          <dt className="text-muted-foreground">{titulo}</dt>
          <dd className="m-0 min-w-0">{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Ficha de un dropshipper, fija a la derecha de la lista (en pantallas angostas, debajo), en el Ranking: su nombre con las flechas
 * anterior y siguiente, y debajo el mismo contenido que la ficha de la lista. `orden` son los ids en el orden de la lista.
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
  return (
    <aside aria-label={`Ficha de ${d.nombre}`} className="overflow-hidden rounded-[10px] border border-border bg-card min-[1100px]:sticky min-[1100px]:top-3 min-[1100px]:max-h-[calc(100vh-1.5rem)] min-[1100px]:overflow-y-auto">
      <div className="sticky top-0 z-[2] flex items-start justify-between gap-2 border-b border-border bg-card p-3.5">
        <div className="min-w-0">
          <h3 className="m-0 text-base font-semibold tracking-tight">{d.nombre}</h3>
          <p className="m-0 text-xs text-muted-foreground tabular-nums">
            {d.codigo}
            {d.tiendas.length ? ` · ${d.tiendas.join(", ")}` : ""}
          </p>
        </div>
        <div className="flex gap-1">
          <BotonNavegar texto="Dropshipper anterior" icono={FlechaArribaIcon} activo={!!anterior} alHacerClic={() => anterior && alIr(anterior)} />
          <BotonNavegar texto="Dropshipper siguiente" icono={FlechaAbajoIcon} activo={!!siguiente} alHacerClic={() => siguiente && alIr(siguiente)} />
        </div>
      </div>
      <ContenidoFichaDropshipper key={d.id} d={d} casos={casos} codigoPais={codigoPais} hoy={hoy} acceso={acceso} />
    </aside>
  );
}
