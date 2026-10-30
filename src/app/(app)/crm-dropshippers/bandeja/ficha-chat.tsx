"use client";

import Link from "next/link";
import { useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Pastilla, Punto } from "@/components/panel/piezas-panel";
import type { AccesoCrm } from "@/lib/crm/areas";
import { quienesAtienden, type QuienRespondio } from "@/lib/crm/respondieron";
import { DESDE_EL_CELULAR } from "@/lib/whatsapp/actividad-equipo";
import { formatearFecha } from "@/lib/formato";
import { Tooltip } from "@/components/ui/tooltip";
import { ActividadDropshipper } from "../actividad-dropshipper";
import { SeguimientosDropshipper } from "../areas-ficha";
import { CuentasDropshipper } from "../cuentas-dropshipper";
import { etiquetaEstado } from "../def-crm";
import { DesempenoDropshipper } from "../desempeno-dropshipper";
import { AccionesCrm, CasosAbiertos, DatosDropshipper, tonoEstado } from "../ficha-lateral";
import { RecomendacionesDropshipper } from "../recomendaciones-dropshipper";
import { TipoCliente } from "../tipo-cliente";
import { VentasDropiDropshipperBloque } from "../ventas-dropi-dropshipper";
import { ActividadDelClienteFicha } from "./actividad-cliente";
import { ActividadDelEquipoFicha } from "./actividad-equipo";
import type { FichaCrmChat } from "./actions";
import type { ConversacionVista, ResumenDropshipper } from "./datos-bandeja";
import { GloboCelular, GloboPersona } from "./globo-persona";
import { ProductosDelChatFicha } from "./productos-chat";
import { BotonNuevaTarea, TareasDelChat } from "./tareas-chat";
import { SugerenciasDeVinculo } from "./vincular-chat";

/**
 * Las partes de la ficha del chat (29 oct 2026, aprobadas por Hernán sobre el bosquejo). Desde el mismo día (pedido de Alcides) la ficha se ve
 * entera, una parte debajo de la otra, y la franja de arriba solo lleva a cada parte: no hay que abrir nada para ver los datos.
 */
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

/** Un número que cambia cuando cambia el texto: vuelve a pedir la Actividad (sin desmontarla, así no se pierde un comentario a medias) cuando algo del chat cambia. */
const huella = (t: string) => [...t].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1_000_003, 0);

/** Un botón de la fila de acciones, del mismo tamaño que los del CRM (Nuevo caso, Pedido, Nota…). */
export const claseBotonFicha = `flex flex-col items-center gap-0.5 rounded-lg bg-accent px-1 py-2 text-[11.5px] font-medium hover:bg-accent-hover disabled:opacity-50 ${anilloFoco}`;
/** El principal de la fila (Tomar o Intervenir), en el verde del chat. */
export const claseBotonFichaPrincipal = `flex flex-col items-center gap-0.5 rounded-lg bg-[var(--wa-acento)] px-1 py-2 text-[11.5px] font-semibold text-[var(--wa-acento-texto)] hover:opacity-90 disabled:opacity-50 ${anilloFoco}`;

/** Un botón más de la fila (pasar de área, importar, marcar borrado…): `corto` va en el botón y `texto` en el globo. */
export interface AccionExtra {
  texto: string;
  corto: string;
  icono: ComponentType<SVGProps<SVGSVGElement>>;
  alPulsar: () => void;
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


/**
 * Los demás botones del chat (no leído, pasar de área, importar, marcar borrado, vincular…), en la misma fila que los otros. Antes iban
 * dentro de un menú «Más»; desde el 29 oct 2026 (pedido de Alcides) se ven todos seguidos.
 */
function BotonesExtra({ acciones }: { acciones: AccionExtra[] }) {
  return (
    <>
      {acciones.map(({ texto, corto, icono: Icono, alPulsar }) => (
        <Tooltip key={texto} texto={texto}>
          <button type="button" onClick={alPulsar} className={`${claseBotonFicha} w-full`}>
            <Icono className="h-4 w-4" aria-hidden="true" />
            <span className="leading-tight">{corto}</span>
          </button>
        </Tooltip>
      ))}
    </>
  );
}

/**
 * Quién respondió en el chat, con su cargo (pedido de Hernán, 29 oct 2026: «si líder comercial o atención»; el cargo es su puesto en Puestos o su
 * área), debajo del responsable del CRM: así se ve de un vistazo si al dropshipper lo atendió Atención, su líder comercial o los dos.
 */
/**
 * Quién atiende el chat y quién le ha respondido, como globitos con su foto (29 oct 2026, pedido de Alcides): al pasar el cursor, su nombre y su
 * cargo. «Lo atiende»: la persona del área del chat y, si alguien intervino o lo tomó, también esa persona. Lo respondido desde el celular va con
 * un globito de celular.
 */
function EquipoDelChat({ sel, respondieron }: { sel: ConversacionVista; respondieron: QuienRespondio[] }) {
  const asignada = sel.asignadaA ? { nombre: sel.asignadaA, cargo: sel.asignadaCargo, foto: sel.asignadaFoto } : null;
  const atienden = quienesAtienden(asignada, respondieron, sel.area, DESDE_EL_CELULAR);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-[var(--wa-sec)]">
      <span className="flex items-center gap-1.5">
        <span>Lo atiende</span>
        {atienden.length ? (
          <span className="flex -space-x-1.5">
            {atienden.map((p) => (
              <GloboPersona key={p.nombre} nombre={p.nombre} cargo={p.cargo} foto={p.foto} prefijo={p.nombre === sel.asignadaA ? "Lo lleva" : undefined} />
            ))}
          </span>
        ) : (
          <span className="text-[var(--wa-texto)]">nadie todavía</span>
        )}
      </span>
      {respondieron.length > 0 && (
        <span className="flex items-center gap-1.5">
          <span>Respondieron</span>
          <span className="flex -space-x-1.5">
            {respondieron.map((r) => (r.nombre === DESDE_EL_CELULAR ? <GloboCelular key={r.nombre} /> : <GloboPersona key={r.nombre} nombre={r.nombre} cargo={r.cargo} foto={r.foto ?? null} />))}
          </span>
        </span>
      )}
    </div>
  );
}

/**
 * La ficha del dropshipper en la ventana del chat de la Bandeja (29 oct 2026, pedido de Hernán sobre su referencia): arriba sus pastillas,
 * la fase y una fila de botones (los del chat: Tomar, Marcar resuelta…; los del CRM: Nuevo caso, Pedido, Nota…; y los demás del chat), y debajo
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
  etiquetas,
  accionesExtra,
  respondieron,
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
  /** Las etiquetas del chat (como en ClickUp), arriba de todo. */
  etiquetas: ReactNode;
  accionesExtra: AccionExtra[];
  /** Quién del equipo le escribió al dropshipper en este chat y con qué cargo (su puesto o su área; la más reciente primero). */
  respondieron: QuienRespondio[];
  versionEquipo: string;
  alAbrirVincular: () => void;
  alVinculado: (mensaje: string) => void;
  alAviso: (texto: string, error?: boolean) => void;
}) {
  const [pestana, setPestana] = useState<Pestana>("resumen");
  const irA = (id: Pestana) => {
    setPestana(id);
    const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`ficha-chat-${id}`)?.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
  };
  // Sube cuando algo del CRM se guarda, para volver a pedir la actividad, los seguimientos y las recomendaciones.
  const [version, setVersion] = useState(0);
  // Sube cuando se crea una tarea (con «Tarea» o «Avisarme cuando llegue»), para volver a pedir las del chat.
  const [versionTareas, setVersionTareas] = useState(0);
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
        {etiquetas}
        {d && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Pastilla tono={tonoEstado(d.estado)}>{etiquetaEstado(d.estado)}</Pastilla>
            <TipoCliente key={`tipo-${d.id}`} dropshipperId={d.id} nivel={d.nivel} manual={d.nivelManual} promedio={d.promedioPedidosMes} puede={!!acceso && (acceso.escribeAtencion || acceso.escribeComercial)} alCambiar={guardado} />
            {abiertos.length > 0 && (
              <Pastilla>
                <Punto />
                {abiertos.length} {abiertos.length === 1 ? "caso abierto" : "casos abiertos"}
              </Pastilla>
            )}
            <span className="text-[12.5px] text-[var(--wa-sec)]">
              {[d.paises.join(", "), d.tiendas.join(", "), d.ingreso ? `Captado el ${formatearFecha(d.ingreso)}` : null].filter(Boolean).join(" · ")}
            </span>
          </div>
        )}
        <EquipoDelChat sel={sel} respondieron={respondieron} />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-1.5">
          {accionesChat}
          {escribe && <BotonNuevaTarea conversacionId={sel.id} nombre={sel.nombre} clase={claseBotonFicha} alCreada={() => setVersionTareas((v) => v + 1)} alAviso={alAviso} />}
          {d && acceso && <AccionesCrm d={d} codigoPais={datos!.codigoPais} acceso={acceso} alGuardar={guardado} />}
          <BotonesExtra acciones={accionesExtra} />
        </div>
      </div>

      <nav aria-label="Ir a una parte de la ficha" className="sticky top-0 z-[2] flex gap-1 overflow-x-auto border-b border-[var(--wa-borde)] bg-[var(--wa-fondo)] px-3 [scrollbar-width:none]">
        {visibles.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-current={actual === p.id ? "true" : undefined}
            onClick={() => irA(p.id)}
            className={`-mb-px flex-none border-b-2 px-2.5 py-2.5 text-[13.5px] ${actual === p.id ? "border-[var(--wa-acento)] font-semibold text-[var(--wa-acento)]" : "border-transparent text-[var(--wa-sec)] hover:text-[var(--wa-texto)]"} ${anilloFoco}`}
          >
            {p.texto}
            {p.id === "casos" && abiertos.length > 0 && <span className="ml-1 tabular-nums">({abiertos.length})</span>}
          </button>
        ))}
      </nav>

      <div className="flex flex-col">
        {visibles.some((p) => p.id === "resumen") && (
          <div id="ficha-chat-resumen" className="scroll-mt-12">
            {!dropshipper && !sel.dropshipperId && (
              <Seccion titulo="No está en el CRM">
                <SugerenciasDeVinculo conversacionId={sel.id} escribe={escribe} alAbrirBusqueda={alAbrirVincular} alListo={alVinculado} />
                <Link href={`/crm-dropshippers?buscar=${encodeURIComponent(sel.nombrePerfil ?? sel.nombre)}`} className={`text-[14px] font-medium text-[var(--wa-acento)] hover:underline ${anilloFoco}`}>
                  Buscarlo en el CRM
                </Link>
              </Seccion>
            )}
            <TareasDelChat key={`tareas-${sel.id}`} conversacionId={sel.id} version={versionTareas} alAviso={alAviso} />
            <ActividadDelClienteFicha key={`actividad-${sel.id}`} conversacionId={sel.id} puedeAnalizar={escribe} />
            {cargando}
            {d && datos && acceso && (
              <>
                <Seccion titulo="Datos">
                  <DatosDropshipper d={d} hoy={datos.hoy} acceso={acceso} conEtiquetas={false} />
                </Seccion>
              </>
            )}
          </div>
        )}
        {visibles.some((p) => p.id === "casos") && (
          <div id="ficha-chat-casos" className="scroll-mt-12">
            {
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
            ))}
          </div>
        )}
        {visibles.some((p) => p.id === "productos") && (
          <div id="ficha-chat-productos" className="scroll-mt-12">
            <ProductosDelChatFicha key={sel.id} conversacionId={sel.id} escribe={escribe && !mirando} puedeAvisar={escribe} alAviso={alAviso} alCambio={() => setVersionTareas((v) => v + 1)} />
            {d && acceso && (
              <Seccion titulo="Productos recomendados">
                <RecomendacionesDropshipper key={`recomendaciones-${d.id}`} dropshipperId={d.id} version={version} puedeEscribir={acceso.escribeAtencion} />
              </Seccion>
            )}
          </div>
        )}
        {visibles.some((p) => p.id === "cuentas") && (
          <div id="ficha-chat-cuentas" className="scroll-mt-12">
            {
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
            ))}
          </div>
        )}
        {visibles.some((p) => p.id === "ventas") && (
          <div id="ficha-chat-ventas" className="scroll-mt-12">
            {
            (d && (
              <>
                <Seccion titulo="Ventas en Dropi">
                  <VentasDropiDropshipperBloque key={`ventas-dropi-${d.id}`} dropshipperId={d.id} tieneCuentas={d.cuentas.length > 0} />
                </Seccion>
                <Seccion titulo="Desempeño en la plataforma">
                  <DesempenoDropshipper key={`desempeno-${d.id}`} dropshipperId={d.id} tieneCuentas={d.cuentas.length > 0} />
                </Seccion>
              </>
            ))}
          </div>
        )}
        {visibles.some((p) => p.id === "actividad") && (
          <div id="ficha-chat-actividad" className="scroll-mt-12">
            {/* Una sola Actividad (29 oct 2026, pedido de Alcides): con dropshipper, la del CRM ya trae lo que el equipo hizo en sus chats; sin él, la del chat. */}
            {!sel.dropshipperId && <ActividadDelEquipoFicha key={`equipo-${sel.id}`} conversacionId={sel.id} version={versionEquipo} />}
            {d && acceso && acceso.comercial && (
              <Seccion titulo="Seguimientos">
                <SeguimientosDropshipper key={`seguimientos-${d.id}`} dropshipperId={d.id} puedeEscribir={acceso.escribeComercial} version={version} />
              </Seccion>
            )}
            {d && acceso && (
              // La misma Actividad de Compras y Gestión de IDs (comentarios, emojis, archivos y quién hizo qué), con su propio encabezado y los
              // colores del sistema, no los del chat.
              <div className="bg-background text-foreground">
                <ActividadDropshipper key={`actividad-crm-${d.id}`} id={d.id} puedeComentar={acceso.escribeAtencion} version={version * 1_000_003 + huella(versionEquipo)} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
