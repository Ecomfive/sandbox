"use client";

import Link from "next/link";
import { useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { DestinoEnSitio, EnSitio } from "@/components/ui/en-sitio";
import { anilloFoco } from "@/components/ui/field";
import { Pastilla, Punto } from "@/components/panel/piezas-panel";
import type { AccesoCrm } from "@/lib/crm/areas";
import type { BotonFicha } from "@/lib/crm/botones-ficha";
import { quienesAtienden, type QuienRespondio } from "@/lib/crm/respondieron";
import { DESDE_EL_CELULAR } from "@/lib/whatsapp/actividad-equipo";
import { formatearFecha } from "@/lib/formato";
import { Tooltip } from "@/components/ui/tooltip";
import { ActividadDropshipper } from "../actividad-dropshipper";
import { CON_NOMBRE, FilaBotones, ItemFila, usePosicionBoton } from "../botones-ficha";
import { CuentasDropshipper } from "../cuentas-dropshipper";
import { etiquetaEstado } from "../def-crm";
import { DesempenoDropshipper } from "../desempeno-dropshipper";
import { CasosAbiertos, DatosDropshipper, tonoEstado } from "../ficha-lateral";
import { PanelCaso, PanelRecomendar } from "../paneles-ficha";
import { AlertaIcon, SugerenciaIcon, TareasIcon } from "@/lib/nav-icons";
import { RecomendacionesDropshipper } from "../recomendaciones-dropshipper";
import { PastillaTipo, TipoCliente } from "../tipo-cliente";
import { VentasDropiDropshipperBloque } from "../ventas-dropi-dropshipper";
import { PastillaVendeEn } from "./vende-en";
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

/** Un botón con nombre de la barra de acciones, que va arriba del cuadro de escribir del chat (Resuelta, Tarea, Caso…). */
export const claseBotonFicha = `flex h-8 flex-none items-center gap-1.5 rounded-lg border border-[var(--wa-borde)] bg-[var(--wa-fondo)] px-2.5 text-[12.5px] font-medium whitespace-nowrap text-[var(--wa-texto)] hover:bg-[var(--wa-hover)] disabled:opacity-50 ${anilloFoco}`;
/** El principal de la barra (Tomar o Intervenir), en el verde del chat. */
export const claseBotonFichaPrincipal = `flex h-8 flex-none items-center gap-1.5 rounded-lg bg-[var(--wa-acento)] px-3 text-[12.5px] font-semibold whitespace-nowrap text-[var(--wa-acento-texto)] hover:opacity-90 disabled:opacity-50 ${anilloFoco}`;
/** Los que se usan menos van solo con su ícono (el globo y el `aria-label` dicen qué hacen). */
const claseBotonIcono = `flex h-8 w-8 flex-none items-center justify-center rounded-lg text-[var(--wa-sec)] hover:bg-[var(--wa-hover)] hover:text-[var(--wa-texto)] disabled:opacity-50 ${anilloFoco}`;
const claseBotonIconoPrincipal = `flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-[var(--wa-acento)] text-[var(--wa-acento-texto)] hover:opacity-90 disabled:opacity-50 ${anilloFoco}`;

/**
 * Un botón de la barra de acciones del chat, en su sitio según el uso (`ItemFila`, de Jhokser: los más usados a la derecha, junto a «Enviar»). Los
 * `CON_NOMBRE` más usados llevan su nombre; los demás, solo su ícono, con el globo y el `aria-label` (30 oct 2026, pedido de Alcides).
 */
export function BotonBarra({
  id,
  texto,
  corto,
  icono: Icono,
  alPulsar,
  principal,
  disabled,
}: {
  id: BotonFicha;
  texto: string;
  corto: string;
  icono: ComponentType<SVGProps<SVGSVGElement>>;
  alPulsar: () => void;
  principal?: boolean;
  disabled?: boolean;
}) {
  const posicion = usePosicionBoton(id);
  const conNombre = posicion === null || posicion < CON_NOMBRE;
  const clase = conNombre ? (principal ? claseBotonFichaPrincipal : claseBotonFicha) : principal ? claseBotonIconoPrincipal : claseBotonIcono;
  return (
    <ItemFila id={id}>
      <Tooltip texto={texto}>
        <button type="button" disabled={disabled} onClick={alPulsar} aria-label={conNombre ? undefined : texto} className={clase}>
          <Icono className={conNombre ? "h-4 w-4" : "h-[18px] w-[18px]"} aria-hidden="true" />
          {conNombre && corto}
        </button>
      </Tooltip>
    </ItemFila>
  );
}

/** Un botón más de la fila (pasar de área, importar, marcar borrado…): `corto` va en el botón y `texto` en el globo. */
export interface AccionExtra {
  /** Para ordenar el botón según su uso (`BOTONES_FICHA`). */
  id: BotonFicha;
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
 * Los demás botones del chat (no leído, pasar de área, importar, marcar borrado, vincular…), en la misma barra que los otros. Antes iban
 * dentro de un menú «Más»; desde el 29 oct 2026 (pedido de Alcides) se ven todos seguidos.
 */
function BotonesExtra({ acciones }: { acciones: AccionExtra[] }) {
  return (
    <>
      {acciones.map((a) => (
        <BotonBarra key={a.texto} id={a.id} texto={a.texto} corto={a.corto} icono={a.icono} alPulsar={a.alPulsar} />
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-normal text-[var(--wa-sec)]">
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
 * Lo del dropshipper que va en la barra del nombre del chat (30 oct 2026, pedido de Alcides, para dejar más espacio en la ficha): su tipo de cliente
 * (se cambia ahí mismo, con la flecha si subió o bajó), su estado, cuándo se captó y quién lo atiende.
 */
export function DatosEnLaCabecera({
  sel,
  ficha,
  respondieron,
  alGuardarCrm,
}: {
  sel: ConversacionVista;
  ficha: FichaCrmChat | "cargando" | "error" | null;
  respondieron: QuienRespondio[];
  alGuardarCrm: () => void;
}) {
  const datos = ficha && typeof ficha === "object" ? ficha : null;
  const d = datos?.d ?? null;
  const acceso = datos?.acceso ?? null;
  return (
    <>
      {d ? (
        <TipoCliente
          key={`tipo-${d.id}-${d.nivel}`}
          dropshipperId={d.id}
          nivel={d.nivel}
          manual={d.nivelManual}
          promedio={d.promedioPedidosMes}
          cambio={d.cambioTipo}
          puede={!!acceso && (acceso.escribeAtencion || acceso.escribeComercial)}
          alCambiar={alGuardarCrm}
        />
      ) : (
        sel.vip && <PastillaTipo nivel={sel.tipoCliente} soloDestacados />
      )}
      {d && <Pastilla tono={tonoEstado(d.estado)}>{etiquetaEstado(d.estado)}</Pastilla>}
      {d?.ingreso && <span className="text-xs font-normal whitespace-nowrap text-muted-foreground">Captado el {formatearFecha(d.ingreso)}</span>}
      {!sel.interno && <EquipoDelChat sel={sel} respondieron={respondieron} />}
    </>
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
  ranuraAcciones,
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
  /** El hueco arriba del cuadro de escribir del chat, donde se dibuja la barra de acciones (30 oct 2026, pedido de Alcides). */
  ranuraAcciones: HTMLElement | null;
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
        {/* Estado, tipo de cliente, «Captado el…» y quién lo atiende van en la barra del nombre (30 oct 2026, pedido de Alcides); las tiendas de ClickUp ya no se muestran. */}
        {abiertos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Pastilla>
              <Punto />
              {abiertos.length} {abiertos.length === 1 ? "caso abierto" : "casos abiertos"}
            </Pastilla>
          </div>
        )}
        {/* Los botones van abajo, en una barra arriba del cuadro de escribir, donde ya está el mouse al responder (30 oct 2026, pedido de Alcides). Siguen el
            orden de Jhokser (los más usados a la derecha, junto a «Enviar») y Tarea, Caso y Recomendar abren su formulario en el mismo lugar, justo encima de la
            barra, para poder copiar del chat y de la ficha. Los dibuja la ficha (portal) para que una tarea o un caso nuevo refresquen sus bloques. */}
        {ranuraAcciones &&
          createPortal(
            <EnSitio key={sel.id}>
              <div className="max-h-[50vh] overflow-y-auto px-3 pb-1.5 [&:has(>div:empty)]:hidden">
                <DestinoEnSitio />
              </div>
              <FilaBotones className="flex flex-wrap items-center gap-1.5 border-t border-[var(--wa-borde)] bg-[var(--wa-panel)] px-3 py-2">
                {accionesChat}
                {escribe && (
                  <BotonNuevaTarea
                    conversacionId={sel.id}
                    nombre={sel.nombre}
                    clase={claseBotonFicha}
                    alCreada={() => setVersionTareas((v) => v + 1)}
                    alAviso={alAviso}
                    boton={(abrir) => <BotonBarra id="tarea" texto="Nueva tarea" corto="Tarea" icono={TareasIcon} alPulsar={abrir} />}
                  />
                )}
                {d && acceso?.escribeAtencion && (
                  <>
                    <PanelCaso
                      key={`caso-${d.id}`}
                      d={d}
                      codigoPais={datos!.codigoPais}
                      alGuardar={guardado}
                      boton={(abrir) => <BotonBarra id="caso" texto="Abrir un caso nuevo" corto="Caso" icono={AlertaIcon} alPulsar={abrir} />}
                    />
                    <PanelRecomendar
                      key={`recomendar-${d.id}`}
                      d={d}
                      alGuardar={guardado}
                      boton={(abrir) => <BotonBarra id="recomendar" texto="Recomendar un producto" corto="Recomendar" icono={SugerenciaIcon} alPulsar={abrir} />}
                    />
                  </>
                )}
                <BotonesExtra acciones={accionesExtra} />
              </FilaBotones>
            </EnSitio>,
            ranuraAcciones,
          )}
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
                  // La plataforma con la bandera del país donde vende («🇵🇦 Dropi»), lo mismo que junto al nombre del chat; no las tiendas que vinieron de
                  // ClickUp (29 oct 2026, pedido de Alcides). Se edita con el lápiz de arriba.
                  <Seccion titulo="Dónde vende">
                    <div className="flex flex-wrap gap-1.5">
                      {sel.vendeEn.map((v) => (
                        <PastillaVendeEn key={`${v.plataforma}|${v.pais}`} v={v} />
                      ))}
                      {!sel.vendeEn.length && <span className="text-[13px] text-[var(--wa-sec)]">Sin plataformas. Agrégalas con el lápiz junto al nombre del chat.</span>}
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
