"use client";

import { useEffect } from "react";

/**
 * Registra el service worker (`public/sw.js`, que no guarda nada): Chrome lo pide para dejar instalar la plataforma como app, y
 * solo una app instalada aparece en la hoja de «Compartir en…» de Instagram. No hace nada visible.
 */
export function RegistrarSw() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
