// Cómo se hablan las piezas de las notas de Anuncios Meta en el navegador (26 nov 2026): el botón flotante, el ícono de la barra de arriba y «Anotar» en cada sugerencia.
// Viven en partes distintas de la página, así que se avisan con eventos de la ventana. Lo oculto y la posición del botón se recuerdan en el navegador de cada persona.

export const EVENTO_ABRIR = "notas-meta:abrir";
export const EVENTO_ALTERNAR = "notas-meta:alternar";
export const EVENTO_OCULTO = "notas-meta:oculto";
export const LLAVE_OCULTO = "notas-meta:oculto";
export const LLAVE_POSICION = "notas-meta:posicion";

/** De qué sugerencia sale la nota que se va a escribir. */
export interface OrigenNota {
  clave: string;
  texto: string;
}

/** Abre el panel de notas (lo vuelve a mostrar si estaba oculto); con `origen`, para anotar esa sugerencia. */
export function abrirNotas(origen?: OrigenNota) {
  window.dispatchEvent(new CustomEvent<OrigenNota | undefined>(EVENTO_ABRIR, { detail: origen }));
}

export function leerOculto(): boolean {
  try {
    return localStorage.getItem(LLAVE_OCULTO) === "1";
  } catch {
    return false;
  }
}

/** Para `useSyncExternalStore`: avisa cuando cambia lo oculto (aquí o en otra pestaña). */
export function suscribirOculto(avisar: () => void) {
  window.addEventListener(EVENTO_OCULTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO_OCULTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

export function guardarOculto(oculto: boolean) {
  try {
    if (oculto) localStorage.setItem(LLAVE_OCULTO, "1");
    else localStorage.removeItem(LLAVE_OCULTO);
  } catch {
    // Sin almacenamiento (modo privado): vale solo para esta visita.
  }
  window.dispatchEvent(new CustomEvent<boolean>(EVENTO_OCULTO, { detail: oculto }));
}

/** La posición del botón: distancia al borde derecho y al de abajo (así sigue en su esquina si cambia el tamaño de la ventana). */
export interface Posicion {
  derecha: number;
  abajo: number;
}

export const POSICION_INICIAL: Posicion = { derecha: 24, abajo: 24 };

export function leerPosicion(): Posicion {
  try {
    const p = JSON.parse(localStorage.getItem(LLAVE_POSICION) ?? "null") as Posicion | null;
    if (p && Number.isFinite(p.derecha) && Number.isFinite(p.abajo)) return p;
  } catch {
    // Valor dañado: se usa la esquina de siempre.
  }
  return POSICION_INICIAL;
}

export function guardarPosicion(p: Posicion) {
  try {
    localStorage.setItem(LLAVE_POSICION, JSON.stringify(p));
  } catch {
    // Sin almacenamiento: no se recuerda.
  }
}

/** Deja el botón (de `tam` px) dentro de la ventana, con un margen. */
export function ajustarPosicion(p: Posicion, ancho: number, alto: number, tam = 44, margen = 8): Posicion {
  const lim = (v: number, max: number) => Math.min(Math.max(v, margen), Math.max(margen, max - tam - margen));
  return { derecha: lim(p.derecha, ancho), abajo: lim(p.abajo, alto) };
}
