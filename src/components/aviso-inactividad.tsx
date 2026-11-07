"use client";

import { useEffect, useRef, useState } from "react";
import { EVENTOS_USO } from "@/components/latido-presencia";
import { sinActividad, textoSinActividad, textoVolvio } from "@/lib/rendimiento/aviso-inactividad";

/** Cada cuánto se revisa (y se actualiza el contador del aviso). */
const REVISAR_MS = 15_000;
/** Cuánto se queda a la vista «Estuviste N min sin actividad» si no se cierra. */
const VOLVIO_MS = 20_000;

type Estado = { tipo: "inactiva"; desde: number; ahora: number } | { tipo: "volvio"; desde: number; hasta: number } | null;

/**
 * El aviso de 5 minutos sin actividad (7 nov 2026, pedido de Alcides): para que sea evidente para la persona que el sistema lo detectó.
 * Con la pestaña a la vista y 5 minutos sin mouse, teclado, desplazarse ni tocar la pantalla, sale arriba al centro «Sin actividad en el
 * sistema desde las 10:12 (6 min)», que va contando; al volver a usarlo cambia a «Estuviste 8 min sin actividad…» y se va solo a los 20 s
 * (o con «Entendido»). Si la pestaña estaba escondida (otra pestaña, otra aplicación), sale al volver. Solo se monta para las personas de
 * `AVISO_INACTIVIDAD`; no guarda nada: lo que cuenta Rendimiento sigue saliendo del latido.
 */
export function AvisoInactividad() {
  const [estado, setEstado] = useState<Estado>(null);
  const ultimoUso = useRef(0);
  const avisando = useRef(false);

  useEffect(() => {
    let cerrar: ReturnType<typeof setTimeout> | undefined;
    ultimoUso.current = Date.now();
    const revisar = () => {
      if (document.visibilityState !== "visible") return;
      const ahora = Date.now();
      if (sinActividad(ultimoUso.current, ahora)) {
        avisando.current = true;
        setEstado({ tipo: "inactiva", desde: ultimoUso.current, ahora });
      }
    };
    const usar = () => {
      const ahora = Date.now();
      // Volvió después de 5 minutos o más: lo que estuvo sin actividad, aunque el aviso no alcanzara a verse (pestaña escondida).
      if (avisando.current || sinActividad(ultimoUso.current, ahora)) {
        const desde = ultimoUso.current;
        avisando.current = false;
        setEstado({ tipo: "volvio", desde, hasta: ahora });
        clearTimeout(cerrar);
        cerrar = setTimeout(() => setEstado((e) => (e?.tipo === "volvio" ? null : e)), VOLVIO_MS);
      }
      ultimoUso.current = ahora;
    };
    const id = setInterval(revisar, REVISAR_MS);
    document.addEventListener("visibilitychange", revisar);
    for (const e of EVENTOS_USO) window.addEventListener(e, usar, { passive: true, capture: true });
    return () => {
      clearInterval(id);
      clearTimeout(cerrar);
      document.removeEventListener("visibilitychange", revisar);
      for (const e of EVENTOS_USO) window.removeEventListener(e, usar, { capture: true });
    };
  }, []);

  if (!estado) return null;
  const texto = estado.tipo === "inactiva" ? textoSinActividad(estado.desde, estado.ahora) : textoVolvio(estado.desde, estado.hasta);
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4">
      <div role="status" aria-live="polite" className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-full border border-border bg-card py-2 pr-2 pl-4 text-sm shadow-lg">
        <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-warning motion-reduce:animate-none" />
        <span className="font-medium">{texto}</span>
        {estado.tipo === "volvio" && (
          <button type="button" onClick={() => setEstado(null)} className="shrink-0 rounded-full bg-foreground px-3 py-1 text-xs font-medium text-background hover:bg-foreground/85">
            Entendido
          </button>
        )}
      </div>
    </div>
  );
}
