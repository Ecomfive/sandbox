import sanitizeHtml from "sanitize-html";

/**
 * Limpia el HTML de la descripción de un producto con una lista permitida: solo sobrevive lo que está aquí; todo lo demás
 * (scripts, estilos, iframes, formularios, svg, atributos `on…`, enlaces `javascript:`) se descarta. Antes eran unas
 * expresiones regulares que se saltaban con variantes como `<img/src=x/onerror=…>`.
 *
 * Se usa en el servidor (al guardar) y en el navegador (al mostrar), con la misma regla, porque el HTML guardado en la
 * base podría haberse escrito sin pasar por la app.
 */
const OPCIONES: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "hr", "div", "span",
    "b", "strong", "i", "em", "u", "s", "strike", "sub", "sup", "mark", "small",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "blockquote", "pre", "code",
    "a", "img",
    "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"],
    "*": ["style"],
  },
  // Solo unos pocos estilos de texto; nada de `url(...)`, `expression(...)` ni posicionamiento.
  allowedStyles: {
    "*": {
      "text-align": [/^(left|right|center|justify)$/],
      "font-weight": [/^(normal|bold|[1-9]00)$/],
      "font-style": [/^(normal|italic)$/],
      "text-decoration": [/^(none|underline|line-through)$/],
      color: [/^#[0-9a-f]{3,8}$/i, /^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$/i],
    },
  },
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowedSchemesByTag: { img: ["http", "https"] },
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    // Un enlace que se abre en otra pestaña no recibe acceso a la ventana de origen.
    a: (_etiqueta, atributos) => ({
      tagName: "a",
      attribs: { ...atributos, rel: "noopener noreferrer nofollow", ...(atributos.target ? { target: "_blank" } : {}) },
    }),
  },
};

export function sanitizarHtml(html: string): string {
  return sanitizeHtml(html, OPCIONES);
}
