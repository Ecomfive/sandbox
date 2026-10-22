// Universidad: los cursos del sistema. Contenido fijo (se cambia con un PR). Las respuestas correctas viven SOLO aquí, en el
// servidor: al navegador llega el curso sin ellas (`cursoParaAlumno`) y la nota la pone `completarCurso`. Un curso con
// `modulo` solo lo ve quien puede abrir ese módulo; sin módulo, lo ve todo el mundo.

export interface Leccion {
  titulo: string;
  parrafos: string[];
}
export interface Pregunta {
  pregunta: string;
  opciones: string[];
  /** Índice de la opción correcta. */
  correcta: number;
}
export interface Curso {
  id: string;
  titulo: string;
  descripcion: string;
  modulo: string | null;
  minutos: number;
  lecciones: Leccion[];
  examen: Pregunta[];
}

/** Para aprobar hay que acertar al menos este porcentaje del examen. */
export const APROBAR_DESDE = 0.75;

export const CURSOS: Curso[] = [
  {
    id: "primeros-pasos",
    titulo: "Primeros pasos en el sistema",
    descripcion: "Cómo moverte por el sistema: áreas, fichas, tablas, menciones y permisos.",
    modulo: null,
    minutos: 6,
    lecciones: [
      {
        titulo: "Moverte por el sistema",
        parrafos: [
          "La barra negra de la izquierda tiene las áreas (Desempeño, Marketing, Operación, Finanzas…). Al pulsar una, el panel de al lado muestra sus páginas, repartidas en tres frentes: Proveeduría, Gestión de tienda y Fulfillment.",
          "Arriba tienes el buscador (Ctrl K o /): escribe el nombre de una página, un retiro, un producto o un dropshipper y ve directo. A la derecha está el país en que trabajas: Inventario, Retiros y Pedidos muestran los datos de ese país.",
          "Con la estrella de las migas de pan guardas una página en Favoritos.",
        ],
      },
      {
        titulo: "Tablas y fichas",
        parrafos: [
          "Casi todo se ve en tablas con la misma barra: Agrupar, Filtros, Cerrados, Columnas, Vistas y Descargar. Lo que eliges se recuerda en tu navegador y puedes guardarlo como vista con nombre.",
          "Al pulsar una fila se abre su ficha a la derecha: ahí ves todo el registro y, si tienes permiso, lo editas en el mismo lugar. Arriba de la ficha aparecen «Guardar cambios» y «Cancelar» solo cuando cambiaste algo.",
        ],
      },
      {
        titulo: "Comentarios, menciones y avisos",
        parrafos: [
          "En los comentarios de una compra o en las notas del CRM, escribe @ y elige a una persona: le llega un aviso en «Para ti» (botón Avisos) con el enlace al comentario.",
          "Tu rol decide qué módulos ves y si puedes modificarlos o solo leerlos. Además, puedes tener países permitidos: entonces solo ves las compras y datos de esos países. Si te falta un acceso, pídelo a quien administra Usuarios y roles.",
        ],
      },
    ],
    examen: [
      { pregunta: "¿Cómo abres rápido cualquier página o registro?", opciones: ["Con el buscador (Ctrl K o /)", "Recargando la página", "Desde Ajustes"], correcta: 0 },
      { pregunta: "Mencionas a alguien con @ en un comentario. ¿Qué pasa?", opciones: ["Nada, es solo texto", "Le llega un aviso en «Para ti» con el enlace", "Se le envía un correo con el comentario"], correcta: 1 },
      { pregunta: "¿Dónde se edita un registro (una compra, un retiro)?", opciones: ["En una página aparte", "En su ficha, que se abre a la derecha al pulsar la fila", "Solo descargando la tabla"], correcta: 1 },
      { pregunta: "¿Qué decide qué módulos puedes abrir?", opciones: ["Tu rol", "El país de la barra de arriba", "Las vistas guardadas"], correcta: 0 },
    ],
  },
  {
    id: "producto",
    titulo: "Producto: el catálogo único",
    descripcion: "Crear productos, variantes, compuestos, estados Activo/Test, código de barras y foto.",
    modulo: "producto",
    minutos: 8,
    lecciones: [
      {
        titulo: "Un catálogo para todos los países",
        parrafos: [
          "Cada producto vive una sola vez en el sistema y vale para todos los países: el mismo SKU, el mismo código de barras y la misma foto. El SKU es la llave con la que una venta de Dropi o Shopify encuentra el producto para descontar inventario, así que debe ser igual en todas las plataformas.",
          "Un producto nuevo arranca en Test (se está probando). Cuando se aprueba y pasa a Activo desde su ficha, el sistema crea sola su orden de compra en «01 - Cotizar» en el país de la barra de arriba.",
          "Un producto puede ser simple (se compra y se guarda tal cual) o compuesto (una combinación de simples con su cantidad: no guarda stock y al venderlo se descuenta cada componente).",
          "Al crear un compuesto, cada componente se busca como en una orden de compra (foto, SKU, nombre y N.º) y se ve el mapa de cómo se arma. En la lista, al pasar el cursor por el nombre, un compuesto muestra su mapa y un simple su foto grande y sus compras.",
        ],
      },
      {
        titulo: "Variantes",
        parrafos: [
          "Si un producto se vende en colores o tallas, márcalo con «Tiene variantes» y define sus opciones. Cada variante tiene su SKU y su stock.",
          "Las compras se hacen por variante, no por el producto padre: al agregar un producto con variantes a una compra, el sistema pide la cantidad de cada variante. Un compuesto también debe usar variantes, nunca el padre.",
        ],
      },
      {
        titulo: "Activo o Test, código de barras y foto",
        parrafos: [
          "Un producto nace en Test: se está probando, aparece en Inventario pero no tiene stock y no se compra. Cuando se decide comprarlo, pásalo a Activo desde su ficha.",
          "Si un producto ya no se vende bien, pásalo a Inactivo: sigue vendiendo el stock que le queda, pero no se puede volver a comprar hasta que se pase otra vez a Activo. Si ya no se va a traer más, pásalo a Descontinuado: tampoco se puede comprar.",
          "Al crear un producto, si ya hay otro con un nombre o una foto parecidos, sale el aviso «Posible duplicado» con ese producto. Revísalo antes de crear: el aviso no lo impide, pero dos productos repetidos luego hay que unirlos.",
          "Al crear el producto se le genera un código de barras interno (un EAN-13 que empieza por 20); si trae el del fabricante, se elige «Del fabricante» y se escribe. La foto se sube desde la ficha y se ve en Producto e Inventario.",
          "El bloque «Compras» de la ficha suma las unidades compradas desde la primera vez, a partir de las compras donde el producto está vinculado.",
        ],
      },
    ],
    examen: [
      { pregunta: "¿Para qué sirve el SKU?", opciones: ["Es solo un nombre corto", "Es la llave con la que una venta encuentra el producto para descontar inventario", "Es el número de la compra"], correcta: 1 },
      { pregunta: "Un producto se vende en tres colores. ¿Cómo se compra?", opciones: ["Por el producto padre", "Por cada variante, con su cantidad", "Como compuesto"], correcta: 1 },
      { pregunta: "¿Qué pasa con un producto en Test?", opciones: ["Se compra normal", "Aparece en Inventario pero no tiene stock ni se compra", "No aparece en ningún lado"], correcta: 1 },
      { pregunta: "Un producto compuesto (combo)…", opciones: ["Guarda su propio stock", "No guarda stock: al venderlo se descuenta cada componente", "Solo existe en Dropi"], correcta: 1 },
      { pregunta: "Al crear un producto sale el aviso «Posible duplicado». ¿Qué haces?", opciones: ["Lo ignoro, el sistema los junta solo", "Reviso el producto parecido antes de crear el nuevo", "No puedo crearlo"], correcta: 1 },
    ],
  },
  {
    id: "compras",
    titulo: "Compras: de la cotización a la llegada",
    descripcion: "Crear y seguir una orden de compra, vincular productos, costos, etapas y comentarios.",
    modulo: "compras",
    minutos: 10,
    lecciones: [
      {
        titulo: "La orden de compra",
        parrafos: [
          "Cada compra a un proveedor es una orden con su N.º OC (OC-0001…) y el código de su país (ECOM01 Panamá, ECOM03 Costa Rica…), que se asigna solo al crearla. Una venta de importación (para un cliente) es una compra de un país con el «Tipo de venta» en «Venta de importación» (si no, es de Proveeduría).",
          "Arriba de la lista eliges qué ver: todos los países o uno. La lista arranca agrupada por etapa.",
          "Cada orden lleva una sola Vía de envío (marítimo, aéreo o terrestre), una sola Tienda y su Agente de envío (quien la trae: Chin, Avery…). Con la vía, el país y la fecha de envío se calcula su Planificación.",
        ],
      },
      {
        titulo: "Etapa y Estado",
        parrafos: [
          "La Etapa dice en qué paso va la compra: Backlog, 01 Cotizar, 02 Cotizado… hasta 06 Completado o Descartado. De los cambios de etapa salen los tiempos y las alertas de atraso.",
          "El Estado es el semáforo de gestión (Pendiente, En Gestión, En Revisión, Completado…). Una compra se archiva —pasa a «Cerrados»— cuando su Estado es Completado, aunque la mercancía ya haya llegado antes.",
        ],
      },
      {
        titulo: "Productos, unidades y costo",
        parrafos: [
          "En la ficha, bloque «Productos», agrega los productos que se compraron (por variante si las tiene) con sus unidades y el costo unitario o el total: el otro se calcula solo, con hasta 10 decimales. La Cantidad total y el Monto Total de la compra salen de sus productos.",
          "Una compra sin productos lleva la marca «Sin productos». Vincular productos es lo que alimenta el histórico de compras de cada producto.",
        ],
      },
      {
        titulo: "Planificación automática",
        parrafos: [
          "La Planificación es el mes en que se espera que llegue la compra (Oct26, Nov26…) y no se escribe: al poner la Fecha de Envío, el sistema le suma lo que tardaron los envíos anteriores de ese país por esa vía (marítimo, aéreo o terrestre) y pone el mes de llegada. Si cambia la fecha, la vía o el país, se vuelve a calcular.",
        ],
      },
      {
        titulo: "Editar rápido y comentar",
        parrafos: [
          "Pulsa una celda para editarla en un panel pequeño; para cambiar varias compras a la vez, márcalas y usa la barra de abajo.",
          "La Actividad, al final de la ficha, junta comentarios, cambios y archivos en orden de tiempo (filtro Todo / Comentarios / Cambios). Comenta con @ para avisar a alguien, pega capturas o adjunta PDF, Excel, Word o CSV. Para marcar una falla, empieza el comentario con «Inconveniente:».",
          "Debajo de cada comentario puedes darle 👍, reaccionar con un emoji o «Responder» (le avisa a quien lo escribió). Tus propios comentarios se pueden «Editar» y quedan marcados «(editado)».",
        ],
      },
      {
        titulo: "Anular y Envíos",
        parrafos: [
          "Una compra no se borra: «Anular» pide el motivo y la pasa a la etapa Descartado con la insignia «Anulada», conservando su código y su historial. «Restaurar» la devuelve a la etapa que tenía.",
          "En la pestaña Envíos ves una lista de rutas (la puedes agrupar por país, agente o vía): cada fila dice lo que promete el agente, lo que de verdad tarda (últimos 12 meses y últimos 2 meses), si está En plazo o Fuera de plazo —con una barra que lo compara— y su tarifa por CBM o kg. Pulsa una ruta para abrir su ficha: ahí la activas o desactivas, cambias lo que promete y agregas tarifas.",
          "En la ficha de una compra, bajo la Fecha límite, aparece la predicción de cuándo llegará según su país, su vía y su fecha de envío (con el rango habitual). «Usar como fecha límite» la pone en el campo; nunca la cambia sola.",
        ],
      },
    ],
    examen: [
      { pregunta: "¿Cuándo se archiva una compra (pasa a Cerrados)?", opciones: ["Cuando su etapa es Completado", "Cuando su Estado es Completado", "Cuando llega la mercancía"], correcta: 1 },
      { pregunta: "¿De dónde salen la Cantidad total y el Monto Total de una compra con productos?", opciones: ["Se escriben a mano", "De sus productos vinculados", "De la descripción"], correcta: 1 },
      { pregunta: "¿Cómo marcas una falla de una compra?", opciones: ["Con un comentario que empiece con «Inconveniente:»", "Cambiando la etapa a Descartado", "Con una etiqueta roja"], correcta: 0 },
      { pregunta: "¿Cómo se pone la Planificación de una compra?", opciones: ["Se escribe a mano el mes", "Se calcula sola con la fecha de envío y lo que tardan los envíos de su país por esa vía", "Es el mes en que se creó la compra"], correcta: 1 },
      { pregunta: "Una compra se pidió por error. ¿Qué haces?", opciones: ["La elimino para que no quede rastro", "La anulo con su motivo: pasa a Descartado y se puede restaurar", "Le cambio el nombre"], correcta: 1 },
      { pregunta: "Escribiste mal un comentario tuyo. ¿Qué haces?", opciones: ["Pulso «Editar» en mi comentario y lo corrijo: queda marcado «(editado)»", "Pido a otra persona que lo borre", "No se puede cambiar"], correcta: 0 },
      { pregunta: "En la ficha de una compra aparece la predicción de la fecha límite. ¿Qué hace «Usar como fecha límite»?", opciones: ["Guarda la compra como completada", "Pone la fecha predicha en el campo Fecha límite (tú decides si guardas)", "Cambia la fecha de envío"], correcta: 1 },
      { pregunta: "¿Cómo marcas una venta de importación (para un cliente)?", opciones: ["Eligiendo el país Importadora", "Con su «Tipo de venta»: Venta de importación", "Con una etiqueta"], correcta: 1 },
    ],
  },
  {
    id: "inventario",
    titulo: "Inventario: stock, movimientos y lotes",
    descripcion: "Cubetas de stock, bodegas, entradas y salidas, lotes y vencimientos.",
    modulo: "inventario",
    minutos: 8,
    lecciones: [
      {
        titulo: "Dónde está el stock",
        parrafos: [
          "El stock vive por producto y por bodega, en el país de la barra de arriba. Las bodegas propias las movemos nosotros; las externas (Dropi, Effi, Boxful, Dunamixfy) las tiene un tercero y su stock llega por sincronización: no se mueven a mano.",
          "Dentro de una bodega, cada ubicación tiene una propiedad (normal, dañado, en inspección, retenido) que decide a qué cubeta suma lo que se guarda ahí.",
        ],
      },
      {
        titulo: "Las cubetas",
        parrafos: [
          "El stock se reparte en cubetas: físico, reservado, dañado, en inspección, retenido, vencido y en camino. Disponible es lo que se puede vender: el físico menos lo reservado, dañado, en inspección, retenido y vencido.",
          "Un saldo puede quedar negativo si una salida llega antes que su entrada: se ve en rojo y se corrige con una entrada o un ajuste.",
        ],
      },
      {
        titulo: "Movimientos, lotes y vencimiento",
        parrafos: [
          "Desde la ficha de un producto registras Entrada, Salida o Ajuste. Cada movimiento queda en un libro que no se edita ni se borra.",
          "Si el producto maneja vencimiento, la entrada pide lote y fecha. Una salida sin lote sale por FEFO —primero el que vence antes— y nunca toma un lote vencido. Los vencidos y por vencer se ven en la pestaña Vencimientos.",
        ],
      },
    ],
    examen: [
      { pregunta: "¿Qué es el stock Disponible?", opciones: ["Todo el físico", "El físico menos reservado, dañado, en inspección, retenido y vencido", "Lo que está en camino"], correcta: 1 },
      { pregunta: "¿Se puede hacer una entrada a mano en la bodega de Dropi?", opciones: ["Sí, como cualquier bodega", "No: es externa y su stock llega por sincronización", "Solo con permiso de Ajustes"], correcta: 1 },
      { pregunta: "Una salida sin lote de un producto con vencimiento…", opciones: ["Toma el lote más nuevo", "Sale por FEFO y nunca toma un lote vencido", "Se rechaza siempre"], correcta: 1 },
      { pregunta: "¿Se puede borrar un movimiento?", opciones: ["Sí, desde la ficha", "No: el libro no se edita ni se borra; se corrige con otro movimiento", "Solo el mismo día"], correcta: 1 },
    ],
  },
  {
    id: "publicaciones-dropi",
    titulo: "Gestión de IDs Dropi",
    descripcion: "Las publicaciones de Ecomfive en Dropi: tablero de acciones, margen, revisión y vínculo con Producto.",
    modulo: "publicaciones-dropi",
    minutos: 7,
    lecciones: [
      {
        titulo: "La lista y el tablero de acciones",
        parrafos: [
          "Cada fila es un producto que Ecomfive tiene publicado en Dropi como proveedor, en el país de la barra de arriba, con su foto, su ID de Dropi, su SKU y su número propio (PUB-0001…), que es distinto al ID de Dropi y no cambia.",
          "La lista arranca agrupada por estado: Producto nuevo, Revisar precio y venta, Verificar con dropshipper, Validar bajar precio, Bajar precio y Al día. Los archivados se ven con el botón «Archivados».",
          "Arriba, el tablero de acciones cuenta lo que espera una decisión (los estados del flujo, Revisión vencida, Margen bajo, Sin vincular a Producto y Sin stock). Pulsa una tarjeta para filtrar la lista y otra vez para quitar el filtro.",
        ],
      },
      {
        titulo: "Margen y revisión",
        parrafos: [
          "La utilidad bruta es el precio de venta menos el costo de producto y el fulfillment; el margen bruto es esa utilidad dividida entre el precio. Se calculan solos, y un punto rojo avisa que el margen está por debajo de 30 %.",
          "Cada producto se revisa cada 28 días: la próxima revisión sale de la última y un punto ámbar avisa que ya pasó. El filtro «Revisión vencida» muestra lo que toca revisar.",
          "En la ficha cambias el estado, el precio y los costos, la venta, dónde está, la reposición, la privatización y las notas, y guardas con «Guardar cambios». Si cambias el precio, «Último cambio de precio» pasa a hoy.",
        ],
      },
      {
        titulo: "Vínculo con Producto",
        parrafos: [
          "Cada publicación se vincula con su producto de Producto. Si falta, la ficha sugiere uno (por la misma foto o un nombre parecido) con «Vincular» o «Vincular y siguiente»; si no es el correcto, busca otro por SKU o nombre.",
          "Un pack («PACK 2», «2x1») se vincula con su compuesto, no con el producto simple, porque al vender descontaría mal el inventario. Si el compuesto no existe, la ficha dice «Falta el compuesto»: créalo en Producto y vincúlalo.",
          "Con el vínculo, la ficha muestra «En camino» (las unidades de compras que ya salieron hacia ese país) y la competencia del producto en Dropi. Sin vínculo, el producto no se puede comprar desde Compras › Reponer.",
        ],
      },
    ],
    examen: [
      { pregunta: "¿Qué es el número PUB-0001 de una publicación?", opciones: ["El ID que pone Dropi", "Un número propio del sistema, distinto al ID de Dropi, que no cambia", "El SKU del producto"], correcta: 1 },
      { pregunta: "¿Qué indica el punto rojo en el margen bruto?", opciones: ["Que el margen está por debajo de 30 %", "Que no tiene stock", "Que la revisión está vencida"], correcta: 0 },
      { pregunta: "Una publicación «2x1» se vincula con…", opciones: ["El producto simple", "Su compuesto en Producto", "Ningún producto"], correcta: 1 },
      { pregunta: "¿Cómo ves lo que espera una decisión?", opciones: ["Pulsando una tarjeta del tablero de acciones", "Descargando la lista", "Abriendo cada ficha una por una"], correcta: 0 },
    ],
  },
];

/** Los cursos que puede tomar una persona según sus módulos. */
export const cursosPara = (modulos: string[]) => CURSOS.filter((c) => !c.modulo || modulos.includes(c.modulo));

/** El curso sin las respuestas correctas, para el navegador. */
export function cursoParaAlumno(c: Curso) {
  return { ...c, examen: c.examen.map(({ pregunta, opciones }) => ({ pregunta, opciones })) };
}
export type CursoAlumno = ReturnType<typeof cursoParaAlumno>;
