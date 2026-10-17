/**
 * Compartir desde el celular, sin pasar por el mensaje directo: la plataforma instalada como app (Chrome › «Instalar aplicación»)
 * aparece en la hoja de «Compartir en…» de Instagram, Facebook y TikTok, y lo que se comparte llega a `/instagram/compartir` como
 * `title`, `text` y `url` (el «share target» del manifiesto). Aquí se saca de ahí el enlace del reel, video o publicación (de la red
 * que sea) y se arma la llave que evita guardar dos veces el mismo envío.
 */
import { enlacesDeTexto, paginaDestinoDeTexto } from "./extraer";
import { codigoDeContenido, reconocerEnlace, type Plataforma } from "./plataformas";

/** Lo que Android entrega al compartir: el título, el texto y la dirección (las redes suelen mandar el enlace en `text`). */
export interface Compartido {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}

export interface EnlaceCompartido {
  /** El enlace limpio del reel, video o publicación (`https://www.instagram.com/reel/…/`), sin los parámetros de rastreo (`igsh`). */
  enlace: string;
  tipo: "reel" | "post" | "video" | "otro";
  plataforma: Plataforma;
  /** ¿Es un enlace corto (`vm.tiktok.com`, `fb.watch`) que hay que abrir para saber de qué contenido es? */
  corto: boolean;
  /** Una página que no sea de Instagram, Facebook ni TikTok que venga en lo compartido: la sugerencia de página de destino. */
  paginaDestino: string | null;
}

const recortar = (v: string | null | undefined): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 4000) : null);

/** El enlace de un reel, video o publicación de Instagram, Facebook o TikTok en lo que se compartió, o null si no hay ninguno (un perfil, una historia, otro sitio). */
export function enlaceDeCompartido(c: Compartido): EnlaceCompartido | null {
  const campos = [recortar(c.url), recortar(c.text), recortar(c.title)];
  for (const campo of campos) {
    for (const u of enlacesDeTexto(campo)) {
      const r = reconocerEnlace(u.toString());
      if (!r) continue;
      return { enlace: r.enlace, tipo: r.tipo, plataforma: r.plataforma, corto: r.corto, paginaDestino: campos.map(paginaDestinoDeTexto).find((p): p is string => !!p) ?? null };
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
  const codigo = codigoDeContenido(enlace);
  if (!codigo) return null;
  return `web:${usuarioId}:${codigo}:${Math.floor(ahora / (MINUTOS_MISMO_ENVIO * 60_000))}`;
}

/** La captura que se guardó con esa llave pertenece a la plataforma, no a Meta: no se le pregunta a Instagram quién es. */
export const esEnvioPropio = (remitenteId: string): boolean => remitenteId.startsWith("web:");
