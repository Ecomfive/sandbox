// Plantillas sugeridas para retomar conversaciones (28 oct 2026, pedido de Jhokser). Son texto fijo en el código: en la pantalla se agregan una
// a una como borrador y recién se mandan a Meta cuando se conecta el número (`scripts/crear-plantillas-sugeridas.ts` las manda con dos
// minutos entre una y otra). Meta trata como **Marketing** cualquier mensaje que busque que alguien vuelva a comprar o a escribir, aunque
// la persona haya hablado antes: por eso casi todas lo son. La de seguimiento de una consulta es la única de Utilidad: no promociona nada
// y responde a algo que la persona pidió; si Meta la pasa a Marketing, el sistema avisa. Todas llevan un botón para decir que no.

import type { Categoria, VariablePlantilla } from "./plantillas";

export interface PlantillaSugerida {
  clave: string;
  nombre: string;
  titulo: string;
  categoria: Categoria;
  /** Cuándo usarla, en una frase. */
  paraQue: string;
  cuerpo: string;
  botones: string[];
  variables: VariablePlantilla[];
}

export const PLANTILLAS_SUGERIDAS: PlantillaSugerida[] = [
  {
    clave: "retomar_conversacion",
    nombre: "retomar_conversacion",
    titulo: "Retomar una conversación",
    categoria: "marketing",
    paraQue: "Para quien dejó de responder y quedó algo pendiente.",
    cuerpo: "Hola {{1}}, soy del equipo de Ecomfive. Hace unos días hablamos y quedó algo pendiente. ¿Quieres que lo retomemos?",
    botones: ["Sí, retomemos", "Ahora no"],
    variables: [{ campo: "primer_nombre", ejemplo: "María" }],
  },
  {
    clave: "seguimiento_consulta",
    nombre: "seguimiento_consulta",
    titulo: "Seguimiento de una consulta",
    categoria: "utility",
    paraQue: "Para saber si se resolvió una consulta o un caso que la persona abrió.",
    cuerpo: "Hola {{1}}, te escribimos para saber si pudimos resolver tu consulta. Si todavía necesitas ayuda, responde a este mensaje y te atendemos.",
    botones: ["Ya está resuelto", "Necesito ayuda"],
    variables: [{ campo: "primer_nombre", ejemplo: "María" }],
  },
  {
    clave: "producto_con_stock",
    nombre: "producto_con_stock",
    titulo: "Un producto volvió a tener stock",
    categoria: "marketing",
    paraQue: "Para avisar a quien preguntó por un producto que se había agotado.",
    cuerpo: "Hola {{1}}, el producto {{2}} que te interesaba ya tiene unidades disponibles. ¿Quieres que te cuente los detalles?",
    botones: ["Quiero saber más", "No por ahora"],
    variables: [
      { campo: "primer_nombre", ejemplo: "María" },
      { campo: "manual", ejemplo: "Crema reparadora", etiqueta: "Producto" },
    ],
  },
  {
    clave: "tienda_sin_pedidos",
    nombre: "tienda_sin_pedidos",
    titulo: "Una tienda sin pedidos",
    categoria: "marketing",
    paraQue: "Para dropshippers que se registraron y todavía no han pedido.",
    cuerpo: "Hola {{1}}, vimos que {{2}} todavía no ha hecho pedidos con nosotros. ¿Te ayudamos a elegir productos con buena salida?",
    botones: ["Sí, ayúdame", "Ahora no"],
    variables: [
      { campo: "primer_nombre", ejemplo: "María" },
      { campo: "tienda", ejemplo: "Bella Moda" },
    ],
  },
  {
    clave: "novedades_catalogo",
    nombre: "novedades_catalogo",
    titulo: "Productos nuevos del catálogo",
    categoria: "marketing",
    paraQue: "Para quien vende bien y puede interesarle algo nuevo.",
    cuerpo: "Hola {{1}}, tenemos productos nuevos de {{2}} listos para vender. ¿Te enviamos el catálogo?",
    botones: ["Sí, envíalo", "No, gracias"],
    variables: [
      { campo: "primer_nombre", ejemplo: "María" },
      { campo: "manual", ejemplo: "belleza", etiqueta: "Categoría" },
    ],
  },
];
