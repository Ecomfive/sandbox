/**
 * Lo que se lee de la Biblioteca de anuncios de Meta con el marcador (`marcador.ts`): cada tarjeta de la página llega como su texto
 * y el enlace de su botón, y aquí se interpreta (anuncio, estado, fecha, página, copy y destino) y se cuenta, para cada captura de
 * Instagram, cuántos anuncios de **la misma página** llevan **el mismo copy**. Todo es puro: el servidor no abre la Biblioteca (Meta lo
 * limita); la lee el navegador de la persona y solo manda el resultado.
 */

/** Una tarjeta tal como la ve el marcador: su texto y el enlace del botón (el de `l.facebook.com`, que lleva el destino). */
export interface TarjetaBruta {
  x: string;
  l: string | null;
}

/** Un anuncio de la Biblioteca. `cantidad` es 1, o N si la tarjeta dice «N anuncios usan este contenido y texto». */
export interface AnuncioBiblioteca {
  id: string;
  activo: boolean;
  /** AAAA-MM-DD: desde cuándo está en circulación. */
  desde: string | null;
  pagina: string | null;
  copy: string;
  destino: string | null;
  cantidad: number;
}

export interface CoincidenciaBiblioteca {
  /** El nombre de la página tal como lo escribe la Biblioteca. */
  pagina: string | null;
  /** Anuncios con el mismo copy (una tarjeta agrupada cuenta por todos los que reúne). */
  total: number;
  activos: number;
  inactivos: number;
  /** La fecha más antigua en que alguno empezó a circular. */
  desde: string | null;
  ids: string[];
  /** Las páginas de destino de los botones, de la más repetida a la menos. */
  destinos: { url: string; n: number }[];
}

const MESES: Record<string, number> = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, sept: 9, set: 9, oct: 10, nov: 11, dic: 12 };
const INVISIBLES = /[​‌‍‎‏⁠﻿]/g;
// Cuántas letras del copy se comparan como mínimo y como máximo: lo bastante largo para no confundir dos copys que empiezan igual
// («Apoya tu…»), y corto para que un copy que Instagram recortó siga coincidiendo con el completo de la Biblioteca.
const COPY_MINIMO = 25;
const COPY_MAXIMO = 120;

/** El texto sin acentos, en minúsculas y sin símbolos ni emojis: para comparar copys y nombres. */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** «10 oct 2026» (o «10 de octubre de 2026») como AAAA-MM-DD. */
function fechaDe(texto: string): string | null {
  const m = texto.match(/(\d{1,2})\s+(?:de\s+)?([A-Za-zÁÉÍÓÚáéíóú]{3,10})\.?\s+(?:de\s+)?(\d{4})/);
  if (!m) return null;
  const mes = MESES[normalizar(m[2]).slice(0, 4)] ?? MESES[normalizar(m[2]).slice(0, 3)];
  if (!mes) return null;
  return `${m[3]}-${String(mes).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

/** La dirección real de un botón de la Biblioteca: el enlace de `l.facebook.com/l.php?u=…`, sin el rastreo de Facebook. */
export function destinoDeEnlace(enlace: string | null | undefined): string | null {
  if (!enlace) return null;
  try {
    const u = new URL(enlace);
    if (u.hostname !== "l.facebook.com" || u.pathname !== "/l.php") return null;
    const destino = u.searchParams.get("u");
    if (!destino) return null;
    const d = new URL(destino);
    if (d.protocol !== "https:" && d.protocol !== "http:") return null;
    d.searchParams.delete("fbclid");
    return d.toString().slice(0, 2000);
  } catch {
    return null;
  }
}

const CTA = /^(m[aá]s informaci[oó]n|learn more|comprar(?: ahora)?|shop now|ver m[aá]s|see more|reservar|registrarte|sign up|suscribirte|obtener oferta|get offer|enviar mensaje|send message|contactarnos|contact us|descargar|download|ver men[uú]|ahorrar|solicitar ahora|apply now)$/i;
const TEMPORIZADOR = /^\d+:\d{2}\s*\/\s*\d+:\d{2}$/;

/** Un anuncio a partir de su tarjeta, o null si no se reconoce su identificador. */
export function interpretarTarjeta(t: TarjetaBruta): AnuncioBiblioteca | null {
  const lineas = t.x.replace(INVISIBLES, "").split(/\r?\n/).map((l) => l.trim());
  const k = lineas.findIndex((l) => /^(Identificador de la biblioteca|Library ID)\s*:/i.test(l));
  if (k < 0) return null;
  const id = lineas[k].match(/(\d{6,})/)?.[1];
  if (!id) return null;
  const estado = lineas.slice(Math.max(0, k - 3), k).reverse().find((l) => /^(activo|inactivo|active|inactive)$/i.test(l));
  const circulacion = lineas.slice(k + 1, k + 4).find((l) => /circulaci[oó]n/i.test(l));
  const cantidad = Math.max(1, Math.min(500, Number(t.x.match(/(\d+)\s+anuncios?\s+usan\s+este\s+contenido/i)?.[1] ?? 1)));

  // Después de «Publicidad» va el copy; antes, el nombre de la página.
  const p = lineas.findIndex((l, i) => i > k && /^(publicidad|sponsored)$/i.test(l));
  let pagina: string | null = null;
  if (p > 0) {
    for (let i = p - 1; i > k; i--) {
      if (lineas[i]) {
        pagina = lineas[i];
        break;
      }
    }
  }
  const destino = destinoDeEnlace(t.l);
  const dominio = destino ? new URL(destino).hostname.replace(/^www\./i, "").toUpperCase() : null;
  const cuerpo: string[] = [];
  if (p >= 0) {
    for (const l of lineas.slice(p + 1)) {
      if (TEMPORIZADOR.test(l) || CTA.test(l) || (dominio && l.toUpperCase() === dominio)) break;
      cuerpo.push(l);
    }
  }
  return {
    id,
    activo: !/^(inactivo|inactive)$/i.test(estado ?? "activo"),
    desde: circulacion ? fechaDe(circulacion) : null,
    pagina,
    copy: cuerpo.join("\n").trim().slice(0, 2000),
    destino,
    cantidad,
  };
}

/** Cuántos resultados dice la página («~1.100 resultados»), o null. */
export function totalDeResultados(texto: string | null | undefined): number | null {
  const m = (texto ?? "").match(/([\d][\d.,\s]*)\s+(?:resultados?|results?)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/\D/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** ¿Es el mismo copy? Se comparan las primeras letras de los dos (sin emojis, acentos ni saltos de línea). */
export function mismoCopy(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizar(a);
  const y = normalizar(b);
  const n = Math.min(x.length, y.length, COPY_MAXIMO);
  return n >= COPY_MINIMO && x.slice(0, n) === y.slice(0, n);
}

/**
 * ¿Es la misma página? Mismo nombre, o uno dentro del otro («Mundo Digital» y «Mundo Digital PA»). También sin espacios y con al menos
 * 5 letras: el usuario de Instagram `nenagosling` está dentro de la página `Nenagoslingshop` de la Biblioteca.
 */
export function mismaPagina(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizar(a);
  const y = normalizar(b);
  if (x.length === 0 || y.length === 0) return false;
  if (x === y) return true;
  if (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))) return true;
  const cx = x.replace(/ /g, "");
  const cy = y.replace(/ /g, "");
  return Math.min(cx.length, cy.length) >= 5 && (cx.includes(cy) || cy.includes(cx));
}

/**
 * Los anuncios de la lectura que son de la misma página y llevan el mismo copy que una captura.
 * - Sin copy en la captura, o sin ningún anuncio con ese copy, devuelve null (nada que anotar).
 * - Con el nombre de la página se cuentan solo los de esa página.
 * - Sin nombre, si todos los del mismo copy son de una sola página se toma esa; si hay varias no se adivina y se dice por qué.
 */
export function coincidencias(
  captura: { copy: string | null; nombrePagina: string | null; paginasAlternas?: string[] },
  anuncios: AnuncioBiblioteca[],
): { ok: CoincidenciaBiblioteca } | { motivo: string } | null {
  if (!captura.copy) return null;
  const delCopy = anuncios.filter((a) => mismoCopy(captura.copy, a.copy));
  if (delCopy.length === 0) return null;
  // El nombre con que Instagram muestra la cuenta no siempre es el de la página en la Biblioteca: además del nombre de la captura
  // sirve el que la Biblioteca tenía cuando alguien vinculó la captura a mano (`paginasAlternas`).
  const nombres = [captura.nombrePagina, ...(captura.paginasAlternas ?? [])].filter((n): n is string => !!n);
  let elegidos = delCopy;
  if (nombres.length > 0) {
    elegidos = delCopy.filter((a) => nombres.some((n) => mismaPagina(n, a.pagina)));
    if (elegidos.length === 0) return null;
  } else {
    const paginas = new Set(delCopy.map((a) => normalizar(a.pagina)));
    if (paginas.size > 1) return { motivo: `El copy está en ${paginas.size} páginas distintas: escribe el nombre de la página en la ficha y vuelve a leer la Biblioteca.` };
  }
  return { ok: resumirAnuncios(elegidos) };
}

/** Lo que se anota de un conjunto de anuncios: cuántos son (una tarjeta agrupada cuenta por todos los que reúne), activos, desde cuándo y adónde llevan. */
export function resumirAnuncios(anuncios: AnuncioBiblioteca[]): CoincidenciaBiblioteca {
  const total = anuncios.reduce((s, a) => s + a.cantidad, 0);
  const activos = anuncios.filter((a) => a.activo).reduce((s, a) => s + a.cantidad, 0);
  const fechas = anuncios.map((a) => a.desde).filter((d): d is string => !!d).sort();
  const cuenta = new Map<string, number>();
  for (const a of anuncios) if (a.destino) cuenta.set(a.destino, (cuenta.get(a.destino) ?? 0) + a.cantidad);
  return {
    pagina: anuncios.find((a) => a.pagina)?.pagina ?? null,
    total,
    activos,
    inactivos: total - activos,
    desde: fechas[0] ?? null,
    ids: anuncios.map((a) => a.id).slice(0, 50),
    destinos: [...cuenta.entries()].sort((a, b) => b[1] - a[1]).map(([url, n]) => ({ url, n })).slice(0, 5),
  };
}

/**
 * Los anuncios que el navegador manda de vuelta para vincularlos a mano a una captura: nunca se confía en su forma (los mandó una
 * página abierta en el navegador). Se descarta lo que no tenga la forma de un anuncio de la Biblioteca y se recorta lo demás.
 */
export function validarAnuncios(valor: unknown): AnuncioBiblioteca[] {
  if (!Array.isArray(valor)) return [];
  const salida: AnuncioBiblioteca[] = [];
  for (const item of valor.slice(0, MAX_TARJETAS)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || !/^\d{6,25}$/.test(o.id) || typeof o.activo !== "boolean") continue;
    let destino: string | null = null;
    if (typeof o.destino === "string" && o.destino.length <= 2000) {
      try {
        const u = new URL(o.destino);
        if (u.protocol === "https:" || u.protocol === "http:") destino = u.toString();
      } catch {
        destino = null;
      }
    }
    const cantidad = typeof o.cantidad === "number" && Number.isInteger(o.cantidad) ? Math.max(1, Math.min(500, o.cantidad)) : 1;
    salida.push({
      id: o.id,
      activo: o.activo,
      desde: typeof o.desde === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o.desde) ? o.desde : null,
      pagina: typeof o.pagina === "string" && o.pagina.trim() ? o.pagina.trim().slice(0, 200) : null,
      copy: typeof o.copy === "string" ? o.copy.slice(0, 300) : "",
      destino,
      cantidad,
    });
  }
  return salida;
}

/** Lo que llega en el fragmento de la dirección (`#d=`): el contenido en base64 seguro para direcciones. */
export interface LecturaBruta {
  v: 1;
  /** La dirección de la Biblioteca que se leyó. */
  u: string;
  /** El texto del contador de resultados («~4 resultados»). */
  r: string;
  t: TarjetaBruta[];
}

const MAX_TARJETAS = 100;

/** Valida lo que mandó el navegador: nunca se confía en su forma. Devuelve la lectura limpia o el motivo del rechazo. */
export function validarLectura(valor: unknown): { lectura: LecturaBruta } | { error: string } {
  if (!valor || typeof valor !== "object") return { error: "La lectura no es válida." };
  const v = valor as Record<string, unknown>;
  if (v.v !== 1 || typeof v.u !== "string" || !Array.isArray(v.t)) return { error: "La lectura no es válida." };
  let url: URL;
  try {
    url = new URL(v.u);
  } catch {
    return { error: "La lectura no es de la Biblioteca de anuncios." };
  }
  if (url.protocol !== "https:" || !/(^|\.)facebook\.com$/.test(url.hostname) || !url.pathname.startsWith("/ads/library")) return { error: "La lectura no es de la Biblioteca de anuncios." };
  if (v.t.length === 0) return { error: "No se leyó ningún anuncio." };
  const t: TarjetaBruta[] = [];
  for (const item of v.t.slice(0, MAX_TARJETAS)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.x !== "string") continue;
    t.push({ x: o.x.slice(0, 4000), l: typeof o.l === "string" ? o.l.slice(0, 3000) : null });
  }
  if (t.length === 0) return { error: "No se leyó ningún anuncio." };
  return { lectura: { v: 1, u: v.u.slice(0, 600), r: typeof v.r === "string" ? v.r.slice(0, 80) : "", t } };
}

/** Lo que responde el servidor al guardar una lectura: qué capturas se completaron y cuáles no. */
export interface ResultadoLecturaBiblioteca {
  error?: string;
  /** Anuncios reconocidos en la lectura (una tarjeta agrupada cuenta como una). */
  leidos?: number;
  /** Los resultados que decía la Biblioteca, si se pudo leer el contador. */
  resultados?: number | null;
  /** ¿La Biblioteca tenía más anuncios de los que se cargaron en pantalla? */
  parcial?: boolean;
  actualizadas?: { numero: number; pagina: string | null; total: number; activos: number; destinoNuevo: boolean }[];
  omitidas?: { numero: number; motivo: string }[];
  /** Los anuncios leídos que ninguna captura reconoció, para vincularlos a mano (con el copy recortado). */
  sinVincular?: AnuncioBiblioteca[];
  /** Las capturas a las que se puede vincular a mano, de la más nueva a la más vieja. */
  capturas?: CapturaParaVincular[];
}

export interface CapturaParaVincular {
  id: string;
  numero: number;
  pagina: string | null;
  copy: string | null;
}

/** El resultado de vincular a mano unos anuncios a una captura. */
export interface ResultadoVinculo {
  error?: string;
  numero?: number;
  total?: number;
  activos?: number;
  destinoNuevo?: boolean;
}
