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
 * Si una ruta del almacenamiento que manda el navegador (o que viene de un dato guardado) se queda dentro de su carpeta. La librería de
 * Supabase pone la ruta tal cual dentro de la dirección del pedido, y al armar esa dirección los puntos codificados y la barra invertida
 * cuentan como «subir un nivel»: con la clave de servicio, una ruta así podría salir del bucket. Por eso no alcanza con revisar que empiece
 * con la carpeta y no tenga «..»: también se rechaza lo codificado que pueda ser punto o barra, «?», «#» y los tramos vacíos.
 */
export function rutaEnCarpeta(ruta: unknown, carpeta: string, max = 300): ruta is string {
  if (typeof ruta !== "string" || ruta.length > max || !ruta.startsWith(carpeta) || ruta.length === carpeta.length) return false;
  if (/[\\?#\u0000-\u001f]/.test(ruta) || /%(2e|2f|5c)/i.test(ruta) || ruta.includes("//") || ruta.startsWith("/")) return false;
  return ruta.split("/").every((tramo) => tramo !== "." && tramo !== "..");
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
