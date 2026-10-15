/**
 * Compartir desde el celular, sin pasar por el mensaje directo: la plataforma instalada como app (Chrome › «Instalar aplicación»)
 * aparece en la hoja de «Compartir en…» de Instagram, y lo que se comparte llega a `/instagram/compartir` como `title`, `text` y
 * `url` (el «share target» del manifiesto). Aquí se saca de ahí el enlace del reel o la publicación y se arma la llave que evita
 * guardar dos veces el mismo envío.
 */
import { enlacesDeTexto, paginaDestinoDeTexto } from "./extraer";
import { codigoDePublicacion } from "./repetidas";
import { enlaceLegible } from "./vista-previa";

/** Lo que Android entrega al compartir: el título, el texto y la dirección (Instagram suele mandar el enlace en `text`). */
export interface Compartido {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}

export interface EnlaceCompartido {
  /** El enlace limpio del reel o la publicación (`https://www.instagram.com/reel/…/`), sin los parámetros de rastreo (`igsh`). */
  enlace: string;
  tipo: "reel" | "post" | "otro";
  /** Una página que no sea de Instagram ni de Facebook que venga en lo compartido: la sugerencia de página de destino. */
  paginaDestino: string | null;
}

const recortar = (v: string | null | undefined): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 4000) : null);

/** El enlace de un reel o una publicación en lo que se compartió, o null si no hay ninguno (un perfil, una historia, otro sitio). */
export function enlaceDeCompartido(c: Compartido): EnlaceCompartido | null {
  const campos = [recortar(c.url), recortar(c.text), recortar(c.title)];
  for (const campo of campos) {
    for (const u of enlacesDeTexto(campo)) {
      if (!enlaceLegible(u.toString())) continue;
      return {
        enlace: `https://www.instagram.com${u.pathname}`,
        tipo: /\/reels?\//i.test(u.pathname) ? "reel" : /\/p\//i.test(u.pathname) ? "post" : "otro",
        paginaDestino: campos.map(paginaDestinoDeTexto).find((p): p is string => !!p) ?? null,
      };
    }
  }
  return null;
}

/** Los minutos en que compartir lo mismo dos veces cuenta como un solo envío (recargar la página, volver a pulsar). */
const MINUTOS_MISMO_ENVIO = 10;

/**
 * La llave de un envío hecho desde el celular. Es la misma para la misma persona y el mismo contenido dentro de unos minutos, así que
 * recargar la página o pulsar dos veces no lo guarda dos veces; compartirlo otro día sí cuenta como otro envío.
 */
export function llaveDeEnvio(usuarioId: string, enlace: string, ahora: number = Date.now()): string | null {
  const codigo = codigoDePublicacion(enlace);
  if (!codigo) return null;
  return `web:${usuarioId}:${codigo}:${Math.floor(ahora / (MINUTOS_MISMO_ENVIO * 60_000))}`;
}

/** La captura que se guardó con esa llave pertenece a la plataforma, no a Meta: no se le pregunta a Instagram quién es. */
export const esEnvioPropio = (remitenteId: string): boolean => remitenteId.startsWith("web:");
