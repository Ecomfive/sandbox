"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { ActualizarIcon, CheckIcon, EnlaceIcon, PapeleraIcon, VistasIcon } from "@/lib/nav-icons";
import type { DefTabla } from "@/lib/tabla/motor";
import {
  MAX_NOMBRE,
  MAX_VISTAS,
  decodificarEstado,
  eliminarVista,
  enlaceDeVista,
  estadoPorDefecto,
  guardarVista,
  mismoEstado,
  parametroVista,
  vistaActiva,
  type EstadoTabla,
} from "@/lib/tabla/vistas";
import { useVistasGuardadas } from "./vistas-guardadas";

const ANCHO_MENU = 288; // w-72
// Falso en el servidor y al hidratar; verdadero desde el primer render con lo guardado ya leído del navegador.
const sinSuscripcion = () => () => {};
const opcion = "flex min-h-9 w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm hover:bg-muted";

/**
 * Menú «Vistas»: guarda con nombre lo que se ve (filtros, agrupación, cerrados y columnas), lo aplica de
 * nuevo con un toque, copia un enlace para pasarle esa vista a otra persona y restablece la tabla. Las
 * vistas guardadas son de cada persona (viven en su navegador). Al abrir un enlace con una vista, la aplica
 * y guarda la vista que se tenía como «Antes del enlace».
 */
export function MenuVistas<F>({
  def,
  estado,
  idsColumnas,
  aplicar,
}: {
  def: DefTabla<F>;
  /** Lo que se ve ahora. */
  estado: EstadoTabla;
  /** Las columnas de la tabla en su orden de fábrica; null si la tabla no tiene menú de columnas. */
  idsColumnas: string[] | null;
  aplicar: (estado: EstadoTabla) => void;
}) {
  const [vistas, guardarVistas] = useVistasGuardadas(def);
  const { mostrarToast } = useToast();
  const [abierto, setAbierto] = useState(false);
  const [alineadoADerecha, setAlineadoADerecha] = useState(false);
  const [nombre, setNombre] = useState("");
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const idMenu = useId();
  const idNombre = useId();
  const contenedorRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);
  // El enlace se aplica una sola vez, aunque el efecto corra dos veces (modo de desarrollo).
  const enlaceAplicado = useRef(false);
  const hidratado = useSyncExternalStore(sinSuscripcion, () => true, () => false);

  const activa = vistaActiva(vistas, estado);
  const porDefecto = estadoPorDefecto(def, idsColumnas);
  const existente = vistas.find((v) => v.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());

  // Abrir un enlace con una vista: se aplica, se guarda lo que se tenía y se limpia la dirección.
  useEffect(() => {
    // Hasta hidratar, lo que se ve es la vista de fábrica: comparar entonces guardaría mal «lo que tenías».
    if (!hidratado || enlaceAplicado.current) return;
    const parametro = parametroVista(def.clave);
    const url = new URL(window.location.href);
    const codigo = url.searchParams.get(parametro);
    if (codigo === null) return;
    enlaceAplicado.current = true;
    url.searchParams.delete(parametro);
    window.history.replaceState(window.history.state, "", url.toString());

    const recibido = decodificarEstado(def, codigo);
    if (!recibido) {
      mostrarToast("El enlace de la vista no es válido o está cortado.", "destructive");
      return;
    }
    const cambia = !mismoEstado(recibido, estado);
    const hayQueGuardar = cambia && !mismoEstado(porDefecto, estado) && !vistaActiva(vistas, estado);
    if (hayQueGuardar) {
      guardarVistas(guardarVista(vistas, "Antes del enlace", estado, crypto.randomUUID()).lista);
    }
    aplicar(recibido);
    mostrarToast(
      hayQueGuardar
        ? "Se abrió una vista compartida. Lo que tenías quedó guardado como «Antes del enlace»."
        : "Se abrió una vista compartida."
    );
    // Una sola vez por página: leer el enlace no debe repetirse cuando cambia lo que se ve.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidratado]);

  useEffect(() => {
    if (!abierto) return;
    function alPulsar(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) cerrar();
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      cerrar();
      if (contenedorRef.current?.contains(document.activeElement)) botonRef.current?.focus();
    }
    document.addEventListener("mousedown", alPulsar);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alPulsar);
      document.removeEventListener("keydown", alTeclear);
    };
  }, [abierto]);

  function cerrar() {
    setAbierto(false);
    setConfirmando(null);
  }

  function alternar() {
    if (!abierto) {
      // Se ancla al borde izquierdo del botón; solo si así se saldría de la pantalla, al derecho.
      const posicion = botonRef.current?.getBoundingClientRect();
      setAlineadoADerecha(posicion ? posicion.left + ANCHO_MENU > window.innerWidth - 8 : false);
    }
    if (abierto) cerrar();
    else setAbierto(true);
  }

  function guardarActual(e: React.FormEvent) {
    e.preventDefault();
    const { lista, resultado } = guardarVista(vistas, nombre, estado, crypto.randomUUID());
    if (resultado === "sin-nombre") return;
    if (resultado === "limite") {
      mostrarToast(`Ya tienes ${MAX_VISTAS} vistas: elimina una o usa el nombre de una existente para reemplazarla.`, "destructive");
      return;
    }
    guardarVistas(lista);
    mostrarToast(resultado === "reemplazada" ? `Vista «${nombre.trim()}» reemplazada.` : `Vista «${nombre.trim()}» guardada.`);
    setNombre("");
  }

  function aplicarVista(vista: EstadoTabla) {
    aplicar(vista);
    cerrar();
    botonRef.current?.focus();
  }

  async function copiarEnlace() {
    try {
      await navigator.clipboard.writeText(enlaceDeVista(window.location.href, def.clave, estado));
      mostrarToast("Enlace copiado. Quien lo abra verá estos filtros, esta agrupación y estas columnas.");
    } catch {
      mostrarToast("No se pudo copiar el enlace.", "destructive");
    }
    cerrar();
  }

  const nombreBoton = activa ? activa.nombre : "Vistas";

  return (
    <div ref={contenedorRef} className="relative">
      <Tooltip texto="Vistas guardadas">
        <button
          ref={botonRef}
          type="button"
          onClick={alternar}
          aria-expanded={abierto}
          aria-controls={idMenu}
          aria-label={activa ? `Vistas, activa: ${activa.nombre}` : "Vistas"}
          className={`flex min-h-8 items-center gap-1.5 !rounded-md px-2 py-1 text-xs font-medium hover:bg-muted ${anilloFoco} ${
            activa ? "bg-muted text-foreground" : "text-muted-foreground"
          }`}
        >
          <VistasIcon className="h-4 w-4 shrink-0" />
          <span className="sr-only">{nombreBoton}</span>
        </button>
      </Tooltip>
      {abierto && (
        <div
          id={idMenu}
          role="group"
          aria-label="Vistas de la tabla"
          className={`absolute z-30 mt-1 w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-border bg-card p-1 text-foreground shadow-lg ${
            alineadoADerecha ? "right-0" : "left-0"
          }`}
        >
          <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Mis vistas guardadas</p>
          {vistas.length === 0 ? (
            <p className="px-2 pb-2 text-xs text-muted-foreground">
              Todavía no guardas ninguna. Arma los filtros, la agrupación y las columnas y ponles nombre abajo.
            </p>
          ) : (
            <ul>
              {vistas.map((v) => (
                <li key={v.id} className="flex items-center gap-1">
                  {confirmando === v.id ? (
                    <div className="flex w-full items-center gap-2 rounded-md bg-destructive-soft px-2 py-1.5" role="alert">
                      <span className="min-w-0 flex-1 truncate text-xs text-destructive">¿Eliminar «{v.nombre}»?</span>
                      <Button
                        type="button"
                        variant="secondary"
                        className="min-h-8 px-2 py-1 text-xs"
                        onClick={() => {
                          guardarVistas(eliminarVista(vistas, v.id));
                          setConfirmando(null);
                          mostrarToast(`Vista «${v.nombre}» eliminada.`);
                        }}
                      >
                        Eliminar
                      </Button>
                      <Button type="button" variant="ghost" className="min-h-8 text-xs" onClick={() => setConfirmando(null)}>
                        Cancelar
                      </Button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-pressed={activa?.id === v.id}
                        onClick={() => aplicarVista(v)}
                        className={`${opcion} min-w-0 flex-1 ${anilloFoco} ${activa?.id === v.id ? "font-semibold" : ""}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{v.nombre}</span>
                        {activa?.id === v.id && <CheckIcon className="h-4 w-4 shrink-0" />}
                      </button>
                      <Tooltip texto="Eliminar vista">
                        <button
                          type="button"
                          onClick={() => setConfirmando(v.id)}
                          aria-label={`Eliminar la vista ${v.nombre}`}
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive-soft hover:text-destructive ${anilloFoco}`}
                        >
                          <PapeleraIcon className="h-4 w-4" />
                        </button>
                      </Tooltip>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={guardarActual} className="mt-1 border-t border-border px-2 pt-2 pb-2">
            <label htmlFor={idNombre} className={labelClassSm}>
              Guardar lo que ves como
            </label>
            <div className="mt-1 flex items-center gap-2">
              <input
                id={idNombre}
                type="text"
                value={nombre}
                maxLength={MAX_NOMBRE}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Ej: Abiertos de la semana"
                autoComplete="off"
                className={`${fieldClassSm} min-w-0 flex-1`}
              />
              <Button type="submit" variant="secondary" className="min-h-8 px-3 py-1 text-xs" disabled={nombre.trim() === ""}>
                Guardar
              </Button>
            </div>
            {existente && (
              <p className="mt-1 text-xs text-muted-foreground">Ya existe «{existente.nombre}»: al guardar se reemplaza.</p>
            )}
          </form>

          <div className="border-t border-border pt-1">
            <button type="button" onClick={copiarEnlace} className={`${opcion} ${anilloFoco}`}>
              <EnlaceIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">Copiar enlace a esta vista</span>
            </button>
            <button
              type="button"
              onClick={() => {
                aplicar(porDefecto);
                mostrarToast("Vista restablecida.");
                cerrar();
                botonRef.current?.focus();
              }}
              disabled={mismoEstado(porDefecto, estado)}
              className={`${opcion} disabled:opacity-40 disabled:hover:bg-transparent ${anilloFoco}`}
            >
              <ActualizarIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="flex-1">Restablecer la tabla</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
