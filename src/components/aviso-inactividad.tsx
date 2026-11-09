"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EVENTOS_USO } from "@/components/latido-presencia";
import { anilloFoco } from "@/components/ui/field";
import { sinActividad, textoSinActividad, textoVolvio } from "@/lib/rendimiento/aviso-inactividad";

/** Cada cuánto se revisa (y se actualiza el contador del aviso). */
const REVISAR_MS = 15_000;
/** Donde queda el aviso sin confirmar: así sigue al recargar y en las otras pestañas, hasta «Entendido». */
const CLAVE = "aviso-inactividad-pendiente-v1";

interface Pendiente {
  desde: number;
  /** Cuándo volvió a usar el sistema; sin esto, sigue sin actividad. */
  hasta: number | null;
}

function leer(): Pendiente | null {
  try {
    const v = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Pendiente | null;
    return v && typeof v.desde === "number" ? { desde: v.desde, hasta: typeof v.hasta === "number" ? v.hasta : null } : null;
  } catch {
    return null;
  }
}
function guardar(p: Pendiente | null) {
  try {
    if (p) localStorage.setItem(CLAVE, JSON.stringify(p));
    else localStorage.removeItem(CLAVE);
  } catch {
    // Sin almacenamiento (ventana privada): el aviso funciona igual, solo no sigue al recargar.
  }
}

/**
 * El aviso de 5 minutos sin actividad (7 nov 2026, pedido de Alcides): para que sea evidente para la persona que el sistema lo detectó.
 * Con la pestaña a la vista y 5 minutos sin mouse, teclado, desplazarse ni tocar la pantalla, se abre una ventana al centro que **bloquea
 * el sistema hasta pulsar «Entendido»**: «Sin actividad en el sistema desde las 10:12 (6 min)», que va contando; al volver a usarlo dice
 * «Estuviste 8 min sin actividad…». **No se quita al recargar ni en otra pestaña** (queda en el almacenamiento del navegador hasta
 * «Entendido», que lo cierra en todas). Si la pestaña estaba escondida, sale al volver. Todo lo demás de la página queda `inert` y el
 * teclado (también Escape) no llega a las ventanas de abajo. Solo se monta para las personas marcadas en Configuración
 * (`perfiles.aviso_inactividad`); no guarda nada en la base.
 */
export function AvisoInactividad() {
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [ahora, setAhora] = useState(0);
  const ultimoUso = useRef(0);
  const actual = useRef<Pendiente | null>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const capa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const poner = (p: Pendiente | null) => {
      actual.current = p;
      guardar(p);
      setPendiente(p);
      setAhora(Date.now());
    };
    // Al cargar: si quedó un aviso sin confirmar (se recargó la página), sale otra vez.
    const previo = leer();
    ultimoUso.current = previo ? previo.desde : Date.now();
    if (previo) actual.current = previo;
    // Fuera del efecto (la primera pintura es la del servidor, que no conoce el almacenamiento del navegador).
    const inicial = previo
      ? setTimeout(() => {
          setPendiente(previo);
          setAhora(Date.now());
        }, 0)
      : undefined;
    const revisar = () => {
      if (document.visibilityState !== "visible") return;
      const t = Date.now();
      if (!actual.current && sinActividad(ultimoUso.current, t)) poner({ desde: ultimoUso.current, hasta: null });
      else setAhora(t);
    };
    const usar = () => {
      const t = Date.now();
      // Volvió después de 5 minutos o más (aunque el aviso no alcanzara a verse con la pestaña escondida): se fija hasta cuándo.
      if (!actual.current && sinActividad(ultimoUso.current, t)) poner({ desde: ultimoUso.current, hasta: t });
      else if (actual.current && actual.current.hasta === null) poner({ ...actual.current, hasta: t });
      if (!actual.current) ultimoUso.current = t;
    };
    // «Entendido» en otra pestaña la cierra aquí también, y un aviso que sale en otra pestaña sale aquí.
    const otraPestana = (e: StorageEvent) => {
      if (e.key !== CLAVE) return;
      const p = leer();
      actual.current = p;
      if (!p) ultimoUso.current = Date.now();
      setPendiente(p);
      setAhora(Date.now());
    };
    const id = setInterval(revisar, REVISAR_MS);
    document.addEventListener("visibilitychange", revisar);
    window.addEventListener("storage", otraPestana);
    for (const e of EVENTOS_USO) window.addEventListener(e, usar, { passive: true, capture: true });
    return () => {
      clearTimeout(inicial);
      clearInterval(id);
      document.removeEventListener("visibilitychange", revisar);
      window.removeEventListener("storage", otraPestana);
      for (const e of EVENTOS_USO) window.removeEventListener(e, usar, { capture: true });
    };
  }, []);

  const abierto = pendiente !== null;
  // Mientras está abierto, el resto de la página no se puede usar: `inert` en todo lo demás (no en la ventana misma) y el teclado solo para «Entendido».
  useEffect(() => {
    if (!abierto) return;
    const propia = capa.current;
    const otros = [...document.body.children].filter((n): n is HTMLElement => n instanceof HTMLElement && n !== propia && !n.contains(propia) && !n.inert);
    for (const n of otros) n.inert = true;
    boton.current?.focus();
    const teclas = (e: KeyboardEvent) => {
      if (e.target === boton.current && (e.key === "Enter" || e.key === " ")) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      boton.current?.focus();
    };
    window.addEventListener("keydown", teclas, true);
    return () => {
      for (const n of otros) n.inert = false;
      window.removeEventListener("keydown", teclas, true);
    };
  }, [abierto]);

  const entendido = () => {
    actual.current = null;
    ultimoUso.current = Date.now();
    guardar(null);
    setPendiente(null);
  };

  if (!pendiente) return null;
  const texto = pendiente.hasta === null ? textoSinActividad(pendiente.desde, Math.max(ahora, pendiente.desde)) : textoVolvio(pendiente.desde, pendiente.hasta);
  return createPortal(
    <div ref={capa} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="aviso-inactividad-titulo" aria-describedby="aviso-inactividad-texto" className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">
        <span aria-hidden="true" className="h-3 w-3 animate-pulse rounded-full bg-warning motion-reduce:animate-none" />
        <h2 id="aviso-inactividad-titulo" className="m-0 text-lg font-semibold">
          Sin actividad en el sistema
        </h2>
        <p id="aviso-inactividad-texto" className="m-0 text-sm text-muted-foreground">
          {texto}
        </p>
        {/* Con el color del botón «Agregar» (`boton-neon`), pedido de Alcides. */}
        <button ref={boton} type="button" onClick={entendido} className={`boton-neon mt-1 w-full border border-transparent px-4 py-2.5 text-sm font-medium text-white ${anilloFoco} !rounded-md`}>
          Entendido
        </button>
      </div>
    </div>,
    document.body,
  );
}
