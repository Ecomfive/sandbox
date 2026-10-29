"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Pastilla, Punto } from "@/components/panel/piezas-panel";
import { FASES, type AccesoCrm } from "@/lib/crm/areas";
import { formatearFecha } from "@/lib/formato";
import { MasIcon } from "@/lib/nav-icons";
import { ActividadDropshipper } from "../actividad-dropshipper";
import { SeguimientosDropshipper } from "../areas-ficha";
import { CuentasDropshipper } from "../cuentas-dropshipper";
import { etiquetaEstado, etiquetaNivel } from "../def-crm";
import { DesempenoDropshipper } from "../desempeno-dropshipper";
import { AccionesCrm, CasosAbiertos, CifrasDelMes, DatosDropshipper, tonoEstado } from "../ficha-lateral";
import { RecomendacionesDropshipper } from "../recomendaciones-dropshipper";
import { VentasDropiDropshipperBloque } from "../ventas-dropi-dropshipper";
import { ActividadDelClienteFicha } from "./actividad-cliente";
import { ActividadDelEquipoFicha } from "./actividad-equipo";
import type { FichaCrmChat } from "./actions";
import type { ConversacionVista, ResumenDropshipper } from "./datos-bandeja";
import { ProductosDelChatFicha } from "./productos-chat";
import { SugerenciasDeVinculo } from "./vincular-chat";

/** Las pestañas de la ficha del chat (29 oct 2026, aprobadas por Hernán sobre el bosquejo). */
const PESTANAS = [
  { id: "resumen", texto: "Resumen" },
  { id: "casos", texto: "Casos" },
  { id: "productos", texto: "Productos" },
  { id: "cuentas", texto: "Cuentas" },
  { id: "ventas", texto: "Ventas Dropi" },
  { id: "actividad", texto: "Actividad" },
] as const;
type Pestana = (typeof PESTANAS)[number]["id"];
/** Sin dropshipper vinculado no hay casos, cuentas ni ventas: solo lo que sale del chat. */
const PESTANAS_SIN_CRM: Pestana[] = ["resumen", "productos", "actividad"];

/** Un botón de la fila de acciones, del mismo tamaño que los del CRM (Nuevo caso, Pedido, Nota…). */
export const claseBotonFicha = `flex flex-col items-center gap-0.5 rounded-lg bg-accent px-1 py-2 text-[11.5px] font-medium hover:bg-accent-hover disabled:opacity-50 ${anilloFoco}`;
/** El principal de la fila (Tomar o Intervenir), en el verde del chat. */
export const claseBotonFichaPrincipal = `flex flex-col items-center gap-0.5 rounded-lg bg-[var(--wa-acento)] px-1 py-2 text-[11.5px] font-semibold text-[var(--wa-acento-texto)] hover:opacity-90 disabled:opacity-50 ${anilloFoco}`;

export interface OpcionMas {
  texto: string;
  alPulsar?: () => void;
  href?: string;
}

/** Un apartado de la ficha, separado del siguiente con la franja gris del chat. */
function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b-8 border-[var(--wa-panel)] px-5 py-4 last:border-b-0">
      <h3 className="m-0 text-[13px] font-normal text-[var(--wa-sec)]">{titulo}</h3>
      {children}
    </section>
  );
}

/** En qué fase va el dropshipper (Captado → En onboarding → Activo), como la línea de avance de un pedido. */
function LineaFase({ fase, ingreso }: { fase: string; ingreso: string | null }) {
  const actual = Math.max(0, FASES.findIndex((f) => f.valor === fase));
  return (
    <ol aria-label="Fase del dropshipper" className="m-0 flex list-none p-0">
      {FASES.map((f, i) => {
        const hecho = i < actual;
        const esActual = i === actual;
        return (
          <li key={f.valor} aria-current={esActual ? "step" : undefined} className="relative flex flex-1 flex-col items-center gap-1 text-center">
            {i > 0 && <span aria-hidden="true" className={`absolute top-[9px] right-1/2 left-[-50%] h-0.5 ${i <= actual ? "bg-[var(--wa-acento)]" : "bg-[var(--wa-borde)]"}`} />}
            <span
              aria-hidden="true"
              className={`relative z-[1] flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                hecho ? "border-[var(--wa-acento)] bg-[var(--wa-acento)] text-[var(--wa-acento-texto)]" : esActual ? "border-[var(--wa-acento)] bg-[var(--wa-fondo)]" : "border-[var(--wa-borde)] bg-[var(--wa-fondo)]"
              }`}
            >
              {hecho ? (
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 5 5L20 7" />
                </svg>
              ) : esActual ? (
                <span className="h-2 w-2 rounded-full bg-[var(--wa-acento)]" />
              ) : null}
            </span>
            <span className={`text-[12px] ${esActual ? "font-semibold" : i < actual ? "" : "text-[var(--wa-sec)]"}`}>{f.etiqueta}</span>
            {i === 0 && ingreso && <span className="text-[11px] text-[var(--wa-sec)] tabular-nums">{formatearFecha(ingreso)}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** «Más»: lo que no cabe en la fila de botones (pasar de área, importar, marcar borrado, abrir en el CRM…). */
function MenuMas({ opciones }: { opciones: OpcionMas[] }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (!caja.current?.contains(e.target as Node)) setAbierto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape cierra solo el menú, no la ventana del chat.
      e.stopPropagation();
      setAbierto(false);
    };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [abierto]);
  if (!opciones.length) return null;
  const claseItem = `rounded-md px-3 py-2 text-left text-[13.5px] hover:bg-[var(--wa-hover)] ${anilloFoco}`;
  return (
    <div ref={caja} className="relative flex">
      <button type="button" aria-haspopup="menu" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)} className={`${claseBotonFicha} w-full`}>
        <MasIcon className="h-4 w-4" />
        Más
      </button>
      {abierto && (
        <div role="menu" aria-label="Más acciones" className="absolute top-[calc(100%+6px)] right-0 z-20 flex w-64 flex-col rounded-[10px] border border-[var(--wa-borde)] bg-[var(--wa-fondo)] p-1.5 shadow-lg">
          {opciones.map((o) =>
            o.href ? (
              <Link key={o.texto} role="menuitem" href={o.href} className={claseItem} onClick={() => setAbierto(false)}>
                {o.texto}
              </Link>
            ) : (
              <button
                key={o.texto}
                type="button"
                role="menuitem"
                className={claseItem}
                onClick={() => {
                  setAbierto(false);
                  o.alPulsar?.();
                }}
              >
                {o.texto}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

/**
 * La ficha del dropshipper en la ventana del chat de la Bandeja (29 oct 2026, pedido de Hernán sobre su referencia): arriba sus pastillas,
 * la fase y una fila de botones (los del chat: Tomar, Marcar resuelta…; los del CRM: Nuevo caso, Pedido, Nota…; y «Más»), y debajo
 * pestañas con todo lo del CRM. Sin dropshipper vinculado, solo lo que sale del chat y cómo vincularlo.
 */
export function FichaDelChat({
  sel,
  dropshipper,
  ficha,
  alGuardarCrm,
  escribe,
  mirando,
  accionesChat,
  opcionesMas,
  areaDelChat,
  versionEquipo,
  alAbrirVincular,
  alVinculado,
  alAviso,
}: {
  sel: ConversacionVista;
  dropshipper: ResumenDropshipper | null;
  ficha: FichaCrmChat | "cargando" | "error" | null;
  alGuardarCrm: () => void;
  escribe: boolean;
  mirando: boolean;
  /** Los botones del chat que van primero en la fila (Tomar o Intervenir, Marcar resuelta). */
  accionesChat: ReactNode;
  opcionesMas: OpcionMas[];
  /** El apartado «Área del chat», que arma la Bandeja con los cambios de área. */
  areaDelChat: ReactNode;
  versionEquipo: string;
  alAbrirVincular: () => void;
  alVinculado: (mensaje: string) => void;
  alAviso: (texto: string) => void;
}) {
  const [pestana, setPestana] = useState<Pestana>("resumen");
  // Sube cuando algo del CRM se guarda, para volver a pedir la actividad, los seguimientos y las recomendaciones.
  const [version, setVersion] = useState(0);
  const datos = ficha && typeof ficha === "object" ? ficha : null;
  const d = datos?.d ?? null;
  const acceso: AccesoCrm | null = datos?.acceso ?? null;
  const visibles = dropshipper ? PESTANAS : PESTANAS.filter((p) => PESTANAS_SIN_CRM.includes(p.id));
  const actual: Pestana = visibles.some((p) => p.id === pestana) ? pestana : "resumen";
  const abiertos = datos ? datos.casos.filter((c) => c.dropshipperId === datos.d.id && c.estado !== "resuelto") : [];
  const guardado = () => {
    setVersion((v) => v + 1);
    alGuardarCrm();
  };
  const cargando = dropshipper && !datos && (
    <p className="m-0 px-5 py-4 text-[13px] text-[var(--wa-sec)]">{ficha === "error" ? "No se pudo cargar la ficha del CRM." : "Cargando la ficha del CRM…"}</p>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-col gap-3 border-b border-[var(--wa-borde)] px-5 pt-3.5 pb-4">
        {d && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Pastilla tono={tonoEstado(d.estado)}>{etiquetaEstado(d.estado)}</Pastilla>
            <Pastilla tono={d.nivel === "vip" ? "oscuro" : "neutro"}>{etiquetaNivel(d.nivel)}</Pastilla>
            {abiertos.length > 0 && (
              <Pastilla>
                <Punto />
                {abiertos.length} {abiertos.length === 1 ? "caso abierto" : "casos abiertos"}
              </Pastilla>
            )}
            <span className="text-[12.5px] text-[var(--wa-sec)]">
              {[d.paises.join(", "), d.tiendas.join(", "), d.responsable ? `Responsable: ${d.responsable}` : "Sin responsable"].filter(Boolean).join(" · ")}
            </span>
          </div>
        )}
        {d && <LineaFase fase={d.fase} ingreso={d.ingreso} />}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">
          {accionesChat}
          {d && acceso && <AccionesCrm d={d} codigoPais={datos!.codigoPais} acceso={acceso} alGuardar={guardado} />}
          <MenuMas opciones={opcionesMas} />
        </div>
      </div>

      <div role="tablist" aria-label="Ficha del dropshipper" className="sticky top-0 z-[2] flex gap-1 overflow-x-auto border-b border-[var(--wa-borde)] bg-[var(--wa-fondo)] px-3 [scrollbar-width:none]">
        {visibles.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            id={`ficha-chat-${p.id}`}
            aria-selected={actual === p.id}
            aria-controls="ficha-chat-panel"
            onClick={() => setPestana(p.id)}
            className={`-mb-px flex-none border-b-2 px-2.5 py-2.5 text-[13.5px] ${actual === p.id ? "border-[var(--wa-acento)] font-semibold text-[var(--wa-acento)]" : "border-transparent text-[var(--wa-sec)] hover:text-[var(--wa-texto)]"} ${anilloFoco}`}
          >
            {p.texto}
            {p.id === "casos" && abiertos.length > 0 && <span className="ml-1 tabular-nums">({abiertos.length})</span>}
          </button>
        ))}
      </div>

      <div id="ficha-chat-panel" role="tabpanel" aria-labelledby={`ficha-chat-${actual}`} className="flex flex-col">
        {actual === "resumen" && (
          <>
            {!dropshipper && !sel.dropshipperId && (
              <Seccion titulo="No está en el CRM">
                <SugerenciasDeVinculo conversacionId={sel.id} escribe={escribe} alAbrirBusqueda={alAbrirVincular} alListo={alVinculado} />
                <Link href={`/crm-dropshippers?buscar=${encodeURIComponent(sel.nombrePerfil ?? sel.nombre)}`} className={`text-[14px] font-medium text-[var(--wa-acento)] hover:underline ${anilloFoco}`}>
                  Buscarlo en el CRM
                </Link>
              </Seccion>
            )}
            <ActividadDelClienteFicha key={`actividad-${sel.id}`} conversacionId={sel.id} puedeAnalizar={escribe} />
            {cargando}
            {d && datos && acceso && (
              <>
                <Seccion titulo="Este mes">
                  <CifrasDelMes d={d} codigoPais={datos.codigoPais} hoy={datos.hoy} />
                </Seccion>
                <Seccion titulo="Datos">
                  <DatosDropshipper d={d} hoy={datos.hoy} acceso={acceso} />
                </Seccion>
              </>
            )}
          </>
        )}
        {actual === "casos" &&
          (cargando ||
            (datos && acceso && (
              <Seccion titulo="Casos abiertos">
                {abiertos.length ? (
                  <div className="px-3.5 py-2.5">
                    <CasosAbiertos abiertos={abiertos} acceso={acceso} />
                  </div>
                ) : (
                  <span className="text-[13px] text-[var(--wa-sec)]">Sin casos abiertos. Para abrir uno, usa «Nuevo caso».</span>
                )}
              </Seccion>
            )))}
        {actual === "productos" && (
          <>
            <ProductosDelChatFicha key={sel.id} conversacionId={sel.id} escribe={escribe && !mirando} alAviso={alAviso} />
            {d && acceso && (
              <Seccion titulo="Productos recomendados">
                <RecomendacionesDropshipper key={`recomendaciones-${d.id}`} dropshipperId={d.id} version={version} puedeEscribir={acceso.escribeAtencion} />
              </Seccion>
            )}
            {cargando}
          </>
        )}
        {actual === "cuentas" &&
          (cargando ||
            (d && datos && acceso && (
              <>
                <Seccion titulo="Cuentas">
                  <CuentasDropshipper key={`cuentas-${d.id}`} d={d} codigoPais={datos.codigoPais} puedeEscribir={acceso.escribeAtencion} />
                </Seccion>
                {dropshipper && (
                  <Seccion titulo="Dónde vende">
                    <div className="flex flex-wrap gap-1.5">
                      {[...dropshipper.tiendas, ...dropshipper.cuentas].map((t) => (
                        <span key={t} className="rounded-md bg-[var(--wa-panel)] px-2 py-0.5 text-[13px]">
                          {t}
                        </span>
                      ))}
                      {!dropshipper.tiendas.length && !dropshipper.cuentas.length && <span className="text-[13px] text-[var(--wa-sec)]">Sin tiendas ni cuentas vinculadas.</span>}
                    </div>
                  </Seccion>
                )}
              </>
            )))}
        {actual === "ventas" &&
          (cargando ||
            (d && (
              <>
                <Seccion titulo="Ventas en Dropi">
                  <VentasDropiDropshipperBloque key={`ventas-dropi-${d.id}`} dropshipperId={d.id} tieneCuentas={d.cuentas.length > 0} />
                </Seccion>
                <Seccion titulo="Desempeño en la plataforma">
                  <DesempenoDropshipper key={`desempeno-${d.id}`} dropshipperId={d.id} tieneCuentas={d.cuentas.length > 0} />
                </Seccion>
              </>
            )))}
        {actual === "actividad" && (
          <>
            <ActividadDelEquipoFicha key={`equipo-${sel.id}`} conversacionId={sel.id} version={versionEquipo} />
            {areaDelChat}
            {d && acceso && acceso.comercial && (
              <Seccion titulo="Seguimientos">
                <SeguimientosDropshipper key={`seguimientos-${d.id}`} dropshipperId={d.id} puedeEscribir={acceso.escribeComercial} version={version} />
              </Seccion>
            )}
            {d && acceso && (
              <Seccion titulo="Actividad en el CRM">
                {/* Como la de Compras (29 oct 2026): comentarios con archivos, @menciones y reacciones, y los cambios filtrados por área. */}
                <ActividadDropshipper key={`actividad-crm-${d.id}`} id={d.id} puedeComentar={acceso.escribeAtencion} version={version} />
              </Seccion>
            )}
            {cargando}
          </>
        )}
      </div>
    </div>
  );
}
