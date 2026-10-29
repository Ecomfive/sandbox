// Plantillas sugeridas para retomar conversaciones (28 oct 2026, pedido de Jhokser). Son texto fijo en el código: en la pantalla se agregan una
// a una como borrador y recién se mandan a Meta cuando se conecta el número (`scripts/crear-plantillas-sugeridas.ts` las manda con dos
// minutos entre una y otra). Meta trata como **Marketing** cualquier mensaje que busque que alguien vuelva a comprar o a escribir, aunque
// la persona haya hablado antes: por eso casi todas lo son. La de seguimiento de una consulta es la única de Utilidad: no promociona nada
// y responde a algo que la persona pidió; si Meta la pasa a Marketing, el sistema avisa. Todas llevan un botón para decir que no.

import type { Categoria, VariablePlantilla } from "./plantillas";

/** «retomar»: para volver a hablar con alguien. «llegada»: avisar a quien preguntó por un producto que ya llegó o que su fecha cambió (la tarea «Avisar cuando llegue»). */
export type GrupoSugerida = "retomar" | "llegada" | "primer_contacto";

export interface PlantillaSugerida {
  clave: string;
  grupo: GrupoSugerida;
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
  // «Nuevo contacto» de la bandeja (30 oct 2026): escribirle primero a alguien que ya aceptó recibir mensajes. Lleva los dos botones de respuesta —aceptar y rechazar— porque un primer
  // mensaje sin salida es lo que más bloqueos causa: «No, gracias» le deja a la persona negarse sin bloquear ni reportar el número. El motivo del contacto se escribe al enviar.
  {
    clave: "primer_contacto",
    grupo: "primer_contacto",
    nombre: "primer_contacto",
    titulo: "Primer contacto con permiso",
    categoria: "utility",
    paraQue: "Para escribirle por primera vez a alguien que aceptó recibir mensajes (desde «Nuevo contacto» de la bandeja).",
    cuerpo: "Hola {{1}}, te escribe {{2}} del equipo de Ecomfive. Te contactamos por lo siguiente: {{3}}. ¿Te parece bien que sigamos la conversación por este medio?",
    botones: ["Sí, escríbeme", "No, gracias"],
    variables: [
      { campo: "primer_nombre", ejemplo: "María" },
      { campo: "manual", ejemplo: "Carlos", etiqueta: "Nombre del asesor" },
      { campo: "manual", ejemplo: "la consulta que dejaste sobre los productos de belleza", etiqueta: "Motivo del contacto" },
    ],
  },
  {
    clave: "retomar_conversacion",
    grupo: "retomar",
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
    grupo: "retomar",
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
    grupo: "retomar",
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
    grupo: "retomar",
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
    grupo: "retomar",
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
  // Avisos de llegada (29 oct 2026, pedido de Jhokser). Un cliente pregunta por mercancía, se le dice para qué fecha llega y se crea la tarea «Avisar cuando llegue»;
  // cuando llega de verdad, el aviso por WhatsApp (pasadas las 24 h de su último mensaje) solo puede ir con una plantilla. Son de Utilidad: responden a algo que la
  // persona pidió y no promocionan nada. Si Meta la pasa a Marketing, el sistema avisa. Los productos y la fecha se escriben al enviar (`manual`).
  {
    clave: "aviso_llegada_producto",
    grupo: "llegada",
    nombre: "aviso_llegada_producto",
    titulo: "Llegó el producto que preguntó",
    categoria: "utility",
    paraQue: "Cuando llega un producto por el que el cliente preguntó y quedamos en avisarle.",
    cuerpo: "Hola {{1}}, te avisamos que ya llegó el producto {{2}} que nos preguntaste. Ya está disponible para tus pedidos. Si necesitas ayuda con algo, responde a este mensaje.",
    botones: ["Gracias por avisar", "Quiero pedirlo"],
    variables: [
      { campo: "primer_nombre", ejemplo: "María" },
      { campo: "manual", ejemplo: "Crema reparadora", etiqueta: "Producto" },
    ],
  },
  {
    clave: "aviso_llegada_varios",
    grupo: "llegada",
    nombre: "aviso_llegada_varios",
    titulo: "Llegaron varios productos que preguntó",
    categoria: "utility",
    paraQue: "Cuando llegan varios productos por los que el cliente preguntó, en un solo aviso.",
    cuerpo: "Hola {{1}}, ya llegó la mercancía que esperabas: {{2}}. Ya está disponible para tus pedidos. Si necesitas ayuda con algo, responde a este mensaje.",
    botones: ["Gracias por avisar", "Quiero pedir"],
    variables: [
      { campo: "primer_nombre", ejemplo: "María" },
      { campo: "manual", ejemplo: "Crema reparadora y Aceite de semilla de calabaza", etiqueta: "Productos" },
    ],
  },
  {
    clave: "aviso_llegada_cambio_fecha",
    grupo: "llegada",
    nombre: "aviso_llegada_cambio_fecha",
    titulo: "La llegada cambió de fecha",
    categoria: "utility",
    paraQue: "Cuando la fecha de llegada que se le prometió al cliente cambió.",
    cuerpo: "Hola {{1}}, sobre el producto {{2}} que nos preguntaste: la llegada cambió y ahora esperamos que sea el {{3}}. Apenas esté disponible te avisamos por este mismo chat.",
    botones: ["Entendido", "Tengo una pregunta"],
    variables: [
      { campo: "primer_nombre", ejemplo: "María" },
      { campo: "manual", ejemplo: "Crema reparadora", etiqueta: "Producto" },
      { campo: "manual", ejemplo: "12 de noviembre", etiqueta: "Nueva fecha" },
    ],
  },
];

/** Las plantillas de aviso de llegada. */
export const PLANTILLAS_DE_LLEGADA = PLANTILLAS_SUGERIDAS.filter((p) => p.grupo === "llegada");
