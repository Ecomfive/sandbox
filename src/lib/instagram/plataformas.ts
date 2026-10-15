/**
 * Las redes de las que se guardan capturas. Nació para Instagram; el 15 oct 2026 se suman **Facebook** y **TikTok**, que también ofrecen
 * compartir hacia fuera (la hoja de «Compartir en…» de Android y de iPhone). Aquí se reconoce de qué red es un enlace, se limpia (sin
 * parámetros de rastreo) y se saca el **código del contenido**, que es lo que permite saber que dos envíos son el mismo.
 *
 * Un enlace **corto** (`vm.tiktok.com/…`, `fb.watch/…`, `facebook.com/share/r/…`) no dice qué contenido es: el servidor lo abre y sigue
 * sus redirecciones para saberlo (ver `guardar.ts`); mientras no se resuelva, su código es el del propio enlace corto.
 */
export type Plataforma = "instagram" | "facebook" | "tiktok";

export const PLATAFORMAS = [
  { valor: "instagram", etiqueta: "Instagram", color: "#d74c81" },
  { valor: "facebook", etiqueta: "Facebook", color: "#1877f2" },
  { valor: "tiktok", etiqueta: "TikTok", color: "#25292e" },
] as const;

export const etiquetaPlataforma = (p: string): string => PLATAFORMAS.find((x) => x.valor === p)?.etiqueta ?? p;
export const colorPlataforma = (p: string): string => PLATAFORMAS.find((x) => x.valor === p)?.color ?? "#8D8D8D";

/** La plataforma que guarda `metricas.plataforma`; sin dato (todo lo anterior al 15 oct) es Instagram. */
export function plataformaDeMetricas(valor: unknown): Plataforma {
  return valor === "facebook" || valor === "tiktok" ? valor : "instagram";
}

export interface EnlaceReconocido {
  plataforma: Plataforma;
  /** El enlace limpio (`https://www.tiktok.com/@usuario/video/123`). */
  enlace: string;
  /** Lo que identifica al contenido: el código de Instagram, el id del video de TikTok o de Facebook, o el código del enlace corto. */
  codigo: string;
  tipo: "reel" | "post" | "video" | "otro";
  /** ¿Es un enlace corto que hay que abrir para saber de qué contenido es? */
  corto: boolean;
}

const HOST_INSTAGRAM = /^(www\.)?instagram\.com$/i;
const RUTA_INSTAGRAM = /^\/(?:[\w.]+\/)?(?:reels?|p|tv)\/([\w-]+)/i;
const HOST_TIKTOK = /^(www\.|m\.)?tiktok\.com$/i;
const HOST_TIKTOK_CORTO = /^(vm|vt)\.tiktok\.com$/i;
const HOST_FACEBOOK = /^(www\.|m\.|web\.|mbasic\.)?facebook\.com$/i;
const ID = /^\d{6,25}$/;

function como(plataforma: Plataforma, enlace: string, codigo: string, tipo: EnlaceReconocido["tipo"], corto = false): EnlaceReconocido {
  return { plataforma, enlace, codigo, tipo, corto };
}

/** De qué red es un enlace de un reel, video o publicación, o null si no lo es (un perfil, una historia, otro sitio). */
export function reconocerEnlace(texto: string | null | undefined): EnlaceReconocido | null {
  if (!texto) return null;
  let u: URL;
  try {
    u = new URL(texto);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const host = u.hostname;
  const ruta = u.pathname;

  if (HOST_INSTAGRAM.test(host)) {
    const m = RUTA_INSTAGRAM.exec(ruta);
    if (!m) return null;
    return como("instagram", `https://www.instagram.com${ruta}`, m[1], /\/reels?\//i.test(ruta) ? "reel" : /\/p\//i.test(ruta) ? "post" : "otro");
  }

  if (HOST_TIKTOK.test(host) || HOST_TIKTOK_CORTO.test(host)) {
    const largo = /^\/@([\w.]{1,40})\/video\/(\d{8,25})\/?$/.exec(ruta);
    if (largo && HOST_TIKTOK.test(host)) return como("tiktok", `https://www.tiktok.com/@${largo[1]}/video/${largo[2]}`, largo[2], "video");
    // Un enlace corto: `vm.tiktok.com/ZS12345/`, `vt.tiktok.com/ZS12345/` o `tiktok.com/t/ZS12345/`.
    const corto = HOST_TIKTOK_CORTO.test(host) ? /^\/([\w-]{5,24})\/?$/.exec(ruta) : /^\/t\/([\w-]{5,24})\/?$/.exec(ruta);
    if (corto) return como("tiktok", `https://${HOST_TIKTOK_CORTO.test(host) ? host.toLowerCase() : "vm.tiktok.com"}/${corto[1]}/`, `corto-${corto[1]}`, "video", true);
    return null;
  }

  if (host.toLowerCase() === "fb.me") {
    const m = /^\/([\w-]{4,30})\/?$/.exec(ruta);
    return m ? como("facebook", `https://fb.me/${m[1]}`, `corto-${m[1]}`, "otro", true) : null;
  }

  if (host.toLowerCase() === "fb.watch") {
    const m = /^\/([\w-]{5,24})\/?$/.exec(ruta);
    return m ? como("facebook", `https://fb.watch/${m[1]}/`, `corto-${m[1]}`, "video", true) : null;
  }

  if (HOST_FACEBOOK.test(host)) {
    const reel = /^\/reel\/(\d+)\/?$/.exec(ruta);
    if (reel && ID.test(reel[1])) return como("facebook", `https://www.facebook.com/reel/${reel[1]}`, reel[1], "video");
    const v = u.searchParams.get("v");
    if (/^\/watch(?:\/live)?\/?$/.test(ruta) && v && ID.test(v)) return como("facebook", `https://www.facebook.com/reel/${v}`, v, "video");
    const video = /^\/([\w.-]{1,80})\/videos\/(?:[^/]+\/)*(\d{6,25})\/?$/.exec(ruta);
    if (video) return como("facebook", `https://www.facebook.com/${video[1]}/videos/${video[2]}`, video[2], "video");
    const post = /^\/([\w.-]{1,80})\/posts\/([\w-]{6,80})\/?$/.exec(ruta);
    if (post) return como("facebook", `https://www.facebook.com/${post[1]}/posts/${post[2]}`, post[2], "post");
    // Una foto: `photo/?fbid=ID`, `photo.php?fbid=ID` o `<página>/photos/<álbum>/ID/`.
    const foto = u.searchParams.get("fbid");
    if (/^\/photo(?:\.php)?\/?$/.test(ruta) && foto && ID.test(foto)) return como("facebook", `https://www.facebook.com/photo/?fbid=${foto}`, foto, "post");
    const fotos = /^\/([\w.-]{1,80})\/photos\/(?:[^/]+\/)*(\d{6,25})\/?$/.exec(ruta);
    if (fotos) return como("facebook", `https://www.facebook.com/photo/?fbid=${fotos[2]}`, fotos[2], "post");
    // Una publicación de un grupo público.
    const grupo = /^\/groups\/([\w.-]{1,80})\/(?:posts|permalink)\/(\d{6,25})\/?$/.exec(ruta);
    if (grupo) return como("facebook", `https://www.facebook.com/groups/${grupo[1]}/posts/${grupo[2]}`, grupo[2], "post");
    const story = u.searchParams.get("story_fbid");
    const id = u.searchParams.get("id");
    if (/^\/(permalink|story)\.php$/.test(ruta) && story && /^[\w-]{6,80}$/.test(story)) {
      const base = `https://www.facebook.com${ruta}?story_fbid=${story}`;
      return como("facebook", id && /^\d{4,25}$/.test(id) ? `${base}&id=${id}` : base, story, "post");
    }
    // Un enlace de «compartir» de Facebook: `facebook.com/share/r/XXXX/` (reel), `/share/v/` (video), `/share/p/` (publicación) o, el más
    // nuevo, `/share/XXXX/` sin letra (Facebook decide al abrirlo qué es).
    const compartir = /^\/share\/(?:([rvp])\/)?([\w-]{5,30})\/?$/.exec(ruta);
    if (compartir) {
      const letra = compartir[1] ? `${compartir[1]}/` : "";
      return como("facebook", `https://www.facebook.com/share/${letra}${compartir[2]}/`, `corto-${compartir[2]}`, compartir[1] === "p" ? "post" : compartir[1] ? "video" : "otro", true);
    }
    // Respaldo: cualquier otro enlace de contenido de Facebook (una forma que todavía no se conoce, como las de los anuncios). Se guarda
    // tal cual, sin los parámetros de rastreo, como un enlace «corto»: el servidor lo abre, sigue sus redirecciones y se queda con el canónico.
    const sirve = /^\/[^/]+\/[^/]+/.test(ruta) || ["fbid", "story_fbid", "v"].some((k) => u.searchParams.has(k));
    if (sirve && !/^\/(login|help|policies|privacy|settings|marketplace|events|pages|business|ads|gaming|friends|notifications|messages|bookmarks|hashtag|search|l\.php|dialog|plugins|tr|security|recover|people|profile\.php|public)(?:\/|$)/i.test(ruta) && !/^\/groups\/[^/]+\/?$/.test(ruta)) {
      const limpio = new URL(`https://www.facebook.com${ruta}`);
      for (const k of ["fbid", "story_fbid", "id", "v", "set"]) {
        const valor = u.searchParams.get(k);
        if (valor && /^[A-Za-z0-9._-]{1,80}$/.test(valor)) limpio.searchParams.set(k, valor);
      }
      const texto = limpio.toString().slice(0, 600);
      return como("facebook", texto, `corto-${resumen(texto)}`, "otro", true);
    }
  }
  return null;
}

/** Un resumen corto y estable de un texto (para darle un código a un enlace que todavía no se sabe de qué contenido es). */
function resumen(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h * 33) ^ texto.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** El código del contenido de un enlace de cualquier red (o null): dos capturas con el mismo código son el mismo contenido. */
export const codigoDeContenido = (enlace: string | null | undefined): string | null => reconocerEnlace(enlace)?.codigo ?? null;

/** De qué red es un enlace, o Instagram si no se reconoce (lo anterior a Facebook y TikTok no guardaba la red). */
export const plataformaDeEnlace = (enlace: string | null | undefined): Plataforma => reconocerEnlace(enlace)?.plataforma ?? "instagram";
