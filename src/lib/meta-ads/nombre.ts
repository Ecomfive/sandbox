// Anuncios Meta (18 nov 2026, pedido de Alcides): Meta no sabe de «ángulos», «etapas» ni «productos»: eso vive en el nombre que el equipo le pone a la campaña. La regla que se le pide al equipo es
//   PAÍS | Producto | ÁNGULO | CBO o ABO | Puja | T, E o R        (por ejemplo «PA | Corrector | DOLOR-espalda | CBO | SINTOPE | T»)
// y aquí se lee de forma tolerante: las palabras reservadas (CBO, ABO, la puja y la etapa) se reconocen donde estén y lo demás va en orden (país de dos letras, producto, ángulo). Lo que no se
// reconoce queda en null; una persona lo corrige en la campaña. Lógica pura, con prueba.

export type Etapa = "testing" | "escala" | "retargeting";
export type Puja = "sin_tope" | "bid_cap" | "cost_cap" | "roas_min";
export type Estructura = "CBO" | "ABO";

export interface EtiquetasDeNombre {
  pais: string | null;
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

/** Lo que dice el nombre de una campaña. Sin barras, no hay nada que leer. */
export function etiquetasDeNombre(nombre: string): EtiquetasDeNombre {
  const r: EtiquetasDeNombre = { pais: null, producto: null, angulo: null, estructura: null, puja: null, etapa: null };
  const partes = String(nombre ?? "").split("|").map((p) => p.trim()).filter(Boolean);
  if (partes.length < 2) return r;
  const libres: string[] = [];
  for (const p of partes) {
    const c = claveDeTexto(p);
    if (c === "CBO" || c === "ABO") r.estructura = c;
    else if (PUJAS[c]) r.puja = PUJAS[c];
    else if (ETAPAS[c]) r.etapa = ETAPAS[c];
    else libres.push(p);
  }
  if (libres.length && /^[A-Za-z]{2}$/.test(libres[0])) r.pais = libres.shift()!.toUpperCase();
  if (libres[0]) r.producto = libres[0].charAt(0).toUpperCase() + libres[0].slice(1);
  if (libres[1]) r.angulo = embellecer(libres[1]);
  return r;
}

/** La llave con que se junta un producto con su CPA tope («Corrector», «corrector » y «CORRECTOR» son el mismo). */
export const claveDeProducto = (producto: string | null | undefined): string => claveDeTexto(producto ?? "");
