// Anuncios Meta (18 nov 2026, pedido de Alcides): Meta no sabe de «etapas», «productos» ni «personas»: eso vive en el nombre que el equipo le pone a la campaña. Se leen dos formas, la primera que encaje:
//   1. La de ustedes (la que usa el equipo hoy):  PRODUCTO | ALL PA | CBO TEST | RT V1 AL V5 | ARIANNY
//      producto · audiencia y país · estructura y etapa juntas · la tanda de videos (RT = retargeting: manda sobre el TEST) · la persona que la montó.
//   2. La general:  PAÍS | Producto | ÁNGULO | CBO o ABO | Puja | T, E o R   (las palabras reservadas se reconocen donde estén).
// El ángulo no va en el nombre de ustedes: sale del video y del texto del anuncio (o se corrige a mano). Lo que no se reconoce queda en null y una persona lo corrige en la campaña. Lógica pura, con prueba.

export type Etapa = "testing" | "escala" | "retargeting";
export type Puja = "sin_tope" | "bid_cap" | "cost_cap" | "roas_min";
export type Estructura = "CBO" | "ABO";

export interface EtiquetasDeNombre {
  pais: string | null;
  /** «ALL PA»: a quién se le muestra (ALL = todo el país). */
  mercado: string | null;
  /** La tanda de videos que lleva: «RT V1 AL V5». */
  videos: string | null;
  /** Quién montó la campaña, según el nombre («Arianny»). */
  persona: string | null;
  producto: string | null;
  angulo: string | null;
  estructura: Estructura | null;
  puja: Puja | null;
  etapa: Etapa | null;
}

export const NOMBRE_ETAPA: Record<Etapa, string> = { testing: "Testing", escala: "Escala", retargeting: "Retargeting" };
export const NOMBRE_PUJA: Record<Puja, string> = { sin_tope: "Sin tope", bid_cap: "Bid cap", cost_cap: "Cost cap", roas_min: "ROAS mínimo" };

/** Mayúsculas, sin acentos ni signos: «Dolor-espalda» → «DOLORESPALDA». */
export const claveDeTexto = (t: string): string => t.normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

const ETAPAS: Record<string, Etapa> = { T: "testing", TEST: "testing", TESTING: "testing", E: "escala", ESC: "escala", ESCALA: "escala", SCALE: "escala", R: "retargeting", RT: "retargeting", RETARGET: "retargeting", RETARGETING: "retargeting", RETARGETEO: "retargeting" };
const PUJAS: Record<string, Puja> = { SINTOPE: "sin_tope", LOWESTCOST: "sin_tope", BIDCAP: "bid_cap", COSTCAP: "cost_cap", ROASMIN: "roas_min", MINROAS: "roas_min" };

/** «DOLOR-espalda» → «Dolor espalda»; «dolor_de_espalda» → «Dolor de espalda». */
export function embellecer(t: string): string {
  const limpio = t.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return limpio ? limpio.charAt(0).toUpperCase() + limpio.slice(1).toLowerCase() : "";
}

const VACIAS: EtiquetasDeNombre = { pais: null, mercado: null, videos: null, persona: null, producto: null, angulo: null, estructura: null, puja: null, etapa: null };

const RE_VIDEOS = /^(?:(?:RT|RETEST|RETESTEO)\s+)?V\s?\d{1,3}(?:\s*(?:AL|A|-|–)\s*V?\s?\d{1,3})?$/i;
const RE_MERCADO = /^(?:ALL\s+)?([A-Za-z]{2})$/i;
const mayuscula = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** Las palabras de un trozo que son reservadas (CBO, ABO, puja y etapa); si todas lo son, el trozo se consume. */
function leerReservadas(trozo: string, r: EtiquetasDeNombre, soloSiTodas: boolean): boolean {
  const palabras = trozo.split(/\s+/).filter(Boolean);
  const claves = palabras.map((w) => claveDeTexto(w));
  const esReservada = (c: string) => c === "CBO" || c === "ABO" || !!PUJAS[c] || !!ETAPAS[c];
  // Dos palabras seguidas: «SIN TOPE», «COST CAP», «BID CAP».
  const juntas = claveDeTexto(trozo);
  if (PUJAS[juntas]) {
    r.puja = PUJAS[juntas];
    return true;
  }
  if (soloSiTodas && !claves.every(esReservada)) return false;
  let alguna = false;
  for (const c of claves) {
    if (c === "CBO" || c === "ABO") r.estructura = c;
    else if (PUJAS[c]) r.puja = PUJAS[c];
    else if (ETAPAS[c]) r.etapa = ETAPAS[c];
    else continue;
    alguna = true;
  }
  return alguna;
}

/** Lo que dice el nombre de una campaña. Sin barras, no hay nada que leer. */
export function etiquetasDeNombre(nombre: string): EtiquetasDeNombre {
  const r: EtiquetasDeNombre = { ...VACIAS };
  const partes = String(nombre ?? "").split("|").map((p) => p.trim()).filter(Boolean);
  if (partes.length < 2) return r;
  const libres: string[] = [];
  let hayFormatoPropio = false;
  let viaRetargeting = false;
  for (const p of partes) {
    if (RE_VIDEOS.test(p)) {
      r.videos = p.toUpperCase().replace(/\s+/g, " ");
      // «RT V1 AL V5»: RT es retargeting (así lo confirmó el equipo) y manda sobre el TEST de «CBO TEST»: es la prueba de esos videos con público que ya visitó.
      if (/^RT\s/i.test(p)) viaRetargeting = true;
      hayFormatoPropio = true;
    } else if (/^ALL\s+[A-Za-z]{2}$/i.test(p)) {
      r.mercado = p.toUpperCase().replace(/\s+/g, " ");
      r.pais = r.mercado.slice(-2);
      hayFormatoPropio = true;
    } else {
      const t: EtiquetasDeNombre = { ...VACIAS };
      if (!leerReservadas(p, t, true)) {
        libres.push(p);
        continue;
      }
      // «CBO TEST» (estructura y etapa juntas) es la forma de ustedes; «CBO», «T» o «Bid cap» solos, la general.
      if (t.estructura && t.etapa) hayFormatoPropio = true;
      r.estructura = t.estructura ?? r.estructura;
      r.etapa = t.etapa ?? r.etapa;
      r.puja = t.puja ?? r.puja;
    }
  }
  if (viaRetargeting) r.etapa = "retargeting";
  if (hayFormatoPropio) {
    // Producto primero; la persona es el último trozo libre, si hay más de uno. El ángulo no va en el nombre.
    if (libres[0]) r.producto = mayuscula(libres[0]);
    if (libres.length > 1) r.persona = embellecer(libres[libres.length - 1]);
    return r;
  }
  if (libres.length && RE_MERCADO.test(libres[0])) {
    r.pais = libres.shift()!.toUpperCase();
    r.mercado = r.pais;
  }
  if (libres[0]) r.producto = mayuscula(libres[0]);
  if (libres[1]) r.angulo = embellecer(libres[1]);
  return r;
}

/** La llave con que se junta un producto con su CPA tope («Corrector», «corrector » y «CORRECTOR» son el mismo). */
export const claveDeProducto = (producto: string | null | undefined): string => claveDeTexto(producto ?? "");

/** «V3» del nombre de un anuncio («ARIANNY V3 | oferta»): el número del video dentro de su tanda; null si el nombre no lo dice. */
export function numeroDeVideo(texto: string): string | null {
  const m = /(?:^|[^A-Za-z0-9])V\s?(\d{1,3})(?![A-Za-z0-9])/i.exec(texto);
  return m ? `V${m[1]}` : null;
}
