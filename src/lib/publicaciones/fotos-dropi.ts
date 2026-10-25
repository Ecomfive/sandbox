// Fotos de cada publicación copiadas de Dropi (migración 0153, 25 oct 2026). La lectura diaria de «Mis productos» trae la galería de cada
// producto; esto decide qué fotos bajar y qué cambiar de las ya copiadas. Lógica pura, con prueba (fotos-dropi.test.ts).

import { fotosParaCopiar } from "./republicar-dropi";

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
}

/** La galería de un producto de Dropi (sin las fotos de sus variaciones), la principal primero. */
export function galeriaDeProducto(producto: Record<string, unknown>, pais?: string): FotoGaleria[] {
  const vistos = new Set<string>();
  return fotosParaCopiar(producto, pais)
    .filter((f) => !vistos.has(f.nombre) && vistos.add(f.nombre))
    .map((f, i) => ({ nombre: f.nombre, url: f.url, alternas: f.alternas, principal: f.main, orden: i }));
}

/**
 * Qué hacer con la galería de Dropi frente a lo ya copiado: las fotos que faltan se bajan; las copiadas se ponen al día (principal,
 * orden, de nuevo en Dropi); las que Dropi ya no lista quedan marcadas fuera de Dropi (la copia se conserva).
 */
export function planFotos(galeria: FotoGaleria[], guardadas: FotoGuardada[]) {
  const porNombre = new Map(guardadas.map((g) => [g.nombre, g]));
  const enGaleria = new Set(galeria.map((f) => f.nombre));
  return {
    bajar: galeria.filter((f) => !porNombre.has(f.nombre)),
    actualizar: galeria
      .filter((f) => {
        const g = porNombre.get(f.nombre);
        return !!g && (g.principal !== f.principal || g.orden !== f.orden || !g.enDropi);
      })
      .map((f) => ({ nombre: f.nombre, principal: f.principal, orden: f.orden })),
    fuera: guardadas.filter((g) => g.enDropi && !enGaleria.has(g.nombre)).map((g) => g.nombre),
  };
}

/** Dónde queda la copia en el bucket `wms-productos`: la carpeta de la publicación, sin caracteres raros en el nombre. */
export function rutaFotoDropi(publicacionId: string, nombre: string, extension: string): string {
  const base = nombre.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[.-]+|[.-]+$/g, "").slice(0, 80) || "foto";
  return `publicaciones/${publicacionId}/dropi/${base}.${extension}`;
}
