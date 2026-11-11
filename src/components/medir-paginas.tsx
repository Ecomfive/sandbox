"use client";

import { useReportWebVitals } from "next/web-vitals";
import { esMetrica } from "@/lib/rendimiento/metricas";

/**
 * Mejora 32: manda al servidor cuánto tardó cada página (TTFB, FCP, LCP, INP, CLS), con `sendBeacon` para no frenar nada.
 * La ruta viaja sin ids (el servidor la vuelve a limpiar). No se manda nada de la persona.
 */
export function MedirPaginas() {
  useReportWebVitals((m) => {
    if (!esMetrica(m.name) || typeof navigator === "undefined" || !navigator.sendBeacon) return;
    const cuerpo = JSON.stringify({ ruta: window.location.pathname, metrica: m.name, valor: m.value });
    navigator.sendBeacon("/api/metricas", new Blob([cuerpo], { type: "application/json" }));
  });
  return null;
}
