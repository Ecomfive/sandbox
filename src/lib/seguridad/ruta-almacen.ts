/**
 * La ruta dentro del bucket de una URL pública, solo si es de la carpeta propia del módulo (`compras/…`, `filtros/…`). Sirve para borrar sin riesgo una foto reemplazada: la URL guardada viene del navegador, y
 * antes bastaba con que fuera del bucket para borrarla, así que se podía borrar la foto de un producto o de otra ficha.
 * Devuelve `null` si la URL no es de esa carpeta, trae `..` o no tiene la forma esperada.
 */
export function rutaPropia(url: string | null | undefined, prefijoPublico: string, carpeta: string): string | null {
  if (!url || !url.startsWith(prefijoPublico)) return null;
  const ruta = url.slice(prefijoPublico.length);
  if (ruta.includes("..") || ruta.includes("\\")) return null;
  if (!ruta.startsWith(`${carpeta}/`) || ruta.length <= carpeta.length + 1) return null;
  // Solo caracteres de ruta seguros (las fotos de ClickUp viven en subcarpetas: compras/clickup/<id>/…).
  if (!/^[A-Za-z0-9._/-]+$/.test(ruta) || ruta.includes("//")) return null;
  return ruta;
}

/**
 * El nombre de un archivo subido, listo para ir dentro de una ruta del almacenamiento: sin acentos, sin «/», «\» ni «..», y
 * solo letras, números, «.», «_» y «-» (el nombre lo manda el navegador).
 */
export function nombreArchivoSeguro(nombre: string | null | undefined, porDefecto = "archivo"): string {
  const limpio = String(nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.-]+/, "")
    .slice(-120);
  return limpio || porDefecto;
}

/** Un id con forma de UUID (para no armar rutas ni consultas con lo que mande el navegador). */
export const esUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
