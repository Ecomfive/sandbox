/**
 * Las tiendas de un dropshipper pueden ser un nombre («Innovalabs») o el enlace de su tienda («mitienda.com», «https://instagram.com/mitienda»): un enlace
 * se guarda completo y en la ficha se abre con un clic (30 oct 2026, pedido de Alcides). Solo `http` y `https`: nada de `javascript:` ni otras direcciones
 * raras, que nunca se dibujan como enlace. Lógica pura, con prueba.
 */

/** El enlace de una tienda, listo para abrir, o `null` si lo escrito no es un enlace (es el nombre de la tienda). */
export function enlaceDeTienda(texto: string): string | null {
  const t = texto.trim();
  if (!t || /\s/.test(t)) return null;
  const conEsquema = /^https?:\/\//i.test(t) ? t : /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#]\S*)?$/i.test(t) ? `https://${t}` : null;
  if (!conEsquema) return null;
  try {
    const u = new URL(conEsquema);
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname.includes(".") || u.username || u.password) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Lo que se lee de un enlace en la ficha: el sitio sin «www.» y su ruta, sin «https://» («instagram.com/mitienda»), recortado. */
export function nombreDeEnlace(enlace: string, max = 40): string {
  try {
    const u = new URL(enlace);
    const ruta = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    const texto = `${u.hostname.replace(/^www\./, "")}${ruta}`;
    return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
  } catch {
    return enlace;
  }
}

/** Cada tienda escrita, con su enlace completo si es un enlace y tal cual si es un nombre. */
export const tiendaGuardada = (texto: string) => enlaceDeTienda(texto) ?? texto.trim();
