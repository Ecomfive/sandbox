// Fotos de cada publicación copiadas de Dropi (migración 0153, 25 oct 2026). La lectura diaria de «Mis productos» trae la galería de cada
// producto; esto decide qué fotos bajar y qué cambiar de las ya copiadas. Lógica pura, con prueba (fotos-dropi.test.ts).
// **Una foto es una sola aunque Dropi la liste varias veces** (28 oct 2026, PUB-0446: 17 «Principal» iguales): Dropi le antepone un
// número de subida al nombre cada vez que se sube, así que el nombre exacto no sirve de llave; se compara con `claveFoto`.

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

/** Dónde queda la copia en el bucket `wms-productos`: la carpeta de la publicación, sin caracteres raros en el nombre. */
export function rutaFotoDropi(publicacionId: string, nombre: string, extension: string): string {
  const base = nombre.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "").slice(0, 80) || "foto";
  return `publicaciones/${publicacionId}/dropi/${base}.${extension}`;
}
