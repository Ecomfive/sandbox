"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition, type CSSProperties, type KeyboardEvent as EventoTecla, type PointerEvent as EventoPuntero } from "react";
import { NotasIcon } from "@/components/boton-notas-meta";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { DIAS_POSPUESTA, etiquetaCierre, MAX_NOTA, separarNotas, type CierreNota, type NotaMeta } from "@/lib/meta-ads/notas";
import { ajustarPosicion, EVENTO_ABRIR, EVENTO_ALTERNAR, guardarOculto, guardarPosicion, leerOculto, leerPosicion, POSICION_INICIAL, suscribirOculto, type OrigenNota, type Posicion } from "@/lib/meta-ads/notas-eventos";
import { cerrarNotaMeta, crearNotaMeta, listarNotasMeta } from "./notas-actions";

// Notas de Anuncios Meta (26 nov 2026, pedido de Hernán): un botón flotante pequeño con el ícono de notas, que se arrastra a donde no estorbe y se puede ocultar
// (vuelve con el ícono de notas de la barra de arriba). Al pulsarlo se abren las notas del país: escribir una nueva, y cerrar cada una con «Ya lo hice», «Dejar para después» o «No aplica».

const TAM = 44;
const ANCHO_PANEL = 360;
const boton = "min-h-8 cursor-pointer rounded-md border border-border-control bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground disabled:cursor-default disabled:opacity-50";

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-PA", { timeZone: "America/Panama", day: "2-digit", month: "2-digit" });

type Estado = { notas: NotaMeta[]; hoy: string; escribe: boolean; pais: string } | { error: string } | null;

export function NotasFlotantes() {
  const { mostrarToast } = useToast();
  // En el servidor (y al hidratar) se dibuja oculto; en el navegador, lo que se recuerda.
  const oculto = useSyncExternalStore(suscribirOculto, leerOculto, () => true);
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<Posicion>(() => (typeof window === "undefined" ? POSICION_INICIAL : ajustarPosicion(leerPosicion(), window.innerWidth, window.innerHeight, TAM)));
  const [estado, setEstado] = useState<Estado>(null);
  const [texto, setTexto] = useState("");
  const [origen, setOrigen] = useState<OrigenNota | null>(null);
  const [ocupada, empezar] = useTransition();
  const arrastre = useRef<{ x: number; y: number; inicio: Posicion; ultima: Posicion; movio: boolean } | null>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);

  const cargar = useCallback(() => {
    listarNotasMeta()
      .then(setEstado)
      .catch(() => setEstado({ error: "No se pudieron leer las notas." }));
  }, []);

  // Las notas, al entrar; y el botón sigue dentro de la ventana si cambia de tamaño.
  useEffect(() => {
    cargar();
    const alCambiarTamano = () => setPos((p) => ajustarPosicion(p, window.innerWidth, window.innerHeight, TAM));
    window.addEventListener("resize", alCambiarTamano);
    return () => window.removeEventListener("resize", alCambiarTamano);
  }, [cargar]);

  // «Anotar» en una sugerencia y el ícono de la barra de arriba.
  useEffect(() => {
    const abrir = (e: Event) => {
      const o = (e as CustomEvent<OrigenNota | undefined>).detail;
      if (leerOculto()) guardarOculto(false);
      if (o) setOrigen(o);
      setAbierto(true);
      cargar();
      setTimeout(() => campo.current?.focus(), 50);
    };
    const alternar = () => {
      if (leerOculto()) {
        guardarOculto(false);
        setAbierto(true);
        cargar();
      } else setAbierto((a) => !a);
    };
    window.addEventListener(EVENTO_ABRIR, abrir);
    window.addEventListener(EVENTO_ALTERNAR, alternar);
    return () => {
      window.removeEventListener(EVENTO_ABRIR, abrir);
      window.removeEventListener(EVENTO_ALTERNAR, alternar);
    };
  }, [cargar]);

  // Escape cierra las notas y devuelve el foco al botón.
  useEffect(() => {
    if (!abierto) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        botonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto]);

  const correr = (hacer: () => Promise<{ ok: true } | { error: string }>, mensaje: string, despues?: () => void) =>
    empezar(async () => {
      const r = await hacer().catch(() => ({ error: "No se pudo guardar. Intenta otra vez." }));
      if ("error" in r) return mostrarToast(r.error, "destructive");
      mostrarToast(mensaje);
      despues?.();
      cargar();
    });

  const ocultar = () => {
    guardarOculto(true);
    setAbierto(false);
    mostrarToast("Notas ocultas. Para volver a verlas, usa el ícono de notas de la barra de arriba.");
  };

  // Arrastrar: si el puntero se mueve más de 4 px es un arrastre (y no abre); si no, es un clic.
  const bajar = (e: EventoPuntero<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    arrastre.current = { x: e.clientX, y: e.clientY, inicio: pos, ultima: pos, movio: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const mover = (e: EventoPuntero<HTMLButtonElement>) => {
    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.x;
    const dy = e.clientY - a.y;
    if (!a.movio && Math.hypot(dx, dy) < 4) return;
    a.movio = true;
    a.ultima = ajustarPosicion({ derecha: a.inicio.derecha - dx, abajo: a.inicio.abajo - dy }, window.innerWidth, window.innerHeight, TAM);
    setPos(a.ultima);
  };
  const soltar = () => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a) return;
    if (a.movio) guardarPosicion(a.ultima);
    else setAbierto((x) => !x);
  };
  // Con el teclado: flechas mueven el botón 16 px (Mayús: 64).
  const teclaBoton = (e: EventoTecla<HTMLButtonElement>) => {
    const paso = e.shiftKey ? 64 : 16;
    const d = { ArrowLeft: [paso, 0], ArrowRight: [-paso, 0], ArrowUp: [0, paso], ArrowDown: [0, -paso] }[e.key];
    if (!d) return;
    e.preventDefault();
    const p = ajustarPosicion({ derecha: pos.derecha + d[0], abajo: pos.abajo + d[1] }, window.innerWidth, window.innerHeight, TAM);
    setPos(p);
    guardarPosicion(p);
  };

  if (oculto) return null;

  const datos = estado && "notas" in estado ? estado : null;
  const { abiertas, cerradas } = datos ? separarNotas(datos.notas, datos.hoy) : { abiertas: [], cerradas: [] };
  const escribe = datos?.escribe ?? false;

  // El panel se abre hacia el lado donde hay espacio: arriba del botón si está en la mitad de abajo, y hacia la izquierda si está a la derecha.
  const enLaMitadDeAbajo = typeof window !== "undefined" && pos.abajo < window.innerHeight / 2;
  const enLaDerecha = typeof window !== "undefined" && pos.derecha < window.innerWidth / 2;
  const estiloPanel: CSSProperties = {
    width: `min(${ANCHO_PANEL}px, calc(100vw - 16px))`,
    ...(enLaDerecha ? { right: Math.max(8, pos.derecha) } : { left: Math.max(8, (typeof window !== "undefined" ? window.innerWidth : 0) - pos.derecha - TAM) }),
    ...(enLaMitadDeAbajo ? { bottom: pos.abajo + TAM + 8, maxHeight: `calc(100vh - ${pos.abajo + TAM + 24}px)` } : { top: (typeof window !== "undefined" ? window.innerHeight : 0) - pos.abajo + 8, maxHeight: `calc(${pos.abajo}px - 24px)` }),
  };

  return (
    <div data-sin-imprimir>
      <button
        ref={botonRef}
        type="button"
        onPointerDown={bajar}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={() => (arrastre.current = null)}
        onKeyDown={teclaBoton}
        onClick={(e) => {
          // El clic con el ratón ya lo resolvió `soltar`; este es el de Enter o Espacio.
          if (e.detail === 0) setAbierto((x) => !x);
        }}
        aria-expanded={abierto}
        aria-controls="notas-meta-panel"
        aria-label={`Notas para futuras campañas${abiertas.length ? `, ${abiertas.length} abiertas` : ""}. Arrástralo (o usa las flechas) para moverlo.`}
        title="Notas · arrástralo para moverlo"
        style={{ right: pos.derecha, bottom: pos.abajo, width: TAM, height: TAM, touchAction: "none" }}
        className={`fixed z-40 inline-flex cursor-grab items-center justify-center rounded-full border border-primario/30 bg-primario text-white shadow-lg transition-transform hover:scale-105 active:cursor-grabbing motion-reduce:transition-none ${anilloFoco}`}
      >
        <NotasIcon className="h-5 w-5" />
        {abiertas.length > 0 && (
          <span aria-hidden="true" className="absolute -top-1 -right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full border-2 border-card bg-card px-1 text-[0.6rem] leading-none font-bold text-primario tabular-nums">
            {abiertas.length > 99 ? "99+" : abiertas.length}
          </span>
        )}
      </button>

      {abierto && (
        <section id="notas-meta-panel" role="dialog" aria-label="Notas para futuras campañas" style={estiloPanel} className="fixed z-40 flex flex-col overflow-hidden rounded-lg border border-border bg-card text-sm shadow-xl">
          <header className="flex items-center gap-2 border-b border-border bg-primario-suave px-3 py-2">
            <NotasIcon className="h-4 w-4 text-primario" />
            <h2 className="m-0 flex-1 text-sm font-semibold">
              Notas{datos ? <span className="font-normal text-muted-foreground"> · {datos.pais}</span> : null}
            </h2>
            <button type="button" onClick={ocultar} className={`rounded px-1.5 py-1 text-xs font-medium text-muted-foreground hover:bg-card hover:text-foreground ${anilloFoco}`}>
              Ocultar botón
            </button>
            <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar las notas" className={`inline-flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-card hover:text-foreground ${anilloFoco}`}>
              ×
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {estado && "error" in estado && (
              <p role="alert" className="m-0 text-xs font-semibold text-destructive">
                {estado.error}
              </p>
            )}
            {!estado && <p className="m-0 text-xs text-muted-foreground">Cargando…</p>}

            {escribe && (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (texto.trim()) correr(() => crearNotaMeta({ texto, origenClave: origen?.clave, origenTexto: origen?.texto }), "Nota guardada.", () => {
                    setTexto("");
                    setOrigen(null);
                  });
                }}
              >
                {origen && (
                  <p className="m-0 flex items-start gap-2 rounded-md bg-muted px-2.5 py-1.5 text-xs text-muted-foreground">
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-foreground">Sobre: </span>
                      {origen.texto}
                    </span>
                    <button type="button" onClick={() => setOrigen(null)} aria-label="Quitar la sugerencia de la nota" className={`shrink-0 rounded px-1 hover:text-foreground ${anilloFoco}`}>
                      ×
                    </button>
                  </p>
                )}
                <label className="sr-only" htmlFor="notas-meta-texto">
                  Nueva nota
                </label>
                <textarea
                  id="notas-meta-texto"
                  ref={campo}
                  rows={3}
                  maxLength={MAX_NOTA}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) e.currentTarget.form?.requestSubmit();
                  }}
                  placeholder="Lo que quieres rescatar para futuras campañas…"
                  className={`${fieldClassSm} h-auto min-h-[4.5rem] resize-y py-1.5`}
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">Ctrl + Enter para guardar</span>
                  <button type="submit" disabled={ocupada || !texto.trim()} className="min-h-8 cursor-pointer rounded-md bg-primario px-3 py-1 text-xs font-semibold text-white disabled:cursor-default disabled:opacity-50">
                    {ocupada ? "Guardando…" : "Guardar nota"}
                  </button>
                </div>
              </form>
            )}

            {datos && abiertas.length === 0 && <p className="m-0 text-xs text-muted-foreground">No hay notas abiertas.{escribe ? " Escribe arriba o pulsa «Anotar» en una sugerencia." : ""}</p>}

            {abiertas.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {abiertas.map((n) => (
                  <Nota key={n.id} n={n} escribe={escribe} ocupada={ocupada} cerrar={(estadoNuevo) => correr(() => cerrarNotaMeta(n.id, estadoNuevo), estadoNuevo === "hecha" ? "Nota hecha." : estadoNuevo === "pospuesta" ? `Vuelve en ${DIAS_POSPUESTA} días.` : "Nota descartada.")} />
                ))}
              </ul>
            )}

            {cerradas.length > 0 && (
              <details className="text-xs text-muted-foreground">
                <summary className={`min-h-8 cursor-pointer content-center font-medium ${anilloFoco}`}>
                  {cerradas.length === 1 ? "1 cerrada" : `${cerradas.length} cerradas`} (hechas, para después o que no aplican)
                </summary>
                <ul className="m-0 mt-1 flex list-none flex-col divide-y divide-border rounded-md border border-border p-0">
                  {cerradas.map((n) => (
                    <li key={n.id} className="flex flex-col gap-1 px-2.5 py-1.5">
                      <span className="break-words whitespace-pre-wrap text-foreground/80">{n.texto}</span>
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          {etiquetaCierre(n)}
                          {n.cerradoPorNombre ? ` · ${n.cerradoPorNombre}` : ""}
                        </span>
                        {escribe && (
                          <button type="button" disabled={ocupada} onClick={() => correr(() => cerrarNotaMeta(n.id, null), "La nota vuelve a estar abierta.")} className={`${boton} text-foreground`}>
                            Volver a abrir
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** Una nota abierta: el texto, de qué sugerencia salió, quién y cuándo, y los tres botones para cerrarla. */
function Nota({ n, escribe, ocupada, cerrar }: { n: NotaMeta; escribe: boolean; ocupada: boolean; cerrar: (estado: CierreNota) => void }) {
  return (
    <li className="flex flex-col gap-1.5 rounded-md border border-border px-2.5 py-2">
      <p className="m-0 break-words whitespace-pre-wrap">{n.texto}</p>
      {n.origenTexto && (
        <p className="m-0 border-l-2 border-primario/40 pl-2 text-xs text-muted-foreground">
          <span className="font-medium">Sobre:</span> {n.origenTexto}
        </p>
      )}
      <p className="m-0 text-[11px] text-muted-foreground">
        {n.creadoPorNombre ?? "Alguien"} · {fecha(n.creadoEn)}
      </p>
      {escribe && (
        <div role="group" aria-label="Cerrar la nota" className="flex flex-wrap gap-1.5">
          <button type="button" disabled={ocupada} onClick={() => cerrar("hecha")} className={boton}>
            Ya lo hice
          </button>
          <button type="button" disabled={ocupada} onClick={() => cerrar("pospuesta")} className={boton}>
            Dejar para después
          </button>
          <button type="button" disabled={ocupada} onClick={() => cerrar("descartada")} className={`${boton} text-muted-foreground`}>
            No aplica
          </button>
        </div>
      )}
    </li>
  );
}
