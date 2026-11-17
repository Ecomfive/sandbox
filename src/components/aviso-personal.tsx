"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePendientesVivos } from "@/components/pendientes-vivos";
import { sonar } from "@/components/tienda/aviso-pedidos-nuevos";
import { anilloFoco } from "@/components/ui/field";
import { avisosParaPantalla } from "@/lib/avisos-pantalla-actions";
import { MAX_TARJETAS, rutaInterna, sinMostrar, type AvisoEnPantalla } from "@/lib/avisos-pantalla";
import { marcarAvisoLeido } from "@/lib/menciones-actions";
import { CerrarIcon, NotificacionesIcon } from "@/lib/nav-icons";

/** Cada cuánto se pregunta por avisos nuevos (solo con la pestaña a la vista). */
const CADA_MS = 30_000;

/**
 * Los avisos personales que alguien tiene que atender salen en una tarjeta arriba a la derecha, en cualquier página (17 nov 2026, pedido de Hernán: Llegada a Puerto para Logística y En Bodega
 * para quien paga). La tarjeta no se va sola: se pulsa para ver todo el detalle y «Ir a gestionarlo» lleva a donde se resuelve (y lo marca como leído). Cerrarla no lo marca leído: sigue en
 * «Avisos › Para ti» y en el contador del menú. Qué tipos de aviso salen aquí: `TIPOS_CON_AVISO_EN_PANTALLA`.
 */
export function AvisoPersonal() {
  const [tarjetas, setTarjetas] = useState<AvisoEnPantalla[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const vistos = useRef(new Set<string>());
  const desde = useRef<string | null>(null);
  const cola = useRef<AvisoEnPantalla[]>([]);
  // Cuando sale un aviso nuevo, el número de «Avisos» del menú se actualiza en el momento.
  const { refrescar } = usePendientesVivos();
  const refrescarAhora = useRef(refrescar);
  useEffect(() => {
    refrescarAhora.current = refrescar;
  }, [refrescar]);

  useEffect(() => {
    let vivo = true;
    let temporizador: ReturnType<typeof setTimeout> | null = null;
    async function revisar() {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await avisosParaPantalla(desde.current);
        if (!vivo) return;
        desde.current = r.hasta;
        const nuevos = sinMostrar(r.avisos, vistos.current);
        if (!nuevos.length) return;
        for (const a of nuevos) vistos.current.add(a.id);
        cola.current = [...cola.current, ...nuevos];
        setTarjetas((actuales) => {
          const lugar = Math.max(0, MAX_TARJETAS - actuales.length);
          const entran = cola.current.splice(0, lugar);
          return [...actuales, ...entran];
        });
        sonar();
        refrescarAhora.current();
      } catch {
        // Sin red: se vuelve a intentar en la próxima vuelta.
      }
    }
    function ciclo() {
      temporizador = setTimeout(async () => {
        await revisar();
        if (vivo) ciclo();
      }, CADA_MS);
    }
    void revisar();
    ciclo();
    const alVolver = () => void revisar();
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      vivo = false;
      if (temporizador) clearTimeout(temporizador);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, []);

  // Al cerrar una tarjeta entra la siguiente que esperaba.
  function quitar(id: string) {
    setTarjetas((actuales) => {
      const quedan = actuales.filter((t) => t.id !== id);
      return [...quedan, ...cola.current.splice(0, Math.max(0, MAX_TARJETAS - quedan.length))];
    });
    setAbierta((a) => (a === id ? null : a));
  }

  if (!tarjetas.length) return null;
  return (
    <div aria-live="polite" className="fixed top-16 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
      {tarjetas.map((t) => {
        const desplegada = abierta === t.id;
        return (
          <div key={t.id} role="status" className="rounded-xl border border-primario/40 bg-card shadow-lg">
            <div className="flex items-start gap-3 px-3.5 py-3">
              <span aria-hidden="true" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primario-suave text-primario">
                <NotificacionesIcon className="h-4.5 w-4.5" />
              </span>
              <button type="button" aria-expanded={desplegada} onClick={() => setAbierta(desplegada ? null : t.id)} className={`min-w-0 flex-1 cursor-pointer rounded text-left text-sm ${anilloFoco}`}>
                <span className="block font-semibold">{t.titulo}</span>
                {t.texto && <span className={`mt-0.5 block text-muted-foreground ${desplegada ? "whitespace-pre-wrap" : "line-clamp-2"}`}>{t.texto}</span>}
                {!desplegada && <span className="mt-1 block text-xs font-medium text-primario">Ver el detalle</span>}
              </button>
              <button type="button" aria-label={`Cerrar el aviso: ${t.titulo}`} onClick={() => quitar(t.id)} className={`shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted ${anilloFoco}`}>
                <CerrarIcon className="h-4 w-4" />
              </button>
            </div>
            {desplegada && (
              <div className="flex justify-end gap-2 border-t border-border px-3.5 py-2.5">
                <Link
                  href={rutaInterna(t.href)}
                  onClick={() => {
                    void marcarAvisoLeido(t.id);
                    quitar(t.id);
                  }}
                  className={`rounded-md bg-foreground px-3 py-2 text-sm font-semibold text-background ${anilloFoco}`}
                >
                  Ir a gestionarlo
                </Link>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
