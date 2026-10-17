import type { MetadataRoute } from "next";

/**
 * Lo que hace que la plataforma se pueda instalar como app en el celular (Chrome › «Instalar aplicación»). Instalada, aparece como
 * «Ecomfive Fuentes» en la hoja de «Compartir en…» de Instagram, Facebook y TikTok: lo que se comparte llega a `/instagram/compartir` (el «share
 * target»), que guarda el reel o la publicación como una captura, sin pasar por el mensaje directo. Solo Android (Chrome) registra el
 * destino de compartir; en iPhone se usa un atajo de la app Atajos que abre la misma página (ver `INSTAGRAM-META.md`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ecomfive Fuentes",
    short_name: "Fuentes",
    description: "Guarda en Fuentes lo que ves en Instagram, Facebook y TikTok",
    lang: "es",
    start_url: "/instagram",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    share_target: {
      action: "/instagram/compartir",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
