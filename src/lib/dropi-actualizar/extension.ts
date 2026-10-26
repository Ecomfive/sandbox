// Cómo habla el panel «Actualizar Dropi» con la extensión de Chrome «Ecomfive · Dropi» (extension/ecomfive-dropi/): la extensión
// pone en las páginas del sistema un puente (puente.js) que pasa los mensajes de la página a la extensión y le devuelve la
// respuesta, siempre por `window.postMessage` dentro de la misma página y solo con el canal «ecomfive-dropi». La sesión de Dropi
// nunca llega aquí: la extensión solo responde si hay sesión, de qué cuenta y cuándo vence.
// Solo en el navegador.

import type { ClaveLector, CodigoPaisDropi } from "./partes";

const CANAL = "ecomfive-dropi";

export type MensajeExtension =
  | { tipo: "hola" }
  | { tipo: "sesion"; pais: CodigoPaisDropi; abrir: boolean }
  | { tipo: "mostrar"; pais: CodigoPaisDropi }
  | { tipo: "lanzar"; lector: ClaveLector; subida: Record<string, string> }
  | { tipo: "avance"; lector: ClaveLector };

export interface SesionDropi {
  /** false = no hay ninguna pestaña de Dropi de ese país abierta (y no se pidió abrirla). */
  pestana: boolean;
  hay: boolean;
  tipoUsuario: string | null;
  tienda: string | null;
  vence: string | null;
}

/** El avance de un lector en la pestaña de Dropi (lo que deja en window.__dropiDiario / __ventasDropi, sin el detalle). */
export interface AvanceLector {
  fase?: string;
  pedidos?: number;
  cartera?: number;
  retiros?: number;
  productos?: number;
  hechos?: number;
  movimientos?: number;
  errores?: number;
  fin: string | null;
  error: string | null;
  resultado: Record<string, unknown> | null;
}

/** Le pide algo a la extensión y espera su respuesta (error si no está instalada o no responde a tiempo). */
export function pedirExtension<T>(msg: MensajeExtension, esperaMs = 20000): Promise<T> {
  return new Promise((ok, mal) => {
    const id = crypto.randomUUID();
    const alRecibir = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin || e.data?.canal !== CANAL || e.data?.dir !== "respuesta" || e.data?.id !== id) return;
      clearTimeout(reloj);
      window.removeEventListener("message", alRecibir);
      const r = e.data.resp as { error?: string } | undefined;
      if (r && typeof r === "object" && "error" in r && r.error) mal(new Error(String(r.error)));
      else ok(r as T);
    };
    const reloj = setTimeout(() => {
      window.removeEventListener("message", alRecibir);
      mal(new Error("La extensión «Ecomfive · Dropi» no respondió."));
    }, esperaMs);
    window.addEventListener("message", alRecibir);
    window.postMessage({ canal: CANAL, dir: "pedido", id, msg }, window.location.origin);
  });
}
