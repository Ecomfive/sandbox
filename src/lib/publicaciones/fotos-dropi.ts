// Fotos de cada publicación copiadas de Dropi (migración 0153, 25 oct 2026). La lectura diaria de «Mis productos» trae la galería de cada
// producto; esto decide qué fotos bajar y qué cambiar de las ya copiadas. Lógica pura, con prueba (fotos-dropi.test.ts).
// **Una foto es una sola aunque Dropi la liste varias veces** (28 oct 2026, PUB-0446: 17 «Principal» iguales): Dropi le antepone un
// número de subida al nombre cada vez que se sube, así que el nombre exacto no sirve de llave; se compara con `claveFoto`.
// **Y por su contenido** (28 oct 2026): las 17 de PUB-0446 tenían 17 nombres al azar distintos (`b0e865aa-….png`) y eran el mismo archivo,
// así que el nombre tampoco basta. La copia del sistema se guarda con la huella de su contenido (md5) como nombre de archivo
// (`rutaFotoDropi`): dos fotos iguales caen en el mismo archivo y comparten `ruta`, y `unaPorFoto` las muestra y las sube una sola vez.

import { claveFoto, fotosParaCopiar } from "./republicar-dropi";

export interface FotoGaleria {
  /** El nombre del archivo en Dropi: identifica la foto. */
  nombre: string;
  url: string;
  /** La misma foto en otras direcciones del CDN, por si la primera no se deja bajar. */
  alternas: string[];
  principal: boolean;
  orden: number;
}

export interface FotoGuardada {
  nombre: string;
  principal: boolean;
  orden: number;
  enDropi: boolean;
  /** Dónde está la copia en Storage (para borrarla junto con una repetida). */
  ruta?: string;
}

/** La galería de un producto de Dropi (sin las fotos de sus variaciones), la principal primero y cada foto una sola vez. */
export function galeriaDeProducto(producto: Record<string, unknown>, pais?: string): FotoGaleria[] {
  const vistos = new Set<string>();
  return fotosParaCopiar(producto, pais)
    .filter((f) => !vistos.has(claveFoto(f.nombre)) && vistos.add(claveFoto(f.nombre)))
    .map((f, i) => ({ nombre: f.nombre, url: f.url, alternas: f.alternas, principal: f.main, orden: i }));
}

/**
 * De las copias guardadas, cuál se queda por cada foto y cuáles sobran. Se queda la que Dropi lista hoy con ese nombre; si no, la que sigue
 * en Dropi, la principal, la de menor orden y, a igualdad, el nombre más corto (la del primer número).
 */
export function repetidasDe(guardadas: FotoGuardada[], enGaleria: Set<string> = new Set()) {
  const grupos = new Map<string, FotoGuardada[]>();
  for (const g of guardadas) grupos.set(claveFoto(g.nombre), [...(grupos.get(claveFoto(g.nombre)) ?? []), g]);
  const conservar = new Map<string, FotoGuardada>();
  const repetidas: FotoGuardada[] = [];
  for (const [clave, grupo] of grupos) {
    const orden = [...grupo].sort(
      (a, b) =>
        Number(enGaleria.has(b.nombre)) - Number(enGaleria.has(a.nombre)) ||
        Number(b.enDropi) - Number(a.enDropi) ||
        Number(b.principal) - Number(a.principal) ||
        a.orden - b.orden ||
        a.nombre.length - b.nombre.length ||
        a.nombre.localeCompare(b.nombre),
    );
    conservar.set(clave, orden[0]);
    repetidas.push(...orden.slice(1));
  }
  return { conservar, repetidas };
}

/** Las copias de Storage que se pueden borrar al quitar las repetidas: las que ninguna foto conservada usa. */
export function rutasSinUso(repetidas: FotoGuardada[], conservadas: Iterable<FotoGuardada>): string[] {
  const enUso = new Set([...conservadas].map((g) => g.ruta).filter(Boolean));
  return [...new Set(repetidas.map((g) => g.ruta).filter((r): r is string => !!r && !enUso.has(r)))];
}

/**
 * Qué hacer con la galería de Dropi frente a lo ya copiado: las fotos que faltan se bajan; las copiadas se ponen al día (principal,
 * orden, de nuevo en Dropi); las que Dropi ya no lista quedan marcadas fuera de Dropi (la copia se conserva) y las copias repetidas de
 * una misma foto se quitan.
 */
export function planFotos(galeria: FotoGaleria[], guardadas: FotoGuardada[]) {
  const enGaleria = new Set(galeria.map((f) => f.nombre));
  const { conservar, repetidas } = repetidasDe(guardadas, enGaleria);
  const clavesGaleria = new Set(galeria.map((f) => claveFoto(f.nombre)));
  return {
    bajar: galeria.filter((f) => !conservar.has(claveFoto(f.nombre))),
    actualizar: galeria
      .map((f) => ({ f, g: conservar.get(claveFoto(f.nombre)) }))
      .filter(({ f, g }) => !!g && (g.principal !== f.principal || g.orden !== f.orden || !g.enDropi))
      .map(({ f, g }) => ({ nombre: g!.nombre, principal: f.principal, orden: f.orden })),
    fuera: [...conservar.entries()].filter(([clave, g]) => g.enDropi && !clavesGaleria.has(clave)).map(([, g]) => g.nombre),
    repetidas: repetidas.map((g) => g.nombre),
    rutasBorrar: rutasSinUso(repetidas, conservar.values()),
  };
}

/**
 * Dónde queda la copia en el bucket `wms-productos`: la carpeta de la publicación y, de nombre, la huella md5 de su contenido. La misma
 * foto con otro nombre en Dropi cae en el mismo archivo (no se guarda dos veces) y las filas que la usan comparten `ruta`.
 */
export function rutaFotoDropi(publicacionId: string, huella: string, extension: string): string {
  const base = huella.toLowerCase().replace(/[^0-9a-f]/g, "").slice(0, 64) || "foto";
  return `publicaciones/${publicacionId}/dropi/${base}.${extension.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

/**
 * Cada foto una sola vez, en el orden en que vienen (la primera se queda): dos filas son la misma foto si comparten el archivo de Storage
 * (`ruta`, que con `rutaFotoDropi` es su contenido) o la `claveFoto` de su nombre. Para la sección «Fotos» de la ficha y para republicar.
 */
export function unaPorFoto<T extends { nombre: string; ruta?: string | null }>(fotos: T[]): T[] {
  const vistas = new Set<string>();
  return fotos.filter((f) => {
    const claves = [`n:${claveFoto(f.nombre)}`, ...(f.ruta ? [`r:${f.ruta}`] : [])];
    const repetida = claves.some((c) => vistas.has(c));
    for (const c of claves) vistas.add(c);
    return !repetida;
  });
}

/**
 * Para limpiar las copias de antes (`scripts/limpiar-fotos-duplicadas.ts`), con la huella md5 de cada archivo (la que da Storage; `null`
 * si no se sabe): los archivos de una publicación con el mismo contenido se juntan en uno con su huella de nombre. `mover` lleva un
 * archivo a ese nombre (si ninguno lo tiene ya), `cambiarRuta` apunta las filas al archivo que queda y `borrar` son las copias que sobran.
 * Las filas no se borran: siguen siendo las fotos que Dropi lista, y la lectura diaria no las vuelve a bajar.
 */
export function planUnificar(publicacionId: string, filas: { nombre: string; ruta: string | null }[], huellaDe: Map<string, string | null>) {
  const grupos = new Map<string, string[]>();
  for (const f of filas) {
    const h = f.ruta ? huellaDe.get(f.ruta) : null;
    if (!f.ruta || !h) continue;
    const rutas = grupos.get(h) ?? [];
    if (!rutas.includes(f.ruta)) rutas.push(f.ruta);
    grupos.set(h, rutas);
  }
  const mover: { desde: string; hacia: string }[] = [];
  const borrar: string[] = [];
  const destino = new Map<string, string>();
  for (const [h, rutas] of grupos) {
    const extension = (rutas[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? "jpg").toLowerCase();
    const hacia = rutas.find((r) => r.endsWith(`/${h}.${r.split(".").pop()}`)) ?? rutaFotoDropi(publicacionId, h, extension);
    const desde = rutas.includes(hacia) ? hacia : rutas[0];
    if (desde !== hacia) mover.push({ desde, hacia });
    borrar.push(...rutas.filter((r) => r !== desde && r !== hacia));
    for (const r of rutas) destino.set(r, hacia);
  }
  const cambiarRuta = filas.filter((f) => f.ruta && destino.has(f.ruta) && destino.get(f.ruta) !== f.ruta).map((f) => ({ nombre: f.nombre, ruta: destino.get(f.ruta!)! }));
  return { mover, borrar, cambiarRuta, distintas: grupos.size + filas.filter((f) => !f.ruta || !huellaDe.get(f.ruta)).length };
}
