/**
 * Códigos de barras de los productos (EAN-8, UPC-A, EAN-13 y GTIN-14): validación con el dígito de control GS1 y el dibujo
 * (SVG) de los de tipo EAN. Sin dependencias de servidor a propósito: lo usan las acciones, la ficha y las pruebas.
 *
 * Los códigos INTERNOS que genera el sistema son EAN-13 con prefijo 20 (el estándar GS1 reserva del 20 al 29 para uso interno),
 * así que no chocan con ningún código de fabricante.
 */

/** Los largos que acepta un código de barras de producto. */
export const LARGOS_VALIDOS = [8, 12, 13, 14] as const;

/** Dígito de control GS1 de una base numérica (sin el dígito de control): empezando por la derecha pesan 3, 1, 3, 1… */
export function digitoControl(base: string): number {
  let suma = 0;
  for (let i = 0; i < base.length; i++) {
    suma += Number(base[base.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (suma % 10)) % 10;
}

/** Limpia lo que escribe o escanea una persona: solo deja los números. */
export function normalizarCodigoBarras(texto: string | null | undefined): string {
  return String(texto ?? "").replace(/\D/g, "");
}

/** Es un EAN-8, UPC-A, EAN-13 o GTIN-14 con su dígito de control correcto. */
export function esCodigoBarrasValido(codigo: string): boolean {
  if (!/^\d+$/.test(codigo) || !(LARGOS_VALIDOS as readonly number[]).includes(codigo.length)) return false;
  return digitoControl(codigo.slice(0, -1)) === Number(codigo[codigo.length - 1]);
}

/** Los códigos que genera el sistema: EAN-13 con prefijo 20. */
export function esCodigoInterno(codigo: string): boolean {
  return codigo.length === 13 && codigo.startsWith("20") && esCodigoBarrasValido(codigo);
}

// --- Dibujo (EAN-13 y EAN-8) ---------------------------------------------------------------------------------------------

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const R = L.map((c) => [...c].map((b) => (b === "0" ? "1" : "0")).join(""));
const G = R.map((c) => [...c].reverse().join(""));
// Cómo se codifican los seis dígitos de la izquierda de un EAN-13, según su primer dígito (L o G).
const PARIDAD = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

/** Los módulos (1 = barra, 0 = espacio) de un EAN-13 o EAN-8; un UPC-A (12) se dibuja como EAN-13 con un 0 delante. */
export function modulosEan(codigo: string): string | null {
  let c = codigo;
  if (c.length === 12) c = `0${c}`;
  if (!esCodigoBarrasValido(c) || (c.length !== 13 && c.length !== 8)) return null;
  const d = [...c].map(Number);
  if (c.length === 8) {
    return `101${d.slice(0, 4).map((x) => L[x]).join("")}01010${d.slice(4).map((x) => R[x]).join("")}101`;
  }
  const paridad = PARIDAD[d[0]];
  const izquierda = d.slice(1, 7).map((x, i) => (paridad[i] === "L" ? L[x] : G[x])).join("");
  const derecha = d.slice(7).map((x) => R[x]).join("");
  return `101${izquierda}01010${derecha}101`;
}

/** El código dibujado como SVG (barras negras sobre fondo blanco, con los números debajo), o null si no es un EAN dibujable. */
export function svgCodigoBarras(codigo: string, opciones: { modulo?: number; alto?: number } = {}): string | null {
  const modulos = modulosEan(codigo);
  if (!modulos) return null;
  const modulo = opciones.modulo ?? 2;
  const alto = opciones.alto ?? 60;
  const margen = 10 * modulo;
  const ancho = modulos.length * modulo + margen * 2;
  let barras = "";
  let i = 0;
  while (i < modulos.length) {
    if (modulos[i] === "1") {
      let j = i;
      while (j < modulos.length && modulos[j] === "1") j++;
      barras += `<rect x="${margen + i * modulo}" y="0" width="${(j - i) * modulo}" height="${alto}"/>`;
      i = j;
    } else i++;
  }
  const mostrado = codigo.length === 12 ? `0${codigo}` : codigo;
  const alturaTotal = alto + 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alturaTotal}" width="${ancho}" height="${alturaTotal}" role="img" aria-label="Código de barras ${mostrado}"><rect width="${ancho}" height="${alturaTotal}" fill="#fff"/><g fill="#000">${barras}</g><text x="${ancho / 2}" y="${alto + 12}" font-family="monospace" font-size="12" text-anchor="middle" fill="#000">${mostrado}</text></svg>`;
}
