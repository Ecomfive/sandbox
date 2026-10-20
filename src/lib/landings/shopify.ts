// La landing en Shopify (21 oct 2026): el producto (borrador o activo) con sus fotos, su precio y sus ofertas como variantes,
// y la landing como descripción del producto (funciona con cualquier tema, sin tocarlo). Sin red, para poder probarlo; las
// llamadas viven en `shopify-api.ts` (solo servidor).

import type { ContenidoLanding, EspacioImagen } from "./landing";
import { ESPACIOS_IMAGEN } from "./landing";

/** Lo que se guarda en `landings.shopify` tras crear o actualizar el producto. */
export interface DatosShopify {
  tienda: string;
  productoId: string;
  handle: string;
  /** Cada espacio de imagen con su foto en Shopify y la ruta de la que salió (si cambia la ruta, se sube de nuevo). */
  medios: Partial<Record<EspacioImagen, { mediaId: string; ruta: string; url: string | null }>>;
  /** La dirección pública del producto en la tienda. */
  url: string;
  adminUrl: string;
  sincronizadoEn: string;
  publicadoEn?: string | null;
}

export interface OfertaShopify {
  nombre: string;
  unidades: number;
  /** En la moneda de la tienda. */
  precio: number | null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const conTexto = (s: string) => s.trim().length > 0;

const ESTILO_IMG = "width:100%;height:auto;border-radius:12px;margin:12px 0;";

/**
 * La landing como HTML para la descripción del producto, en el orden y con los bloques visibles que se eligieron. La portada
 * (titular, precio y botón) la pone el tema de la tienda: aquí van el subtítulo y el resto. Todo el texto va escapado.
 */
export function htmlDescripcion(datos: { nombre: string; contenido: ContenidoLanding; imagenes: Partial<Record<EspacioImagen, string | null>>; ofertas: OfertaShopify[]; formato: (n: number) => string }): string {
  const c = datos.contenido;
  const img = (clave: EspacioImagen, alt: string) => (datos.imagenes[clave] ? `<img src="${esc(datos.imagenes[clave]!)}" alt="${esc(alt)}" style="${ESTILO_IMG}">` : "");
  const partes: string[] = [];
  for (const s of c.secciones.filter((x) => x.visible)) {
    switch (s.clave) {
      case "portada":
        if (conTexto(c.subtitulo)) partes.push(`<p><strong>${esc(c.subtitulo)}</strong></p>`);
        break;
      case "beneficios": {
        const bs = c.beneficios.filter((b) => conTexto(b.titulo));
        if (!bs.length && !datos.imagenes.detalle) break;
        partes.push(
          `<h2>Por qué te va a encantar</h2>${bs.length ? `<ul>${bs.map((b) => `<li><strong>${esc(b.titulo)}</strong>${conTexto(b.detalle) ? `: ${esc(b.detalle)}` : ""}</li>`).join("")}</ul>` : ""}${img("detalle", `Detalle de ${datos.nombre}`)}`,
        );
        break;
      }
      case "en_uso":
        partes.push(img("en_uso", `${datos.nombre} en uso`));
        break;
      case "variantes":
        if (datos.imagenes.variantes) partes.push(`<h2>Elige el tuyo</h2>${img("variantes", `Variantes de ${datos.nombre}`)}`);
        break;
      case "ofertas": {
        const os = datos.ofertas.filter((o) => o.precio !== null);
        if (os.length > 1) partes.push(`<h2>Aprovecha la oferta</h2><ul>${os.map((o) => `<li><strong>${esc(o.nombre)}</strong> (${o.unidades} ${o.unidades === 1 ? "unidad" : "unidades"}): ${esc(datos.formato(o.precio!))}</li>`).join("")}</ul>`);
        break;
      }
      case "comparativa": {
        const fs = c.comparativa.filter((f) => conTexto(f.texto));
        if (fs.length)
          partes.push(
            `<h2>${esc(datos.nombre)} vs. lo de siempre</h2><table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;"></th><th>${esc(datos.nombre)}</th><th>Otros</th></tr></thead><tbody>${fs
              .map((f) => `<tr><td>${esc(f.texto)}</td><td style="text-align:center;">✓</td><td style="text-align:center;">✕</td></tr>`)
              .join("")}</tbody></table>`,
          );
        break;
      }
      case "resenas": {
        const rs = c.resenas.filter((r) => conTexto(r.texto));
        if (rs.length) partes.push(`<h2>Lo que dicen nuestros clientes</h2>${rs.map((r) => `<blockquote><p>${esc(r.texto)}</p><p><em>${esc([r.nombre, r.ciudad].filter(conTexto).join(" · "))}</em></p></blockquote>`).join("")}`);
        break;
      }
      case "preguntas": {
        const ps = c.preguntas.filter((p) => conTexto(p.pregunta));
        if (ps.length) partes.push(`<h2>Preguntas frecuentes</h2>${ps.map((p) => `<p><strong>${esc(p.pregunta)}</strong><br>${esc(p.respuesta)}</p>`).join("")}`);
        break;
      }
      case "garantia":
        if (conTexto(c.garantia) || datos.imagenes.empaque) partes.push(`<h2>Compra sin riesgo</h2>${conTexto(c.garantia) ? `<p>${esc(c.garantia)}</p>` : ""}${img("empaque", `Empaque de ${datos.nombre}`)}`);
        break;
    }
  }
  return partes.filter(Boolean).join("\n");
}

/** Las variantes: una por oferta con precio (opción «Oferta») o, sin ofertas, la única variante con el precio de la landing. */
export function variantesShopify(datos: { precio: number; precioTachado: number | null; ofertas: OfertaShopify[] }) {
  const tachado = (precio: number) => (datos.precioTachado !== null && datos.precioTachado > precio ? datos.precioTachado.toFixed(2) : null);
  const conPrecio = datos.ofertas.filter((o) => o.precio !== null && o.nombre.trim());
  const nombres = new Set<string>();
  const unicas = conPrecio.filter((o) => {
    const n = o.nombre.trim().toLowerCase();
    if (nombres.has(n)) return false;
    nombres.add(n);
    return true;
  });
  if (unicas.length >= 2)
    return {
      productOptions: [{ name: "Oferta", values: unicas.map((o) => ({ name: o.nombre.trim() })) }],
      // El precio tachado solo tiene sentido en la primera (la de una unidad); en las demás el ahorro ya va en el precio.
      variants: unicas.map((o, i) => ({ optionValues: [{ optionName: "Oferta", name: o.nombre.trim() }], price: o.precio!.toFixed(2), compareAtPrice: i === 0 ? tachado(o.precio!) : null, inventoryPolicy: "CONTINUE" })),
    };
  return {
    productOptions: [{ name: "Title", values: [{ name: "Default Title" }] }],
    variants: [{ optionValues: [{ optionName: "Title", name: "Default Title" }], price: datos.precio.toFixed(2), compareAtPrice: tachado(datos.precio), inventoryPolicy: "CONTINUE" }],
  };
}

/**
 * Las fotos del producto, en orden (la portada primero). Una que ya está en Shopify y no cambió va por su id (se conserva);
 * una nueva o cambiada va por su dirección (Shopify la descarga).
 */
export function archivosShopify(
  imagenes: Partial<Record<EspacioImagen, { ruta: string; url: string } | null>>,
  previos: DatosShopify["medios"] | undefined,
  nombre: string,
): { espacio: EspacioImagen; entrada: { id: string } | { originalSource: string; contentType: "IMAGE"; alt: string } }[] {
  const salida: ReturnType<typeof archivosShopify> = [];
  for (const e of ESPACIOS_IMAGEN) {
    const img = imagenes[e.clave];
    if (!img) continue;
    const previo = previos?.[e.clave];
    salida.push({ espacio: e.clave, entrada: previo && previo.ruta === img.ruta ? { id: previo.mediaId } : { originalSource: img.url, contentType: "IMAGE", alt: `${nombre} · ${e.etiqueta}` } });
  }
  return salida;
}

/** El dominio de la tienda tal como lo pide la API: `oferfy.myshopify.com` (se acepta escrito solo el subdominio). */
export function dominioTienda(texto: string | undefined): string | null {
  const t = String(texto ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
  if (!t) return null;
  const d = t.endsWith(".myshopify.com") ? t : `${t}.myshopify.com`;
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(d) ? d : null;
}

/** Los errores de una mutación de Shopify (`userErrors`) en una sola frase. */
export function textoErrores(errores: { field?: string[] | null; message: string }[] | undefined): string | null {
  if (!errores?.length) return null;
  return errores
    .slice(0, 3)
    .map((e) => e.message)
    .join(" · ");
}
