// Centro de ayuda: el glosario y las guías de cada módulo. Es contenido fijo (vive en el código, se cambia con un PR); los
// manuales de proceso, en cambio, se escriben y editan desde el sistema (tabla `manuales_proceso`). Cada guía y cada término
// lleva el módulo de permisos que hay que poder abrir para verlo: la ayuda solo muestra lo que la persona usa.

export interface TerminoGlosario {
  termino: string;
  definicion: string;
  /** Módulos donde aparece (para filtrar por permisos); sin módulos, lo ve todo el mundo. */
  modulos?: string[];
}

export interface GuiaModulo {
  /** Clave del módulo de permisos («compras», «dashboard»…). */
  modulo: string;
  titulo: string;
  ruta: string;
  /** Para qué sirve, en una o dos frases. */
  resumen: string;
  secciones: { titulo: string; pasos: string[] }[];
}

export const GLOSARIO: TerminoGlosario[] = [
  { termino: "Área", definicion: "Cada botón de la barra negra de la izquierda (Desempeño, Marketing, Operación, Finanzas…). Agrupa las páginas por tema." },
  { termino: "Frente", definicion: "Cómo se reparte cada área: Proveeduría (venta a dropshippers), Gestión de tienda (tiendas propias) y Fulfillment (bodega e inventario)." },
  { termino: "Módulo", definicion: "Una página del sistema con su permiso propio (Compras, Producto, Inventario…). Tu rol decide qué módulos ves y si puedes modificarlos o solo leerlos." },
  { termino: "Rol", definicion: "El conjunto de permisos que tiene una persona: qué módulos abre, si cada uno es de edición o de solo lectura y, en los que lo permiten, qué ve dentro. Se configura en Usuarios y roles." },
  { termino: "Permisos propios", definicion: "Lo que se le da o quita a una persona sola, encima de su rol: un módulo de más, uno de menos, o pasar uno de edición a lectura. Se ven en su ficha, y «Acceso efectivo» muestra el resultado." },
  { termino: "Afinar", definicion: "Decidir, dentro de un módulo, qué pestañas, acciones, campos y datos ve un rol o una persona. Lo que no puede ver no aparece." },
  { termino: "Países permitidos", definicion: "Los países cuyas compras, histórico y datos puede ver una persona. «Todos los países» no limita nada." },
  { termino: "Puesto", definicion: "El cargo que ocupa una persona (Media Buyer, Analista de Compras…): su misión, responsabilidades, áreas de resultado, lo que puede decidir, a quién reporta y lo que tiene que aprender. Lo tuyo se ve en «Mi puesto», en el menú de tu cuenta." },
  { termino: "Misión del puesto (JD)", definicion: "En una o dos frases, para qué existe el puesto. Es el resumen de su descripción de cargo (Job Description)." },
  { termino: "Áreas de resultado (KRA)", definicion: "Las 3 a 6 cosas de las que responde un puesto (por ejemplo, rentabilidad de campañas y generación de pedidos). Key Result Areas." },
  { termino: "SOP", definicion: "Procedimiento estándar de operación: el paso a paso de una tarea. En el sistema son los Manuales de proceso del Centro de ayuda, enlazados a cada puesto." },
  { termino: "Onboarding 30/60/90", definicion: "Lo que una persona nueva aprende en sus primeros 30, 60 y 90 días: los manuales y cursos de su puesto por etapa. Cuenta como hecho un curso aprobado o un manual marcado como leído." },
  { termino: "Puesto principal", definicion: "Si una persona ocupa varios puestos, el principal es el que decide su jefe en el organigrama y el que sale primero en «Mi puesto»." },
  { termino: "Ficha", definicion: "La ventana que se abre al pulsar una fila (un panel a la derecha; en Producto, una ventana grande al centro, como una tarea de ClickUp): muestra todo de ese registro y, si tienes permiso, ahí mismo se edita." },
  { termino: "Vista guardada", definicion: "Una combinación de filtros, agrupación y columnas que guardas con nombre en una tabla para volver a ella con un clic." },
  { termino: "Cerrados", definicion: "El botón de la barra de una tabla que muestra lo que ya terminó (compras completadas, retiros conciliados). Por defecto se ocultan." },
  { termino: "Mención (@)", definicion: "Escribir @ y el nombre de alguien en un comentario o nota: le llega un aviso en «Para ti» con el enlace al comentario." },
  { termino: "SKU", definicion: "El código único de un producto: lo identifica en el WMS, Shopify, las tiendas y Dropi, y con él una venta encuentra el producto para descontar inventario. Lo escribes al crear el producto y no puede repetirse: si ya existe, el sistema te avisa. Se puede corregir desde la ficha por uno que no exista (y hay que cambiarlo también en las plataformas).", modulos: ["producto", "inventario", "compras"] },
  { termino: "Publicación en Dropi", definicion: "Un producto que ECOMFIVE ofrece en Dropi como proveedor, con su ID de Dropi, su número propio (PUB-0001…, distinto al ID de Dropi), precio, margen, estado de venta y dónde está el stock. Se gestiona en Operación › Gestión de IDs Dropi (antes, la lista GCC de ClickUp).", modulos: ["publicaciones-dropi"] },
  { termino: "Landing", definicion: "La página de venta del producto en test: portada con precio, beneficios, imágenes, ofertas, preguntas y garantía. Se arma en Testing Lab › Generador de landings, desde cero o tomando otra landing como modelo («clonar»); su código es LND-0001, LND-0002…", modulos: ["generador-landings"] },
  { termino: "Captura de Instagram", definicion: "Un reel, publicación o video que alguien del equipo compartió por mensaje directo con la cuenta de fuentes. Cae solo en Testing Lab › Instagram con su video guardado, su copy y quién lo envió; su código es IG-0001, IG-0002…", modulos: ["instagram"] },
  { termino: "Anuncios con el mismo copy", definicion: "Cuántos anuncios de la misma página, en la Biblioteca de anuncios de Meta, llevan el mismo texto que una captura de Instagram. Un número alto indica que el anunciante lo está escalando. Se llena con el marcador «Leer Biblioteca» y se puede corregir a mano.", modulos: ["instagram"] },
  { termino: "N.º de producto", definicion: "El correlativo que pone el sistema al crear un producto (#0001, #0002…). Ordena la lista de productos; no se repite ni se cambia.", modulos: ["producto"] },
  { termino: "Producto simple", definicion: "Un producto que se compra y se guarda tal cual.", modulos: ["producto", "inventario"] },
  { termino: "Producto compuesto (combo)", definicion: "Una combinación de productos simples con su cantidad. No guarda stock: al venderlo se descuenta cada componente.", modulos: ["producto", "inventario"] },
  { termino: "Variante", definicion: "Una versión de un producto (color, talla…). Cada variante tiene su propio SKU y su stock; las compras se hacen por variante, no por el producto padre.", modulos: ["producto", "inventario", "compras"] },
  { termino: "Activo / Test", definicion: "El estado de un producto. Test: se está probando, todavía no se compra ni tiene stock. Activo: se compra y tiene inventario.", modulos: ["producto", "inventario", "compras"] },
  { termino: "Inactivo / Descontinuado", definicion: "Los otros dos estados de un producto. Inactivo: ya no se vende bien y vende lo que le queda. Descontinuado: ya no se va a traer más. Ninguno de los dos se puede agregar a una compra hasta pasarlo a Activo en su ficha.", modulos: ["producto", "inventario", "compras"] },
  { termino: "Posible duplicado", definicion: "El aviso que sale al crear un producto si ya hay otro con un nombre o una foto parecidos. Muestra cuál es para que lo revises; no impide crearlo.", modulos: ["producto"] },
  { termino: "En camino", definicion: "En la ficha de un producto o de una publicación de Dropi: las unidades de sus compras que ya salieron y todavía no llegan, solo del país elegido arriba. En Compras › Reponer cuenta además las compras abiertas que aún no salen (de 01 - Cotizar a 05 - Arribo Mercancía).", modulos: ["producto", "compras", "publicaciones-dropi"] },
  { termino: "Unidades netas", definicion: "Lo que de verdad se vendió en Dropi: unidades pedidas menos canceladas, rechazadas y devueltas. Una orden que todavía va en camino cuenta como neta hasta que la devuelvan.", modulos: ["ventas-dropi", "publicaciones-dropi", "compras"] },
  { termino: "Días de inventario", definicion: "Para cuántos días alcanza el stock de un producto en Dropi: el stock dividido entre las unidades netas por día de los últimos 30 días. Con menos de 15 días, toca reponer.", modulos: ["ventas-dropi", "publicaciones-dropi", "compras"] },
  { termino: "Margen bruto", definicion: "En Gestión de IDs Dropi: la utilidad bruta (precio de venta − costo mercancía − fulfillment) dividida entre el precio. Por debajo de 30 % se marca con un punto rojo.", modulos: ["publicaciones-dropi"] },
  { termino: "PUB-0001", definicion: "El número propio que el sistema le pone a cada publicación de Dropi. Es distinto al ID de Dropi y no cambia: sirve para buscarla y nombrarla.", modulos: ["publicaciones-dropi"] },
  { termino: "Portal del proveedor", definicion: "El portal donde Chin (proveedor y agente) ve sus compras sin entrar al sistema: cotiza, sube fotos y marca envíos. Desde Ecomfive se ve en Compras › Portal del proveedor.", modulos: ["portal-proveedor", "compras"] },
  { termino: "Código de barras interno", definicion: "Un EAN-13 que empieza por 20, generado por el sistema para los productos que no traen código del fabricante.", modulos: ["producto"] },
  { termino: "Bodega propia / externa", definicion: "Propia: la movemos nosotros desde el sistema. Externa (Dropi, Effi, Boxful…): el stock lo tiene un tercero y llega por sincronización, solo lectura.", modulos: ["inventario", "wms-bodegas"] },
  { termino: "Ubicación", definicion: "Un lugar dentro de una bodega (estante, pasillo). Su propiedad (normal, dañado, inspección, retenido) decide a qué cubeta suma lo que se guarda ahí.", modulos: ["wms-ubicaciones", "inventario"] },
  { termino: "Cubetas de inventario", definicion: "Cómo se reparte el stock: físico, reservado, dañado, en inspección, retenido, en camino y disponible (físico menos lo que no se puede vender).", modulos: ["inventario"] },
  { termino: "Disponible", definicion: "Lo que se puede vender: el físico menos reservado, dañado, en inspección, retenido y vencido.", modulos: ["inventario"] },
  { termino: "Movimiento", definicion: "Cada entrada, salida, ajuste o traslado de stock. Queda en un libro que no se edita ni se borra.", modulos: ["inventario"] },
  { termino: "Lote", definicion: "En Inventario: un grupo de unidades con su fecha de vencimiento. En Compras: el número de compra de ese producto en ese país (Lote 1, Lote 2…).", modulos: ["inventario", "compras"] },
  { termino: "FEFO", definicion: "«Primero en vencer, primero en salir»: una salida sin lote toma primero el lote que vence antes y nunca uno vencido.", modulos: ["inventario"] },
  { termino: "Orden de compra (OC)", definicion: "Cada compra a un proveedor. Tiene su N.º OC (OC-0001…) y su código del país (ECOM01-0450).", modulos: ["compras"] },
  { termino: "Código ECOM", definicion: "El correlativo de las compras de cada país: ECOM01 Panamá, ECOM02 México, ECOM03 Costa Rica… Se asigna solo al crear la compra.", modulos: ["compras"] },
  { termino: "Etapa", definicion: "En qué paso va una compra: Backlog, 01 Cotizar, 02 Cotizado… hasta 06 Completado (o Descartado). De ella salen los tiempos.", modulos: ["compras"] },
  { termino: "Estado", definicion: "El semáforo de gestión de una compra (Pendiente, En Gestión, En Revisión, Completado…). Es distinto de la etapa: la compra se archiva cuando el Estado es Completado.", modulos: ["compras"] },
  { termino: "Venta de importación", definicion: "Una compra para un cliente que nos pide mercancía de cualquier parte (antes «Importadora»). Es una compra de un país con el «Tipo de venta» en «Venta de importación» (la otra opción es «Proveeduría»); se ven filtrando o agrupando por esa columna.", modulos: ["compras"] },
  { termino: "Vincular productos", definicion: "Agregar a una compra los productos del sistema que se compraron, con unidades y costo. Así se suma el histórico de cada producto.", modulos: ["compras", "producto"] },
  { termino: "Tipo de venta", definicion: "Si una compra es de Proveeduría (para nuestro inventario) o una Venta de importación (para un cliente). Se elige en la compra y se filtra por la columna «Tipo de venta».", modulos: ["compras"] },
  { termino: "Anulada", definicion: "Una compra que se canceló con «Anular»: no se borra, pasa a la etapa Descartado con su motivo y conserva su código y su historial. Se puede restaurar.", modulos: ["compras"] },
  { termino: "Mapa de componentes", definicion: "El dibujo de cómo se arma un producto compuesto: cada componente con su cantidad unido al producto. Se ve al crearlo, en su ficha y al pasar el cursor por su nombre en la lista.", modulos: ["producto"] },
  { termino: "Agente de envío", definicion: "Quien trae la mercancía hasta el país (Chin, Avery…), aparte del proveedor que la vende. Se pone en cada compra y con él se mide cuánto tarda cada agente.", modulos: ["compras"] },
  { termino: "Ruta de envío", definicion: "Lo que ofrece un agente para llevar a un país por una vía (marítimo o aéreo, DDP o DAP): el tiempo que promete, sus tarifas, si cumple ese plazo y si el canal está activo. Están en Compras › Envíos.", modulos: ["compras"] },
  { termino: "En plazo / Fuera de plazo", definicion: "Cómo está una ruta de envío contra lo que promete su agente, mirando lo real de los últimos 12 meses: En plazo (no pasa del plazo máximo), Fuera de plazo (se pasa; dice cuántos días), Sin medir (todavía no hay envíos) o Sin plazo (falta definir lo que promete). Compras › Envíos.", modulos: ["compras"] },
  { termino: "Uso del plazo", definicion: "La barra de cada ruta en Compras › Envíos: la franja verde es el plazo prometido, la línea negra su máximo, la barra oscura lo que de verdad tardó y las rayas rojas lo que se pasó. Todas las barras usan la misma escala, así que se comparan entre sí.", modulos: ["compras"] },
  { termino: "Predicción de la fecha límite", definicion: "Bajo la Fecha límite de una compra: cuándo llegaría según su país, su vía y su fecha de envío (lo que tardaron los envíos anteriores de ese país por esa vía), con el rango habitual. «Usar como fecha límite» la pone en el campo; nunca la cambia sola.", modulos: ["compras"] },
  { termino: "CBM", definicion: "Metro cúbico: la unidad con que se cobra un envío marítimo (el aéreo se cobra por kg).", modulos: ["compras"] },
  { termino: "DDP / DAP", definicion: "DDP: el agente entrega con los impuestos y la aduana pagados. DAP: entrega en destino y los impuestos los pagamos nosotros.", modulos: ["compras"] },
  { termino: "Planificación", definicion: "El mes en que se espera que llegue una compra (Oct26, Nov26…). No se escribe: el sistema lo calcula con la fecha de envío más lo que tardaron los envíos anteriores de ese país por esa vía (marítimo, aéreo o terrestre).", modulos: ["compras"] },
  { termino: "Atrasada", definicion: "Una compra abierta que ya salió y lleva más días en tránsito que el 90 % de los envíos de su vía.", modulos: ["compras"] },
  { termino: "Inconveniente", definicion: "Una falla de una compra (aduana, retraso, error de entrega). Se marca con un comentario que empieza con «Inconveniente:».", modulos: ["compras"] },
  { termino: "Retiro", definicion: "Un retiro de dinero de la wallet de Dropi. Lo crea el equipo con su correlativo (#0007) y luego se concilia con lo que llega al banco.", modulos: ["retiros"] },
  { termino: "Conciliar", definicion: "Confirmar que el dinero de un retiro llegó: se anota lo recibido y la referencia, y el retiro queda cerrado y consolidado.", modulos: ["retiros"] },
  { termino: "Novedad", definicion: "Un retiro o pedido con un problema que hay que resolver (Dropi lo rechazó, no llegó completo…).", modulos: ["retiros", "pedidos-dropi"] },
  { termino: "Wallet", definicion: "El saldo que tenemos en una plataforma (Dropi). Se registra para saber cuánto se puede retirar.", modulos: ["retiros", "dashboard"] },
  { termino: "Dropshipper", definicion: "Un cliente que vende nuestros productos en su tienda a través de Dropi. Cada uno tiene su ficha en el CRM.", modulos: ["crm-dropshippers"] },
  { termino: "Winner", definicion: "Un producto en test que funcionó: su costo por compra (CPA) quedó por debajo de $4.", modulos: ["productos-test"] },
];

export const GUIAS: GuiaModulo[] = [
  {
    modulo: "dashboard",
    titulo: "Hoy",
    ruta: "/",
    resumen: "La pantalla de inicio: lo que necesita tu atención hoy y cómo va la operación.",
    secciones: [
      { titulo: "Necesita tu atención", pasos: ["Arriba a la izquierda está la cola de trabajo: lo pendiente primero, lo que está al día abajo con su marca verde.", "Pulsa «Revisar» o «Registrar» en una fila para ir directo a donde se resuelve."] },
      { titulo: "Indicadores", pasos: ["Elige el período (7 días, 30 días, este mes…) y compáralo con el anterior.", "Las tarjetas y gráficas se actualizan solas con ese período."] },
    ],
  },
  {
    modulo: "compras",
    titulo: "Compras",
    ruta: "/compras/lista",
    resumen: "Todas las órdenes de compra a proveedores, de la cotización a la llegada, con sus productos, pagos y tiempos.",
    secciones: [
      { titulo: "Ver las compras", pasos: ["Al entrar a Compras se abre la lista (la pestaña «Compras»); el Informe, el Dashboard, Tiempos y fallas y Envíos están en sus pestañas.", "Pulsa la descripción de una compra (la columna «Orden de compra») para abrir su ficha completa, con la actividad; las demás celdas se editan ahí mismo en la tabla.", "Arriba eliges qué ver: Todos los países o un país. Las ventas de importación se ven filtrando por la columna «Tipo de venta» (Proveeduría o Venta de importación).", "La columna principal es «Orden de compra»: una compra se identifica por sus códigos (N.º OC y código del país), con el país, el proveedor, sus productos y las etiquetas de color; púlsala para ver la compra. Ya no lleva nombre: el que traía de ClickUp dejó de usarse.", "En Filtros, la Etapa y el Estado salen con sus mismos colores. La lupa busca en abiertas y cerradas a la vez (por N.º OC, código, proveedor o producto).", "En «Columnas» eliges qué columnas ver («Mostrar todas» u «Ocultar todas» de una vez) y la densidad de las filas.", "La lista arranca agrupada por etapa; puedes agrupar, filtrar, mover y ocultar columnas, y guardar tu vista.", "Dentro de cada grupo, las compras van en secuencia por su código (ECOM01-0444, 0431, 0430…), de mayor a menor.", "Los filtros de un toque (Cotizando, Producción, En tránsito, Atrasadas, Sin productos) aíslan lo que buscas."] },
      { titulo: "Crear una compra", pasos: ["Pulsa «Agregar» (Nueva orden de compra) y elige el país con su bandera (si no está, «Agregar país» al final de la lista: escribe su nombre y elígelo; queda agregado al sistema). La etapa arranca en «01 - Cotizar». Antes de crearla ya ves su N.º OC y su código ECOM, que son los que la identifican (no lleva nombre).", "En «Foto real del producto» sube la foto que manda el proveedor: al crear la compra puedes arrastrarla desde el escritorio o desde internet y soltarla en cualquier parte del panel, o pegarla con Ctrl+V.", "Etiquetas: «Añadir etiqueta» abre la lista de todas las que existen (con su color); pulsa para poner o quitar, o escribe una nueva y pulsa Enter para crearla.", "En el bloque «Productos» (debajo de Etiquetas, igual que en la ficha) empieza a escribir el SKU, el nombre o el N.º: salen las sugerencias con su foto; elige con el ratón o con flechas y Enter. Escribe unidades y costo y pulsa «Agregar a la orden».", "Al final del panel puedes dejar comentarios desde ya (con @ y archivos), igual que en la ficha: «Agregar comentario» los deja listos.", "La factura o el soporte de la compra van como archivo en un comentario (ya no hay campo «Documentos»).", "La Vía de envío es una sola (Marítimo, Aéreo o Terrestre); el Tipo de venta es Proveeduría o Venta de importación; el Agente de envío es quien la trae (Chin, Avery…).", "La Tienda es una sola: pulsa el campo y elige otra o escribe una nueva para crearla.", "Pulsa «Crear compra»: se guarda con sus productos y comentarios, y la Cantidad total y el monto salen de los productos."] },
      { titulo: "Copiar cotización para WhatsApp", pasos: ["En la ficha de la compra, pulsa «Copiar cotización» (junto a «Anular»): queda copiada una imagen con las métricas del test y la fila de la cotización.", "Abre el chat de WhatsApp y pégala con Ctrl V: ya no hace falta la captura de la ficha ni la del sheet.", "Arriba van las métricas del test con sus puntos de color, tal como están en la descripción de la compra; si la descripción no las trae, salen del test del producto en Test productos.", "Abajo, la fila de la cotización: producto, foto, destino, solución logística (por ejemplo «DDP BY SEA», del agente de envío en Envíos y la vía), cantidad, monto y monto por unidad, de los productos de la compra.", "Si el navegador no deja copiar imágenes, se copia lo mismo en texto."] },
      { titulo: "Anular una compra", pasos: ["Una compra no se borra: en su ficha, «Anular» pide el motivo y la pasa a la etapa Descartado (Estado Completado), con la insignia «Anulada».", "Conserva su N.º OC, su código ECOM, su actividad y sus productos. Se ve con las demás descartadas: activa «Cerrados» y mira el grupo Descartado. Deja de contar en la planificación, los envíos y el histórico de compras del producto.", "Desde su ficha, «Restaurar» la devuelve a la etapa y el estado que tenía. Anular y restaurar quedan en su Actividad y en la auditoría."] },
      { titulo: "Compras por categoría (Dashboard)", pasos: ["En la pestaña «Dashboard», la tarjeta «Compras por categoría» dice qué categorías de producto se compran más: unidades, su parte del total, valor y cuántas compras, de la que más a la que menos.", "Eliges el periodo: «Este año», «Últimos 12 meses», «Año pasado» o «Todo». Respeta los filtros de arriba.", "La categoría sale de los productos de cada compra. Si una compra trae varios productos, su valor se reparte según las unidades de cada uno. Las compras sin productos vinculados van aparte.", "En «Comparar por» también está «Categoría»: pulsa una fila para filtrar todo el Dashboard a esa categoría."] },
      { titulo: "Unidades compradas (Dashboard)", pasos: ["En la pestaña «Dashboard», la tarjeta «Unidades compradas» muestra mes a mes las unidades compradas (barras) y su valor en dólares (línea).", "Arriba a la derecha eliges el periodo: «Este año», «Últimos 12 meses» o «Año pasado». Encima de la gráfica salen el total de unidades, el valor, cuántas compras y el costo por unidad.", "Cada compra cuenta en el mes en que se creó; las descartadas y anuladas no cuentan. Respeta los filtros de arriba (país, proveedor, vía…)."] },
      { titulo: "Tiempo en cada etapa (Dashboard)", pasos: ["En la pestaña «Dashboard», la sección «Tiempo en cada etapa» dice cuánto pasa una orden de compra en cada etapa, de Cotizar a Arribo, sacado del historial de etapas.", "«Pasaron» son las veces que una compra salió de esa etapa; con ellas se calculan la mediana, el promedio, «9 de cada 10» (lo que tardaron casi todas) y el máximo. Arriba, «De Cotizar a Arribo» suma las medianas.", "«Ahora» son las compras que están hoy en esa etapa; «Llevan» es la mediana de los días que llevan ahí, y «Más de lo normal» (en rojo) cuenta las que llevan más que 9 de cada 10.", "Pulsa una etapa para ver sus compras, de la que más lleva a la que menos; pulsa una para abrir su ficha. Respeta los filtros de arriba (país, proveedor, vía…).", "En Backlog - Pospuesto no se marca «más de lo normal»: una compra pospuesta no tiene un tiempo normal."] },
      { titulo: "Planificación (qué llega y cuándo)", pasos: ["La pestaña «Planificación» muestra las compras que todavía no llegan, por el mes en que se espera que lleguen: lo que resta del mes, los 3 meses siguientes y «Debían llegar» (planificadas antes y sin llegar).", "Arriba eliges el país (con su bandera) y filtras por vía, proveedor o tienda.", "La vía es Marítimo o Aéreo: las compras terrestres o sin vía cuentan como marítimo. La tienda se elige por marca, sin el país (el país va en su selector): Ecomfive (también Dropi, DropLatam y Ecomfive Importadora), Kenku, Clicksi, Mercado Libre, Nube/Oferta, Oferfy, «Otras tiendas» (Cobrevida, Limitada, Oceans, Nuvo…) y «Sin tienda». Los filtros no cambian los datos de las compras.", "«Por país»: una fila por país y una columna por mes, con compras y unidades; la fila Total suma el monto. «Por producto»: qué SKU llegan cada mes y cuántas unidades, con un buscador y el total.", "Pulsa una celda, un país, un producto o el título de un mes para ver esas compras en la lista de abajo; pulsa una compra para abrir su ficha.", "Al final están las abiertas sin fecha de envío: aún no tienen planificación, así que conviene completarles la fecha para que entren al calendario."] },
      { titulo: "Reponer (solo administradores)", pasos: ["La pestaña «Reponer» muestra lo que se vende en Dropi del país de la barra y no tiene stock o le alcanza para menos de 15 días (con las ventas de Desempeño › Ventas Dropi). Si un producto está publicado varias veces en Dropi (pública y privadas), se suman sus ventas y su stock.", "«En camino» son las unidades de ese SKU en compras abiertas hacia ese país (de 01 - Cotizar a 05 - Arribo Mercancía), con la compra, su etapa y su planificación.", "«Sugerido» = venta por día de los últimos 30 días × los días a cubrir (30, 60 o 90; parte en 60) − stock − en camino. Si ya alcanza, dice «Ya alcanza».", "«Crear compra» abre la compra nueva con ese producto y esa cantidad elegidos: revisa la cantidad, escribe el costo, pulsa «Agregar a la orden» y completa el resto. Un producto de Dropi sin vincular a Producto no se puede comprar desde aquí: vincúlalo en Gestión de IDs Dropi."] },
      { titulo: "Planificación automática", pasos: ["La Planificación (el mes en que llega la compra) se calcula sola: no se escribe.", "Al poner o cambiar la Fecha de Envío, la vía o el país, el sistema le suma lo que tardaron los envíos anteriores de ese país por esa vía (la mediana; por ejemplo, Panamá por mar ~59 días, Costa Rica por mar ~85) y pone el mes de llegada.", "En la ficha, debajo de la Fecha de Envío, ves la llegada estimada y de dónde salen los días.", "Bajo la Fecha límite aparece la predicción: con el país, la vía (marítimo, aéreo o terrestre) y la Fecha de Envío, el sistema dice cuándo llegaría la compra (la fecha más probable) y el rango habitual (entre cuándo llegan la mayoría de los envíos de ese país por esa vía). «Usar como fecha límite» la pone en el campo; nunca la cambia sola y puedes escribir otra.", "Sin fecha de envío no hay planificación; las compras antiguas de ClickUp sin fecha de envío conservan la que tenían."] },
      { titulo: "Tiendas con color", pasos: ["Cada orden lleva una sola tienda: pulsa la celda (o el campo en la ficha) y elige otra, o escribe una nueva para crearla; pulsar la que ya está la quita.", "Cada tienda se ve con su color, en la columna y en la ficha, como las etiquetas.", "Al elegir la tienda, el lápiz junto a cada una despliega sus colores y su nombre.", "Cambiar el nombre lo cambia en todas las compras que tienen esa tienda (de todos los países); si escribes el nombre de otra tienda que ya existe, se juntan."] },
      { titulo: "Envíos: agentes, tiempos y tarifas", pasos: ["En la pestaña «Envíos» (después de Tiempos y fallas) arriba van los filtros (vía, agente y país), «Solo activas», «Agrupar por» país, agente o vía, «Descargar» y «Agregar ruta»; debajo, una sola barra de indicadores: rutas activas, el tiempo real de marítimo y aéreo contra su plazo, cuántas rutas cumplen y cuántas están fuera de plazo (pulsa esa última para ver solo esas).", "La lista tiene una fila por ruta y siempre las mismas columnas: plazo prometido, real de los últimos 12 meses (con los últimos 2 meses debajo), estado (En plazo, Fuera de plazo con los días de más, Sin medir o Sin plazo), la barra «uso del plazo», los envíos medidos y la tarifa vigente.", "Cómo leer la barra: la franja verde es el plazo que promete el agente, la línea negra su máximo, la barra oscura lo que de verdad tardó y la parte rayada en rojo lo que se pasó. Todas las barras usan la misma escala, así que se pueden comparar de una ruta a otra.", "A la derecha: «Para atender» (las rutas fuera de plazo, de la más atrasada a la menos), «Falta definir el plazo» y «Agentes», con cuántas de sus rutas medidas cumplen el plazo (pulsa un agente para ver solo sus rutas).", "Pulsa una fila para abrir su ficha: ahí activas o desactivas la ruta, cambias lo que promete, agregas tarifas por tipo de producto (por CBM o por kg, con la fecha desde la que rigen; la anterior queda en el historial) o la eliminas.", "«Agregar ruta» crea una ruta para cualquier país del mundo, aunque todavía no tenga compras.", "Lo real sale de las compras con su «Agente de envío», país, vía y fechas de envío y de llegada: pon el agente en cada compra."] },
      { titulo: "Editar sin abrir la ficha", pasos: ["Pulsa cualquier celda (etapa, fechas, montos…): se abre un panel pequeño debajo.", "Las opciones se guardan al elegirlas; lo escrito, con Enter o al pulsar fuera. Escape cancela.", "Para cambiar varias a la vez, márcalas con la casilla y usa la barra de abajo. Con la tabla agrupada, la casilla del grupo marca todas las de ese grupo."] },
      { titulo: "Productos de la compra", pasos: ["En la ficha completa, bloque «Productos»: busca el producto (o su variante) y escribe unidades y costo unitario o total; el otro se calcula solo.", "La Cantidad total y el Monto Total de la compra salen de sus productos.", "Mientras una compra no tenga productos verás la marca «Sin productos»."] },
      { titulo: "Comentarios y actividad", pasos: ["Al final de la ficha, el bloque «Actividad» junta todo como en ClickUp: los comentarios (con sus imágenes en miniatura; púlsalas para verlas grandes), cada cambio con su autor y hora, y los archivos.", "Arriba del bloque eliges ver Todo, solo Comentarios o solo Cambios; lo más nuevo queda abajo, junto al campo para comentar, y lo viejo se abre con «Ver anteriores».", "Comenta con @ para avisar a alguien; puedes pegar una captura, arrastrar o adjuntar imágenes, PDF, Excel, Word, PowerPoint, CSV o texto (hasta 25 MB cada uno).", "Debajo de cada comentario: 👍 «Me gusta», 😊 para reaccionar con otro emoji (pulsa el tuyo otra vez para quitarlo) y «Responder», que deja tu respuesta debajo y le avisa a quien lo escribió.", "En tus propios comentarios aparecen «Editar» y «Eliminar». Al editar corriges el texto, quitas archivos con su ✕ o agregas otros con «Adjuntar», y queda marcado «(editado)» (al pasar el cursor se ve cuándo); si agregas una @mención nueva, a esa persona le llega el aviso. «Eliminar» pide confirmación y borra el comentario con sus archivos; no se puede si tiene respuestas de otras personas.", "Empieza un comentario con «Inconveniente:» para marcar una falla (se ve en rojo)."] },
      { titulo: "Informe, Dashboard y Tiempos", pasos: ["Informe: lo creado, pagado y llegado por período.", "Dashboard: toda la operación con filtros que se cruzan.", "Tiempos y fallas: cuánto tarda cada tramo y qué está fallando."] },
    ],
  },
  {
    modulo: "portal-proveedor",
    titulo: "Portal del proveedor",
    ruta: "/portal-proveedor",
    resumen: "Lo que Chin cotiza, produce y envía, visto desde Ecomfive: sus cotizaciones para decidir, lo que espera precio y lo que viene en camino contra el plazo prometido.",
    secciones: [
      { titulo: "Qué es", pasos: ["Chin (proveedor y agente logístico) trabaja en un portal aparte, sin entrar al sistema. Ve una copia de sus compras con solo lo que le toca: producto, foto de referencia, país, vía, unidades y la nota que le dejes. No ve precios de venta, tiendas, responsables ni comentarios internos.", "Esta página es el lado de Ecomfive de ese portal. Lo que cambies aquí cambia la compra en Compras, y lo que cambies en Compras se ve aquí y en el portal de Chin.", "Una compra entra al portal cuando su proveedor es Chin y está en «01 - Cotizar» o más adelante. En Backlog o anulada no se ve."] },
      { titulo: "Pedir una cotización", pasos: ["En «En cotización» están las compras de Chin en «01 - Cotizar»: Chin las ve para ponerles precio.", "«Nueva compra en Cotizar» abre la compra nueva de Compras con Chin como proveedor y agente; la etapa ya arranca en «01 - Cotizar».", "Pulsa la columna «Nota para Chin» para escribirle algo de ese pedido (por ejemplo «Por favor cotizar 500 units y confirmar»). Se guarda con Enter o al salir del campo; Escape cancela."] },
      { titulo: "Decidir una cotización", pasos: ["En «Por decidir» están las que Chin ya cotizó: la foto de referencia (la de la compra) y la foto real que subió Chin, lado a lado, con unidades, costo por unidad y total.", "Si Chin cambió las unidades (la caja trae 960 y pediste 1,000), aparece «pediste 1,000».", "«Pasar a Producción» o «Descartar» (pide confirmar) cambia la etapa de la compra, igual que en Compras, y Chin lo ve en su portal. Necesitas poder modificar Compras."] },
      { titulo: "Tránsito", pasos: ["Arriba, una tarjeta por país y vía: la franja verde es el plazo que prometió Chin (el de su ruta en Compras › Envíos; por ejemplo, Costa Rica por mar 80 días), la barra gris el rango real de lo que llegó en 2026 y la raya su mediana.", "Abajo, lo que Chin envió y todavía no llega: días desde el envío, su plazo y el estado (En plazo, Llega en ≤ 7 días, Atrasado). Lo atrasado va primero.", "Cuando llega, «Marcar llegada» (pide confirmar) pasa la compra a «Arribo mercancía» con la fecha de hoy."] },
      { titulo: "Novedades", pasos: ["«Novedades del proveedor» junta lo que cambió Chin: cotizaciones, fotos, envíos y pagos confirmados. Lo nuevo va resaltado y la pestaña muestra cuántos hay sin leer.", "Cada cambio de Chin también le llega a Francis a la campana (Centro de notificaciones › Para ti), con un enlace a la pestaña donde se ve.", "«Marcar todo como leído» los da por vistos."] },
      { titulo: "Lo que hace Chin en su portal", pasos: ["Chin entra por la misma página de inicio de sesión del sistema, con su propia cuenta, y llega directo a su portal: no ve el menú ni nada más del sistema.", "En «Por cotizar» abre cada pedido y pone las unidades que puede enviar (si la caja trae 960 en vez de 1,000, las cambia), el costo por unidad o el total (uno calcula el otro), la foto del producto real y un comentario. La compra pasa a «Cotizado» con esas unidades y ese monto; la foto queda en la Actividad de la compra, en el comentario de su cotización, aparte de la foto de referencia.", "Mientras no decidas, en «Cotizado» puede corregir su cotización.", "En «En producción» marca cada pedido como enviado, con la fecha en que salió: la compra pasa a «Tracking» con su fecha de envío y su planificación, y empiezan los plazos de pago (el anticipo vence 10 días después).", "En «Enviado» ve los días en camino contra el plazo prometido. Arriba le aparece lo nuevo de Ecomfive (lo que confirmaste, descartaste o marcaste como llegado)."] },
      { titulo: "Cuenta de Chin (solo administradores)", pasos: ["La pestaña «Cuenta de Chin» crea la cuenta con su nombre y su correo, y muestra una clave temporal una sola vez: pásasela por un medio seguro junto con la dirección de entrada que aparece ahí.", "«Generar clave nueva» le da otra si la olvida; «Desactivar cuenta» le quita el acceso desde la siguiente página que abra.", "Por ahora Chin tiene una sola cuenta."] },
    ],
  },
  {
    modulo: "producto",
    titulo: "Producto",
    ruta: "/producto",
    resumen: "El catálogo único de productos (el mismo para todos los países): SKU, foto, variantes, código de barras, envío y compras.",
    secciones: [
      { titulo: "Crear un producto", pasos: ["Pulsa «Agregar»: el Estado arranca en Test (un producto nuevo se prueba primero), marca el Tipo (Simple o Compuesto) y escribe el nombre; mientras lo escribes, el SKU se sugiere solo, con el color, la talla o la cantidad de cápsulas que diga el nombre (BOLSO/NAYLA/GRAN/PURPURA). El N.º lo pone el sistema.", "Foto: súbela ahí mismo, arrástrala (del escritorio o de una página de internet) o pégala con Ctrl+V; queda como la foto del producto.", "Posible duplicado: al escribir el nombre o subir la foto, si ya hay un producto con un nombre o una foto parecidos sale el aviso «Posible duplicado» con su foto, SKU y nombre, y si se parece por el nombre, por la foto o por las dos. Revísalo antes de crear: el aviso no impide crearlo.", "Estado: Activo (se compra), Test (se está probando), Inactivo (ya no se vende bien; vende lo que le queda) o Descontinuado (ya no se va a traer más). Inactivo y Descontinuado no se pueden comprar hasta pasarlos a Activo en su ficha; se filtran con sus tarjetas arriba de la lista.", "Envío: desde la ficha de crear ya llenas si es producto físico, el embalaje, el tamaño empacado (largo × ancho × alto), el peso, el país de origen y el código SA, como en la ficha del producto.", "Cuando el producto se aprueba y en su ficha pasa de Test a Activo, el sistema crea sola su orden de compra en «01 - Cotizar», en el país de la barra de arriba, con su nombre y su foto; ahí agregas la cantidad y el costo al cotizar (un compuesto no lleva orden).", "Si es compuesto, en «Componentes» busca cada producto igual que en una orden de compra (escribe el SKU, el nombre o el N.º y elige de la lista con su foto) y pon su cantidad. Debajo se dibuja el mapa de cómo se arma: cada componente unido al producto nuevo.", "Código de barras: viene marcado «Interno» y ya ves su número y su etiqueta (que puedes imprimir) antes de crear el producto. Si el producto trae el del fabricante, elige «Del fabricante» y escríbelo; si no lleva, «Sin código de barras».", "Mientras escribes el nombre, el sistema sugiere un SKU con sus palabras separadas por barra (Ej: BALSAMO/PURPURA/MELAXIN); si escribes otro a mano, deja de cambiarlo. Las variantes agregan sus valores (…/ROJO/M).", "El SKU no puede repetirse: si ya lo tiene otro producto, el sistema te dice cuál. Para corregirlo después, «Cambiar» junto al SKU en la ficha, y cámbialo también en Dropi y Shopify.", "Marca «Tiene variantes» si se vende en colores o tallas y define sus opciones.", "Arranca en Test; pásalo a Activo cuando se vaya a comprar.", "Si un producto ya no se vende bien, cambia su Estado a «Inactivo» en su ficha: sigue vendiendo el stock que le queda y se sigue viendo en todas partes con su insignia gris, pero no se puede agregar a una compra. Para volver a comprarlo, pásalo otra vez a Activo (desde Compras te lo ofrece al agregarlo)."] },
      { titulo: "Categorías", pasos: ["Cada producto tiene una categoría de la taxonomía estándar de Shopify en español (la misma base que usan Google Shopping y Meta), por ejemplo «Salud y belleza › Cuidado personal › Cuidado capilar».", "Las categorías se pusieron solas mirando la foto y el nombre de cada producto. Las dudosas tienen un punto ámbar («Por revisar»): en la ficha, «Confirmar» la deja como está y «Cambiar» abre un buscador (escribe por ejemplo «crema facial» o «linterna»).", "En la lista, la columna «Categoría» muestra el último nivel (pasa el cursor para ver la ruta completa). Puedes filtrar y agrupar por «Categoría» (el grupo de reporte), «Categoría principal» (el primer nivel) y «Categoría por revisar».", "Al crear un producto, después de escribir el nombre (o subir la foto) el sistema sugiere hasta 3 categorías: por los productos ya clasificados que se le parecen («como Linterna Táctica Titanium») o, si ninguno se parece, por las palabras del nombre. Un clic elige una; «Buscar otra» abre el buscador. Es opcional: también se elige después en la ficha.", "Lo que una persona elige no lo cambia la clasificación automática."] },
      { titulo: "La ficha del producto", pasos: ["En la lista, pasa el cursor sobre el nombre de un producto: si es compuesto ves el mapa de cómo se arma; si es simple, su foto grande, en cuántas órdenes se compró, cuántas unidades y la última orden.", "Columna «Test»: dice «Test» en los productos que vienen de Test productos. Pasa el cursor encima para ver cómo le fue (Winner, Fallido, Consulta…) y los datos de su test: país, fecha, gasto, compras, CPA (verde si es menor a $4), CTR, hook y CVR, y «Ver en Test productos». Solo salen los tests vinculados a su producto; en el filtro «Test» eliges los que tuvieron test o no.", "Columna «Oferta»: el precio de la oferta con que se testeó (solo en los productos que vienen de Test productos).", "En la ficha del producto, si salió de Test productos, el bloque «Resultado del test» muestra si cumplió el criterio y las barras de CPA, compras, CTR, hook y CVR contra el promedio de los winners (la marca negra).", "La sección «Componentes» de un compuesto muestra el mismo mapa: cada componente con su cantidad unido al producto.", "Nombre: escríbelo en el campo «Nombre» del bloque Producto; se guarda al salir del campo o con Enter.", "Foto: con la ficha abierta, arrastra una imagen desde el escritorio o desde cualquier página de internet y suéltala, o pégala con Ctrl+V. También puedes usar «Subir foto» o «Cambiar».", "Código de barras: todos los productos tienen uno (el interno o el del fabricante); desde la ficha se cambia por el del fabricante y se imprime la etiqueta.", "Envío, vencimiento por lote y variantes se configuran en sus bloques."] },
      { titulo: "Copiar el SKU y ver sus publicaciones en Dropi", pasos: ["Pulsa un SKU, en la lista o en la ficha, y se copia al portapapeles (sale el aviso «SKU copiado»); el clic en la lista no abre la ficha. También funciona en el producto vinculado de la ficha de una publicación de Dropi.", "En el bloque «Asociaciones» de la ficha, «Publicaciones en Dropi» dice cómo se llama el producto en Dropi (el nombre de su publicación vinculada, con el país y el ID); pulsa el nombre para abrir la publicación en Gestión de IDs Dropi. No sale si no tiene publicación vinculada."] },
      { titulo: "Eliminar un producto", pasos: ["Solo un administrador ve «Eliminar» en la ficha del producto, encima de la actividad (columna de la derecha). Pide confirmación y borra el producto de verdad, con su foto.", "Solo se puede eliminar un producto que nada usa: sin compras, publicaciones de Dropi, tests, Filtro de productos, fichas de Shopify o de Dropi, variantes, movimientos de inventario, lotes ni stock, y que no sea componente de un compuesto. Si algo lo usa, no se borra nada y el aviso dice qué lo bloquea y cuántos son.", "Un producto que ya se compró o se vendió no se elimina: pásalo a Inactivo o Descontinuado. Dos productos repetidos se unen, no se borran."] },
      { titulo: "Histórico de compras", pasos: ["El bloque «Compras» muestra las unidades compradas desde la primera vez, lo invertido y cada compra.", "Si el producto se compró en varios países, las compras salen agrupadas por país: cada país con sus compras juntas (y su total de compras y unidades), empezando por el que más compró; dentro, de la más nueva a la más vieja.", "Solo cuenta las compras donde el producto está vinculado."] },
    ],
  },
  {
    modulo: "inventario",
    titulo: "Inventario",
    ruta: "/inventario",
    resumen: "El stock de cada producto por bodega del país en que estás, con sus movimientos y lotes.",
    secciones: [
      { titulo: "Leer el stock", pasos: ["Cada fila es un producto; elige una bodega arriba o mira el total.", "Disponible = lo que se puede vender. Un saldo negativo se ve en rojo y se corrige con una entrada o un ajuste."] },
      { titulo: "Mover stock", pasos: ["Abre el producto y usa Entrada, Salida o Ajuste.", "Si maneja vencimiento, la entrada pide lote y fecha; la salida sin lote sale por FEFO.", "Las bodegas externas (Dropi, Effi…) no se mueven a mano: llegan por sincronización."] },
      { titulo: "Vencimientos", pasos: ["La pestaña Vencimientos lista lotes vencidos y por vencer.", "Un lote vencido se da de baja con una salida que lo nombre."] },
    ],
  },
  {
    modulo: "wms-bodegas",
    titulo: "Bodegas",
    ruta: "/wms-bodegas",
    resumen: "Las bodegas de cada país: propias (las mueve el sistema) y externas (de un tercero).",
    secciones: [{ titulo: "Uso", pasos: ["«Agregar» crea una bodega; su ficha se edita ahí mismo.", "Una bodega no se borra: se desactiva, porque el stock y los movimientos dependen de ella."] }],
  },
  {
    modulo: "wms-ubicaciones",
    titulo: "Ubicaciones",
    ruta: "/wms-ubicaciones",
    resumen: "Los lugares dentro de cada bodega y su propiedad (normal, dañado, inspección, retenido).",
    secciones: [{ titulo: "Uso", pasos: ["Crea la ubicación con su código y bodega.", "La propiedad decide a qué cubeta suma lo que se guarde ahí.", "No se borra: se desactiva."] }],
  },
  {
    modulo: "alertas",
    titulo: "Alertas de inventario",
    ruta: "/alertas",
    resumen: "Inventario que una plataforma no devolvió y hay que reclamar.",
    secciones: [{ titulo: "Uso", pasos: ["Las tarjetas Abiertas, Reclamadas y Resueltas filtran la tabla.", "Abre una alerta para cambiar su estado; queda en su historial."] }],
  },
  {
    modulo: "pedidos-dropi",
    titulo: "Pedidos Dropi",
    ruta: "/pedidos-dropi",
    resumen: "Los pedidos que llegan de Dropi con su estado, para seguir entregas y novedades.",
    secciones: [{ titulo: "Uso", pasos: ["Elige el período y pulsa las tarjetas de estado para filtrar (se pueden combinar).", "«Descargar» baja lo que ves o el período completo."] }],
  },
  {
    modulo: "retiros",
    titulo: "Conciliación de Retiros",
    ruta: "/retiros",
    resumen: "Los retiros de la wallet de Dropi: se crean aquí, Dropi los aprueba y se concilian al llegar al banco.",
    secciones: [
      { titulo: "Crear un retiro", pasos: ["«Agregar»: elige la cuenta destino, el monto y la comisión.", "Escribe el correlativo (#0007) en el concepto del retiro en Dropi para que se vinculen solos."] },
      { titulo: "Conciliar", pasos: ["Cuando llegue el dinero, abre el retiro y pulsa «Conciliar»: anota lo recibido y la referencia; el soporte es opcional.", "Si algo no cuadra, «Novedad»; al resolverla, «Resolver»."] },
    ],
  },
  {
    modulo: "extractos",
    titulo: "Extractos bancarios",
    ruta: "/extractos",
    resumen: "Cargar el extracto del banco para cruzar los movimientos con lo registrado.",
    secciones: [{ titulo: "Uso", pasos: ["Sube el archivo del banco; los movimientos se clasifican con el Diccionario de patrones.", "Agrega un patrón para que un tipo de movimiento se reconozca solo la próxima vez."] }],
  },
  {
    modulo: "gastos",
    titulo: "Nómina y gastos",
    ruta: "/gastos",
    resumen: "Registro de gastos y nómina por categoría y mes.",
    secciones: [{ titulo: "Uso", pasos: ["«Agregar» registra un gasto con su categoría.", "Las tarjetas de categoría filtran la tabla del mes."] }],
  },
  {
    modulo: "productos",
    titulo: "Productos y márgenes",
    ruta: "/productos",
    resumen: "Costos y márgenes de los productos que se venden por plataforma.",
    secciones: [{ titulo: "Uso", pasos: ["El lápiz de una fila la vuelve editable; Guardar o Cancelar.", "Vincula cada fila con su producto (SKU) para unir ventas e inventario."] }],
  },
  {
    modulo: "productos-test",
    titulo: "Test productos",
    ruta: "/productos-test",
    resumen: "Los productos que se prueban en marketing y cuáles resultaron winners.",
    secciones: [{ titulo: "Uso", pasos: ["Al entrar a Test productos se abre la pestaña «Productos» (la lista); al lado están «Informe» y «Dashboard».", "Informe: tests por día, semana o mes y los winners (CPA menor a $4).", "Dashboard: todo el testing a la vez, con filtros que se cruzan (fechas, categoría, Test # y resultado). Pulsa una barra del periodo, una categoría o una fila de «Comparar por» para filtrar y otra vez para quitarlo. Trae la distribución del CPA contra el criterio, el CTR frente al CPA, los promedios de winners frente a fallidos, los mejores winners y lo que conviene revisar.", "Productos: la lista con su ficha; «Copiar informe» para compartir.", "Cada fila empieza con la foto del producto (la de Producto o, si no está vinculado, la de Filtro de productos); pasa el cursor encima para verla grande.", "Cada fila dice bajo el nombre si está «Vinculado» (punto verde, con el SKU de su producto) o «Sin vincular» (punto ámbar).", "Arriba de la lista: Total en test, Winners, En consulta, Fallidos, Otros estados y Sin vincular, cada uno con su número (púlsalos para filtrar), y cuántos faltan por vincular a Producto.", "Al agregar un producto en prueba, en «Producto (de Producto)» búscalo como en una orden de compra (foto, SKU, nombre y N.º): el nombre se llena solo y queda vinculado a su producto.", "Todo producto vinculado cuyo producto esté Activo en Producto pasa solo a Filtro de productos, en «Cotizar», con su foto y sus métricas (no se repite si ya está).", "«+ Agregar» abre el formulario del producto en test. Si el producto aún no existe, pulsa «Nuevo producto», junto al campo «Producto (de Producto)»: abre la misma ficha de Producto (estado, tipo, foto, SKU, código de barras, envío…). Al crearlo vuelves al formulario con ese producto ya elegido y el nombre lleno; completa el test y guárdalo. «Volver al test» regresa sin crear. Hace falta poder modificar Producto."] }],
  },
  {
    modulo: "scraping-proveedores",
    titulo: "Scraping de proveedores",
    ruta: "/scraping-proveedores",
    resumen: "Los productos de proveedores de Dropi con su precio y stock en el tiempo.",
    secciones: [
      {
        titulo: "Uso",
        pasos: [
          "Sigue a proveedores de Dropi: arriba, una tarjeta por proveedor con sus órdenes, productos y dropshippers y si subieron (▲ verde) o bajaron (▼ rojo) desde el registro anterior. Pulsa una tarjeta para ver ese proveedor.",
          "«Agregar proveedor»: su nombre, el enlace de su página en Dropi (https://app.dropi.mx/dashboard/provider/…) y sus órdenes, productos y dropshippers de hoy. Queda pedida su primera búsqueda completa.",
          "«Actualizar datos» guarda las cifras de hoy escritas a mano. Cada búsqueda además las lee sola de Dropi («Leído de Dropi» en «Datos del proveedor»).",
          "«Buscar ahora» pide una búsqueda nueva. La corre el equipo con la sesión de Dropi: una búsqueda de un proveedor de unos 800 productos dura menos de un minuto.",
          "Las tarjetas Subieron de stock, Bajaron de stock, Cambiaron de precio, Nuevos, Privados y Desaparecieron comparan con la búsqueda anterior y filtran la tabla al pulsarlas.",
          "La tabla trae cada producto con foto, nombre, precio, stock, cómo se movió el stock en 4 semanas y la fecha de su última revisión; va de los más recientes en Dropi a los más viejos. Pulsa una fila para ver su historial: cada cambio de precio y de stock, cuándo desapareció o volvió.",
          "Dropi solo muestra a un dropshipper los productos publicados con stock: por eso la tabla trae menos productos que la cifra «Productos» del proveedor, que cuenta también los sin stock y los privados de otros dropshippers.",
          "Un producto que deja de aparecer queda «Desapareció»: «se agotó» si le quedaban 10 unidades o menos, «lo hizo privado» si apareció un privado con el mismo nombre, o «dejó de aparecer».",
          "Los privados («Privado …», con el logo del proveedor en vez de foto) se vinculan solos al producto con foto del mismo nombre cuando tienen 2 palabras en común o más y 85 % de parecido; con menos, salen como «posible pareja» para que lo revises. La ficha del producto publicado lista sus privados con su precio y stock.",
          "Cada precio sale en la moneda del proveedor y debajo en dólares, con el tipo de cambio del día (se lee solo cada día; arriba de la tabla dice cuál se usó).",
          "Marcas bajo el nombre: «Prioridad» (en rojo) si el mismo producto está en otro proveedor o fuente; «Ya testeado» o «Ya en Producto» si ya lo vimos (pasa el cursor para ver con cuál); «En Selección» si ya se envió. Las tarjetas Prioridad y Ya vistos los filtran.",
          "Pasa el cursor por una foto para verla grande. La ficha trae el historial en una tabla: fecha, qué pasó, precio y stock de antes y después con su diferencia.",
          "«Enviar a Selección» (en la ficha, o marcando varios en la tabla y usando la barra de abajo) los pasa a Selección de productos como «Seleccionado», con sus precios en dólares; los que ya se testearon o ya están en Producto llegan «Descartado» con la nota del motivo.",
        ],
      },
    ],
  },
  {
    modulo: "creacion-ofertas",
    titulo: "Creación de ofertas",
    ruta: "/creacion-ofertas",
    resumen: "Las ofertas (de 1 a 3) de cada producto seleccionado, con su margen.",
    secciones: [
      {
        titulo: "Uso",
        pasos: [
          "Con al menos una oferta con precio, «Enviar a Test» crea el producto en Producto (en Test, con un SKU sacado del nombre, código de barras interno y su foto) y su registro en Test productos, ya vinculados a la fila de Selección y con el precio de su primera oferta. La fila pasa a «En test» y sale de esta lista. Hace falta poder modificar Producto y Test productos.",
          "Aquí salen los productos de Selección de productos en estado «Crear oferta», del país de la barra de arriba.",
          "Cada producto puede tener de 1 a 3 ofertas: nombre (p. ej. «2x1»), unidades, precio en dólares y notas. Llena la fila vacía y pulsa «Agregar»; cambia una oferta y pulsa «Guardar»; «Quitar» la borra.",
          "El margen es el precio menos el costo del proveedor por las unidades de la oferta (en verde si gana, en rojo si pierde), con su porcentaje sobre el precio.",
        ],
      },
    ],
  },
  {
    modulo: "ventas-dropi",
    titulo: "Ventas Dropi",
    ruta: "/ventas-dropi",
    resumen: "Cuánto vende cada producto que tenemos en Dropi, qué se está acabando, qué crece y qué cae, y quién vende.",
    secciones: [
      {
        titulo: "Uso",
        pasos: [
          "Arriba: las unidades netas de los últimos 30 días contra los 30 anteriores, cuántos productos se venden y ya no tienen stock (y cuántos se acaban en menos de 15 días), el % cancelado y el % devuelto o rechazado de todo lo pedido, los productos sin ventas en 30 días y los dropshippers que pidieron en 30 días.",
          "Netas = unidades pedidas − canceladas − rechazadas − devueltas. Una orden que todavía va en camino cuenta como neta; si la devuelven, se descuenta ese día.",
          "«Unidades por mes» parte lo pedido en netas, canceladas y devueltas o rechazadas (el mes en curso lleva *); «Netas por día» muestra los últimos 90 días.",
          "«Reponer ya»: lo que se vendió en 30 días y no tiene stock o le alcanza para menos de 15 días (días de inventario = stock ÷ netas por día de los últimos 30 días). «Crecen» y «Caen» comparan los últimos 30 días con los 30 anteriores (con 10 o más netas antes). «Stock que no se mueve»: productos activos con stock y sin ventas en 30 días.",
          "«Todos los productos» se busca por nombre, ID o SKU, se filtra por categoría (Estrella 100+ al mes, Se vende 10 a 99, Lento 1 a 9, Sin ventas en 30 días, Nunca vendió) y se ordena con un clic en cada encabezado. Al tocar un producto se ven sus ventas por mes y sus alertas.",
          "«Por SKU del sistema» suma las publicaciones de Dropi de un mismo producto (públicas y privadas) según el vínculo de Gestión de IDs Dropi. «Dropshippers»: quién creó cada orden; lo cancelado, rechazado o devuelto se le carga por el número de orden.",
          "Los datos salen del Historial de Existencia de Dropi y se cargan con una importación; la página dice hasta qué día llegan. No se actualizan solos.",
        ],
      },
    ],
  },
  {
    modulo: "publicaciones-dropi",
    titulo: "Gestión de IDs Dropi",
    ruta: "/publicaciones-dropi",
    resumen: "Los productos que tenemos publicados en Dropi como proveedor: precio, margen, venta, stock y revisión.",
    secciones: [
      {
        titulo: "Uso",
        pasos: [
          "Arriba está el tablero de acciones: lo que espera una decisión (Revisar precio y venta, Verificar con dropshipper, Validar bajar precio, Bajar precio, Revisión vencida, Margen bajo, Sin vincular a Producto y Sin stock). Cada tarjeta cuenta las publicaciones y, al pulsarla, filtra la lista; pulsarla otra vez quita el filtro, y las del flujo de trabajo se pueden juntar.",
          "Debajo, cada fila es un producto publicado en Dropi en el país de la barra de arriba, con su foto, su ID de Dropi, su SKU, su estado y sus números. La lista arranca agrupada por estado (Producto nuevo, Revisar precio y venta, Verificar con dropshipper, Validar bajar precio, Bajar precio, Al día); los archivados se ven con el botón «Archivados».",
          "Utilidad bruta = precio de venta − costo mercancía − fulfillment, y Margen bruto = utilidad bruta ÷ precio: se calculan solos. Un punto rojo en el margen bruto avisa que está por debajo de 30 %. «Coste real» es lo que costó la última compra (aparte del costo mercancía).",
          "La lista muestra la próxima revisión de cada publicación (28 días después de la última revisión, que viene de ClickUp), con un punto ámbar si ya pasó; el filtro «Revisión» › «Revisión vencida» y su tarjeta del tablero las separan. La ficha ya no trae «Revisión» ni «Marcar revisada hoy»: no se cambian desde ahí.",
          "Pulsa una fila para abrir su ficha: ahí se cambia todo (estado, precio y costos, venta, dónde está, reposición, privatización y notas) y se guarda con «Guardar cambios». Si cambias el precio, «Último cambio de precio» pasa a hoy. Las flechas de arriba pasan a la anterior o la siguiente. Si la publicación está vinculada a un producto, su SKU se copia con un clic y la ficha trae «En camino»: las unidades de sus compras que ya salieron y todavía no llegan, solo unidades y solo las del país seleccionado arriba (sin el detalle de cada compra), y «Competencia del producto»: los competidores que venden lo mismo en Dropi (por nombre o por foto), con su precio, su stock y lo que vendieron en 7 y 30 días, igual que en la ficha de Producto y en Compras. Solo un administrador ve «Eliminar» (en la ficha y en el ícono de papelera al final de cada fila), que borra la publicación de verdad (el resto la archiva con el estado «Archivado»).",
          "«Agregar» crea una publicación nueva: arranca como «Producto nuevo», publicada hoy, con su número correlativo (PUB-0001…), propio del sistema y distinto al ID de Dropi; sirve para buscarla y para nombrarla sin depender del ID que ponga Dropi.",
          "Los datos vienen de la lista «GCC 🇵🇦 Ecomfive Panamá» de ClickUp.",
          "Cada publicación se vincula con su producto de Producto (el SKU sale en cada fila). Las que tenían el SKU o el nombre idéntico ya se vincularon solas. Para las demás, la ficha muestra una sugerencia (por la misma foto o un nombre parecido) con «Vincular» o «Vincular y siguiente» para revisarlas una tras otra; si no es la correcta, busca otro producto por SKU o nombre. Filtra «Vínculo con Producto» para ver las pendientes.",
          "Un pack («PACK 2», «2x1») se vincula con su compuesto de Producto, no con el producto simple (al vender descontaría mal el inventario). Si el compuesto no existe, la ficha dice «Falta el compuesto»: créalo en Producto con esa cantidad y vincúlalo.",
          "Un administrador ve además las ventas en Dropi de cada publicación (de Desempeño › Ventas Dropi; si tiene dos IDs, suma los dos): en la fila, las unidades netas de 30 días, el stock y para cuántos días alcanza, con un punto rojo si se vende sin stock y naranja si se acaba en menos de 15 días; en la ficha, la sección «Ventas en Dropi» con las netas por mes, cancelaciones y devoluciones. Junto a «Estado de venta» sale el que dicen los datos («Según Dropi», con los cortes de 30 días: Más vendidos +500, Estable +100, Lento 20 a 99, Estancado menos de 20, Sin stock) y «Usar» lo pone. Los filtros «Stock en Dropi», «Estado de venta según Dropi» y «Estado de venta vs. Dropi» encuentran lo que hay que reponer o actualizar.",
        ],
      },
    ],
  },
  {
    modulo: "generador-landings",
    titulo: "Generador de landings",
    ruta: "/generador-landings",
    resumen: "La landing del test de cada producto: imágenes, textos, secciones y vista previa.",
    secciones: [
      {
        titulo: "Uso",
        pasos: [
          "Arriba salen las landings del país de la barra de arriba; debajo, los productos de Creación de ofertas (o ya en test) que todavía no tienen landing. Pulsa «Desde cero» o «Clonar una landing» para crearla: toma el nombre del producto, su foto como foto del proveedor y el precio de su primera oferta en la moneda de la tienda. «Agregar» crea una landing sin producto.",
          "El editor tiene cinco pasos (los ya vistos salen en verde y «Siguiente» abajo pasa al próximo) y, a la derecha, la vista previa de la landing en móvil o escritorio, que cambia mientras escribes; arriba de ella dice si hay cambios sin guardar, si es borrador o si ya está publicada. Arriba a la derecha se elige «Crear desde cero» o «Clonar una landing». Lo escrito se guarda con «Guardar cambios» (arriba); las imágenes se guardan solas al subirlas.",
          "Producto: nombre, ángulo de venta, precio, precio tachado, las fotos del proveedor (hasta 6, con «+ Subir fotos») y notas para la IA. «Generar imágenes con Gemini» lleva al paso Imágenes y crea las que faltan. Para clonar, pega el enlace de una landing que funcione y pulsa «Analizar»: muestra sus títulos en orden, sus imágenes y cuántos botones de compra tiene, para tomar su estructura. No se copian sus textos ni sus fotos.",
          "Imágenes: cinco espacios (Portada, Detalle, En uso, Variantes y Empaque), cada uno con su instrucción. «Generar» crea la imagen de ese espacio con Gemini (tarda de 10 a 40 segundos) usando como referencia las fotos del proveedor, para que el producto salga igual; si no hay fotos del proveedor, usa la portada. «Generar las que faltan» las hace una tras otra, la portada primero, y muestra el avance sobre la vista previa. «Regenerar» reemplaza la que hay: cambia la instrucción si no te gustó. También se pueden subir a mano (JPG, PNG, WebP o GIF, hasta 10 MB). Cada imagen generada cuesta unos 3 centavos de dólar.",
          "Textos: franja de arriba, titular, subtítulo, botón, beneficios, comparativa, preguntas frecuentes, reseñas y garantía. Las reseñas deben ser de clientes reales. Arriba, un aviso marca las frases que suenan a promesa de salud o de resultados («cura», «adelgaza», «dormir mejor»…), que Meta suele rechazar en anuncios. «Escribir con Claude» se activa cuando se conecte Claude.",
          "Secciones: sube, baja, muestra u oculta cada bloque. El bloque Ofertas muestra las de Creación de ofertas, pasadas a la moneda de la tienda con el tipo de cambio del día.",
          "Publicar: lista lo que falta (titular, precio, portada y lo de los bloques visibles) y los pasos en Shopify, cada uno en verde cuando ya se hizo. Cuando no falta nada, al guardar la landing pasa sola a «Lista».",
          "«Crear borrador en Shopify» (con la landing guardada y sin faltantes) crea el producto en la tienda como borrador: título, precio, precio tachado, las imágenes (la portada primero) y la landing como descripción. Si el producto tiene 2 o más ofertas con precio en Creación de ofertas, cada una queda como variante («Oferta»). Tarda hasta un minuto. Luego salen los enlaces al admin de Shopify y a la vista previa en la tienda.",
          "«Actualizar en Shopify» vuelve a mandar lo que cambiaste (textos, precio, imágenes). «Publicar en la tienda» (pide confirmar) lo activa en la Tienda online y la landing pasa a «Publicada»; si viene de Selección, su enlace queda como página del producto en su test de Test productos.",
        ],
      },
    ],
  },
  {
    modulo: "instagram",
    titulo: "Instagram",
    ruta: "/instagram",
    resumen: "Los productos que el equipo ve en Instagram y comparte con la cuenta de fuentes, listos para decidir si se testean.",
    secciones: [
      {
        titulo: "Uso",
        pasos: [
          "Cuando alguien del equipo ve en Instagram un producto que puede servir para testear, lo comparte por mensaje directo (el avión de papel) con la cuenta de fuentes del equipo, @ecomfive.fuentes. Cae solo en esta lista, sin escribir nada.",
          "Cada fila es una captura con su N.º (IG-0001), su formato (con enlace, con video, con imagen o varias), quién la envió, cuándo llegó y su estado. Cae «Nuevo»; pásala a «Por testear» o «Descartado» pulsando su estado en la lista (sin abrir la ficha) o desde la ficha. Lo descartado se oculta; el botón «Descartados» de la barra lo muestra aparte.",
          "Pulsa una captura para abrir su ficha: el video guardado en nuestro almacenamiento (no depende de que el reel siga publicado), el copy y el enlace de Instagram, quién lo compartió y el mensaje que escribió, las métricas (me gusta, comentarios, vistas) si se pudieron consultar, y al final su actividad.",
          "Instagram no entrega la página de destino: para tenerla siempre, escribe el enlace de la tienda en el mensaje al compartir. Instagram lo manda como un mensaje aparte y el sistema lo une a tu última captura (hasta 20 minutos después) y lo guarda como «Página de destino»; si no, toma el primer enlace que aparezca en el copy. Filtra por «Sin página» para completar a mano lo que falte, junto con las notas. La lista se actualiza sola cada 30 segundos. Para que llegue el enlace: abre primero la publicación o el anuncio y compártelo con su avión de papel; si lo reenvías desde una conversación llega solo el archivo. Si compartes lo mismo varias veces (o una vez como archivo y otra como enlace), todo queda en una sola ficha, que dice «Compartida N veces» con quién y cuándo, y se completa con los datos de cada envío; el botón «Fusionar repetidas» junta las que ya estaban separadas. Si compartes un archivo, copia el enlace de Instagram y mándalo como mensaje: se une a esa captura y la completa. Una captura de prueba se borra con «Eliminar captura» al final de su ficha (pide confirmación y no se puede deshacer), y un envío fusionado se saca de la lista con «Quitar». Si una imagen o un archivo no se guardó, pulsa «Reintentar el archivo» en su ficha. Cuando una captura llega solo como archivo y no tiene enlace, la ficha ofrece un campo «Enlace de Instagram» (Google y las búsquedas por cuenta no lo encuentran de forma fiable): pega ahí el enlace y el sistema lee su página y completa el video y las cifras. Con el enlace, el sistema completa solo el video (o la imagen), los me gusta, los comentarios, la cuenta, el nombre de la página y la fecha, sin importar cómo se compartió; si una captura llegó antes o Instagram no respondió, pulsa «Completar desde el enlace» en su ficha. Una captura que llega solo como archivo no trae enlace. Para un anuncio, la ficha trae «Buscar el anuncio en la Biblioteca de anuncios»: abre la búsqueda del copy en la Biblioteca pública de Meta, donde aparece el anuncio con la dirección de su botón de compra. Para contar cuántos anuncios de la misma página llevan ese copy, arrastra «Leer Biblioteca» (en el bloque «Biblioteca de anuncios» de la ficha) a tu barra de favoritos y púlsalo con la Biblioteca abierta: se abre una pestaña de la plataforma, llena la columna «Anuncios (mismo copy)» de todas las capturas que coincidan y, si la captura no tenía página de destino, la completa con la del botón del anuncio. Si la Biblioteca tiene más anuncios de los que cargó, baja la página hasta el final y púlsalo otra vez; el número también se puede corregir a mano. Si el nombre de la cuenta en Instagram no es el de la página en la Biblioteca, la lectura no reconoce la captura: en esa misma pantalla marca los anuncios que son y elige la captura en «Vincular a mano»; la próxima lectura ya la reconoce sola. El botón de búsqueda usa el copy completo (más exacto que la primera línea) y «Ver los anuncios de la página» abre la Biblioteca con el nombre de la página para ver todo lo que corre; al lado están los enlaces al perfil de Instagram, la página de Facebook o la cuenta de TikTok. Desde el celular (Android) puedes saltarte el mensaje directo: instala la plataforma como app (Chrome › menú ⋮ › «Instalar aplicación», con tu sesión iniciada) y, en un anuncio o reel de Instagram, o en un video de Facebook o TikTok, pulsa compartir › «Compartir en…» › «Ecomfive Fuentes»: se guarda como una captura con su enlace, su texto, sus cifras, el nombre de la cuenta o página y, en TikTok y en los videos de Facebook, su video; la columna «Red» dice de cuál es. De TikTok no hay Biblioteca de anuncios pública para estos países: la ficha ofrece buscar el texto en TikTok, abrir la cuenta y los Top Ads del país. Si el mismo anuncio llegó dos veces (una como archivo reenviado desde un chat y otra con enlace), abre una de las dos y usa «Unir con otra captura»: aparecen primero las que el sistema sugiere (llegaron con pocos minutos de diferencia) y después todas las demás; queda la más antigua con todos los datos. En la lista, «Se puede unir con IG-00NN» marca las de solo archivo que tienen una candidata clara. En iPhone no se instala como app: se crea un atajo. Atajo de iPhone (una vez): en la app Atajos toca «+», ponle de nombre «Ecomfive Fuentes», toca ⓘ y activa «Mostrar en hoja de compartir» (tipos aceptados: URLs y Texto). Agrega la acción «Texto» y escribe https://mom-beta-proveduria.vercel.app/instagram/compartir?url= seguido de la variable «Entrada del atajo»; agrega «Abrir URLs» con ese texto y toca «Listo». Debes tener la sesión de la plataforma iniciada en Safari. Para usarlo: en Instagram, avión de papel › «Compartir en…» › «Atajos» › «Ecomfive Fuentes». Un reel siempre trae su enlace de Instagram; una publicación no. Los me gusta, los comentarios, la cuenta que lo publicó y la fecha se llenan solos al recibir la captura, leyendo lo que la página pública del reel muestra (aparece «Leído de la vista pública de Instagram · dato no oficial»); si Instagram no lo muestra, quedan vacíos. Las vistas y los compartidos no se muestran. En las capturas de TikTok sí se ven las vistas, los compartidos y los guardados; en las de Facebook, las reproducciones y las reacciones que muestre la vista previa (la fecha de publicación de un post de Facebook no se puede leer: se escribe a mano). Todo se puede corregir en «Cifras de la publicación» de la ficha. Una publicación que llega sin enlace no trae cifras.",
          "No hay botón «Agregar»: las capturas las crea Instagram. Un reel llega con su copy y su enlace, pero sin el archivo de video: la ficha lo dice y trae el botón «Ver en Instagram». Una publicación de video llega con el archivo guardado. Los anuncios patrocinados pueden no llegar.",
        ],
      },
    ],
  },
  {
    modulo: "sugerencias-clientes",
    titulo: "Sugerencias de clientes",
    ruta: "/sugerencias-clientes",
    resumen: "Los productos que nos recomiendan los dropshippers, para decidir cuáles pasan a Selección.",
    secciones: [
      {
        titulo: "Uso",
        pasos: [
          "En la ficha del cliente en el CRM, «Productos recomendados» muestra su % de acierto (Winners sobre recomendados), cuántos se compraron y el recorrido de cada producto con sus días, para contárselo al cliente (sin cantidades ni costos).",
          "Exclusividad: el producto es exclusivo del cliente que lo recomendó durante 30 días desde que queda disponible para vender. Al abrir el producto en su ficha del CRM se puede pasar a 60 o 90 días; si no llegó a venderse, no aplica. La ficha del producto en Producto dice de quién es y hasta cuándo.",
          "Las sugerencias llegan desde la ficha del cliente en el CRM (botón «Recomendar») o con «Agregar» aquí mismo, eligiendo el cliente por su código del CRM (DS-0014).",
          "Cada una lleva su código SUG-, la foto, el nombre, quién la recomendó, el país donde la vio, la categoría y notas.",
          "Estados: Nuevo, Seleccionado y Descartado. Al marcarla Seleccionado pasa sola a Selección de productos con el mismo código SUG-; si el producto ya se testeó o ya está en Producto, en Selección llega Descartado con el motivo.",
          "Una sugerencia ya seleccionada no vuelve atrás: su recorrido sigue en Selección.",
          "Lo descartado se oculta; el botón «Descartados» de la barra lo muestra aparte.",
        ],
      },
    ],
  },
  {
    modulo: "seleccion-productos",
    titulo: "Selección de productos",
    ruta: "/seleccion-productos",
    resumen: "El tablero donde caen los productos candidatos de las fuentes y se decide cuáles se testean.",
    secciones: [
      {
        titulo: "Uso",
        pasos: [
          "Cada fila es un candidato, no un producto de Producto: no lleva SKU. Trae su N.º (SEL-0001), la fuente de donde salió y el código de esa fuente (DK-0001 Drop Killer, TW-0001 Tu Winner, SP-0001 Scraping de proveedores, MAN-0001 a mano).",
          "«Agregar» crea una fila a mano, siempre «Manual» (código MAN-): lo que sale de Drop Killer, Tu Winner o Scraping de proveedores se crea en su módulo y se envía desde ahí, para que quede en la base de la fuente y no se duplique. Lleva nombre, foto, fecha de captación, categoría, responsable, enlaces (página y Ad Library), precios de referencia en dólares y notas.",
          "Los estados son Seleccionado, Crear oferta, En test y Descartado. Lo que llega de una fuente o se crea a mano entra Seleccionado; pásalo a «Crear oferta» para armarle sus ofertas en Creación de ofertas; al enviarlo a Test (o vincularlo a un test) pasa a «En test». Cambia el estado pulsando la insignia de su celda o en la ficha; para varias filas, márcalas y usa «Estado» en la barra de abajo.",
          "Si el producto ya se testeó (Test productos, de cualquier país) o ya está en Producto, entra Descartado solo, con la nota de por qué bajo su nombre («Ya testeado: … » o «Ya está en Producto: …»).",
          "«Prioridad» (en rojo bajo el nombre) marca lo que aparece en más de un proveedor de Scraping o en otra fuente: se está vendiendo fuerte. Pasa el cursor para ver dónde más está; se puede filtrar y agrupar por Prioridad.",
          "La columna «Ofertas» dice cuántas tiene (de 3). Los precios de Scraping llegan pasados a dólares; la ficha muestra también el costo en la moneda del proveedor.",
          "Lo descartado se oculta; el botón «Descartados» de la barra lo muestra aparte.",
          "Pulsa el nombre para abrir su ficha: ahí se edita todo y, al final, está su actividad.",
        ],
      },
    ],
  },
  {
    modulo: "filtro-productos",
    titulo: "Filtro de productos",
    ruta: "/filtro-productos",
    resumen: "Ideas de productos evaluadas antes de pasarlas a test.",
    secciones: [{ titulo: "Uso", pasos: ["«Agregar» crea la ficha con su foto y datos.", "Filtra y agrupa para decidir qué pasa a test.", "En «Producto (de Producto)» búscalo como en una orden de compra (foto, SKU, nombre y N.º): el nombre se llena solo y queda vinculado a su producto."] }],
  },
  {
    modulo: "crm-dropshippers",
    titulo: "CRM Dropshippers",
    ruta: "/crm-dropshippers",
    resumen: "La ficha de cada dropshipper con su historial, casos, notas y desempeño.",
    secciones: [
      { titulo: "Uso", pasos: ["Directorio: busca y abre la ficha de un dropshipper.", "Registra interacciones y casos; con @ avisas a un compañero.", "Vínculos: une a cada dropshipper con su usuario de Dropi para ver su desempeño.", "«Ventas en Dropi» de la ficha muestra lo que vendió en Dropi por sus cuentas vinculadas (de Desempeño › Ventas Dropi): netas de los últimos 30 días y de siempre, % no efectivo (cancelado, rechazado o devuelto), última orden, netas por mes y qué productos vende. Las fichas con la etiqueta «Creado desde Dropi» se crearon solas a partir de quienes compran en Dropi Panamá, con su nombre, correo, teléfono y cuenta de Dropi; las que dicen «Revisar: ¿cuenta interna?» pueden ser cuentas de ECOMFIVE."] },
    ],
  },
  {
    modulo: "analisis-competencia",
    titulo: "Análisis de competencia",
    ruta: "/analisis-competencia",
    resumen: "Todo el catálogo de Dropi del país comparado con lo que vende ECOMFIVE: competidores, sus productos, precios y stock.",
    secciones: [
      {
        titulo: "Uso",
        pasos: [
          "Cada día se lee todo el catálogo de Dropi del país (Panamá: unos 1.450 productos de 93 proveedores, en segundos) con una cuenta de dropshipper, y se compara con lo que vende ECOMFIVE por nombre y por foto.",
          "Dos pestañas: Competidores (la pantalla principal) y Resumen (las gráficas). Arriba de las dos está la barra de indicadores: competidores, nuestros productos con competencia, cuántos venden más barato que nosotros, el stock que vendió la competencia en 7 días y las novedades sin ver.",
          "Qué hacer hoy: las decisiones que salen de los datos, con su motivo y sus números. Bajar precio (vamos perdiendo en precio y un competidor más barato vendió en 7 días), Oportunidad de stock (a un competidor con un producto igual al nuestro le queda stock para menos de 6 semanas al ritmo de la última semana, o lo dejó de mostrar), Vigilar (competidor nuevo o que empezó a vender un producto igual al nuestro) y Mantener precio (somos los más baratos y la competencia vende). Toca una para abrir su competidor; las pastillas de arriba filtran por tipo.",
          "Nuestros productos frente a la competencia: cada producto nuestro con su posición en precio: Ganando (somos los más baratos), Empatado o Perdiendo, con «#2 de 3», una escalera de dónde quedamos y cuánto más caros o baratos estamos. Los que van perdiendo salen primero. El precio de la competencia se lleva al tamaño de nuestro producto: si los dos nombres dicen su contenido (cápsulas, ml o g), se compara por contenido (60 cápsulas a $6.00 equivalen a $12.00 por nuestras 120); si no, por unidades (PACK-2, 2x1, X2, «2 Pares», «COMBO A y B»: frente a un PACK-2 nuestro, la unidad de otro cuenta el doble). Nuestro precio se muestra tal cual y, cuando hubo conversión, se ve «equivalente» con su precio y tamaño reales.",
          "Novedades: lo que cambió desde la búsqueda anterior en los productos iguales a los nuestros (bajó el precio, en rojo si ya vende más barato que nosotros; bajó el stock; dejó de mostrarlo) y los competidores nuevos. Toca una para abrir su competidor; «Vista» la marca leída.",
          "Competidores: busca un competidor o un producto, usa los filtros de un toque (venden productos nuestros, más baratos que nosotros, con cambios) y ordena por lo vendido, por iguales a los nuestros o por productos. Toca un competidor para abrirlo ahí mismo: sus productos, primero los iguales a los nuestros con su precio frente al nuestro, su stock y lo vendido en 7 y 30 días. «Ver historial» despliega cada vez que bajó o subió el stock y cada cambio de precio. La foto se agranda con un clic.",
          "Stock vendido: Dropi no muestra las ventas de otro proveedor; se cuenta lo que bajó su stock entre búsquedas (solo las bajadas: una reposición no resta lo vendido).",
          "Resumen: el stock vendido por día, las alertas de 30 días, los competidores y las categorías que más venden, nuestro precio frente al más bajo y los productos que más venden, con filtros que se cruzan.",
          "Un competidor nuevo sale también en «Hoy», en Avisos y como contador en el menú. Desde Producto y Compras: la ficha de un producto trae «Competencia en Dropi» y cada producto de una compra tiene «Ver competencia en Dropi».",
        ],
      },
    ],
  },
  {
    modulo: "inteligencia-competitiva",
    titulo: "Inteligencia competitiva",
    ruta: "/inteligencia-competitiva",
    resumen: "Seguimiento de proveedores y competidores rastreados.",
    secciones: [{ titulo: "Uso", pasos: ["Abre un proveedor para ver su historial.", "Filtra la lista por lo que quieres comparar."] }],
  },
  {
    modulo: "usuarios",
    titulo: "Usuarios y roles",
    ruta: "/usuarios",
    resumen: "Quién trabaja en el sistema, qué módulos ve cada rol, qué ve cada persona dentro de un módulo y qué países ve.",
    secciones: [
      { titulo: "Personas", pasos: ["«Crear usuario» crea la cuenta; comparte la contraseña temporal por fuera.", "Pulsa el nombre de una persona para abrir su ficha: rol, permisos propios, países, puestos, datos, suspender o eliminar.", "«Ver así» te deja ver el sistema como lo ve esa persona."] },
      { titulo: "Roles", pasos: ["Elige un rol en la lista: a la derecha está su matriz, con tres niveles por módulo: Sin acceso, Solo lectura y Edición.", "Los botones de cada área aplican un nivel a todos sus módulos. Los cambios se guardan solos.", "«Crear rol» parte de otro rol, en blanco o con todo en solo lectura; también se puede duplicar un rol o copiarle los permisos de otro."] },
      { titulo: "Afinar un módulo", pasos: ["En un módulo que lo permite (hoy Compras) pulsa «Afinar»: decide qué pestañas ve el rol, qué acciones puede usar, qué campos ve, solo ve u oculta y qué compras alcanza.", "A la derecha ves cómo lo vería: lo que no puede ver simplemente no aparece."] },
      { titulo: "Permisos propios", pasos: ["En la ficha de una persona, «Permisos propios» suma, quita, sube o baja un módulo solo para ella, encima de lo que da su rol.", "«Acceso efectivo» muestra lo que de verdad puede."] },
    ],
  },
  {
    modulo: "puestos",
    titulo: "Puestos y organigrama",
    ruta: "/puestos",
    resumen: "Qué hace cada puesto, de qué responde, a quién reporta, quién lo ocupa y qué manuales y cursos tiene que conocer.",
    secciones: [
      { titulo: "Crear un puesto", pasos: ["«Agregar» pide el nombre, el área, a quién reporta, cuántas plazas tiene y su misión.", "En su ficha se completan las responsabilidades, las áreas de resultado (una por línea, hasta 6) y la autoridad (lo que puede decidir o aprobar)."] },
      { titulo: "Personas", pasos: ["En el bloque «Personas» de la ficha se asigna a alguien al puesto; también desde su ficha en Usuarios y roles.", "Una persona puede tener varios puestos: el primero queda como principal y se cambia con «Hacer principal».", "Un punto ámbar marca los puestos con plazas vacantes."] },
      { titulo: "SOP y onboarding", pasos: ["«Añadir manual o curso» enlaza un Manual de proceso o un curso de la Universidad y elige en qué etapa va: Día 30, 60, 90 o De consulta.", "El avance de cada persona sale de los cursos que aprobó y los manuales que marcó como leídos. Si un manual cambia, hay que volver a leerlo."] },
      { titulo: "Organigrama", pasos: ["La pestaña «Organigrama» arma el árbol con «Reporta a» y muestra quién ocupa cada puesto.", "Se filtra por área; pulsar una caja abre la ficha del puesto.", "Un puesto no se borra: se desactiva (antes hay que quitar a sus personas)."] },
      { titulo: "Mi puesto", pasos: ["Cada persona ve lo suyo en «Mi puesto», en el menú de su cuenta (arriba a la derecha): su jefe, su equipo, su puesto y su onboarding."] },
    ],
  },
  {
    modulo: "notificaciones",
    titulo: "Avisos",
    ruta: "/notificaciones",
    resumen: "Lo pendiente del sistema y tus menciones («Para ti»).",
    secciones: [{ titulo: "Uso", pasos: ["«Para ti» trae los comentarios donde te mencionaron, con el enlace directo.", "Márcalos como leídos uno a uno o todos."] }],
  },
];

/** Las guías que puede ver una persona según sus módulos. */
export const guiasPara = (modulos: string[]) => GUIAS.filter((g) => modulos.includes(g.modulo));
/** Los términos del glosario que le sirven: los generales y los de sus módulos. */
export const glosarioPara = (modulos: string[]) => GLOSARIO.filter((t) => !t.modulos || t.modulos.some((m) => modulos.includes(m)));

export interface Novedad {
  /** AAAA-MM-DD. */
  fecha: string;
  titulo: string;
  texto: string;
  /** Módulo al que pertenece (para mostrarla solo a quien lo usa); sin módulo, para todos. */
  modulo?: string;
  /** Dónde verla. */
  href?: string;
}

/** Lo nuevo del sistema, de lo más reciente a lo más viejo. La tarea diaria del Centro de ayuda agrega aquí lo que se publica. */
export const NOVEDADES: Novedad[] = [
  { fecha: "2026-10-21", titulo: "Publicaciones en Dropi, en Asociaciones", texto: "En la ficha de un producto, sus publicaciones de Dropi pasaron al bloque «Asociaciones», junto a las demás fichas enlazadas. Pulsa una para abrirla directo en Gestión de IDs Dropi.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-21", titulo: "Gestión de IDs Dropi: la ficha sin responsable ni revisión", texto: "La ficha de una publicación ya no trae el responsable ni el bloque «Revisión» (última y próxima revisión), ni el botón «Marcar revisada hoy»; «Agregar» tampoco pide responsable. Las notas siguen en su propio bloque.", modulo: "publicaciones-dropi", href: "/publicaciones-dropi" },
  { fecha: "2026-10-21", titulo: "Producto: las compras, agrupadas por país", texto: "En la ficha de un producto, el bloque «Compras» agrupa las compras por país (cada país con sus compras juntas y su total de compras y unidades) cuando se compró en más de uno.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-21", titulo: "Envíos: ya se guardan los cambios de una ruta", texto: "En Compras › Envíos no se podían guardar los cambios de una ruta (ni activarla, eliminarla o agregarle tarifas): ya funciona. Si lo intentaste antes, vuelve a hacerlo.", modulo: "compras", href: "/compras/envios" },
  { fecha: "2026-10-21", titulo: "Nuevo ícono en la pestaña del navegador", texto: "La pestaña del sistema (y el ícono al guardarlo en el celular) lleva ahora la «E» del logo de Ecomfive con su línea en L, en rojo.", href: "/" },
  { fecha: "2026-10-21", titulo: "Chin ya tiene su portal", texto: "Chin entra con su propia cuenta (la crea un administrador en Portal del proveedor › «Cuenta de Chin») y ve solo sus pedidos: cotiza con la foto real y las unidades por caja, y marca lo que envía. Cada cambio pasa a la compra, aparece en «Novedades del proveedor» y le llega a Francis a la campana.", modulo: "portal-proveedor", href: "/portal-proveedor" },
  { fecha: "2026-10-21", titulo: "La ficha del producto, como ventana", texto: "La ficha de un producto se abre ahora como una ventana grande al centro, como una tarea de ClickUp: los datos a la izquierda y la actividad a la derecha, cada uno con su desplazamiento. Escape o un clic fuera la cierran. La fecha de creación sale arriba a la derecha y «Eliminar» (solo administradores) encima de la actividad. El bloque de Dropi se llama «Publicaciones en Dropi».", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-21", titulo: "Categoría sugerida al crear un producto", texto: "En «Nuevo producto», al escribir el nombre o subir la foto, el sistema sugiere la categoría por los productos parecidos que ya están clasificados (o por las palabras del nombre). Un clic la elige.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-21", titulo: "Portal del proveedor", texto: "Debajo de Compras está «Portal del proveedor»: lo que Chin cotiza, produce y envía. Ahí decides sus cotizaciones (con la foto de referencia y la real lado a lado), le dejas notas a lo que está en Cotizar y ves lo que viene en camino contra el plazo prometido, con «Marcar llegada». El portal de Chin llega en la próxima entrega.", modulo: "portal-proveedor", href: "/portal-proveedor" },
  { fecha: "2026-10-21", titulo: "Eliminar productos (administradores)", texto: "En la ficha de un producto, los administradores ven «Eliminar». Solo borra un producto que nada usa (sin compras, publicaciones, tests, fichas, variantes, movimientos ni stock); si algo lo usa, el aviso dice qué lo bloquea. Requiere correr la migración 0125.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-21", titulo: "Predicción de la fecha límite", texto: "En la ficha de una compra, al poner el país, la vía (marítimo, aéreo…) y la fecha de envío, bajo la Fecha límite aparece cuándo llegaría según lo que tardaron los envíos anteriores de ese país por esa vía, con su rango habitual y un botón «Usar como fecha límite».", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-21", titulo: "Envíos, más fácil de leer", texto: "Compras › Envíos ahora es una sola lista de rutas, agrupable por país, agente o vía, con las mismas columnas en cada fila: plazo prometido, real, estado (En plazo, Fuera de plazo, Sin medir, Sin plazo) y una barra que compara lo que tardó con el plazo. A la derecha ves qué atender primero. Ya no hay vista de tarjetas ni de tabla, y el interruptor de activar o desactivar está en la ficha de cada ruta.", modulo: "compras", href: "/compras/envios" },
  { fecha: "2026-10-21", titulo: "Lo que viene en camino, en la ficha", texto: "La ficha de una publicación de Dropi trae «En camino»: las unidades de las compras de su producto que ya salieron y todavía no llegan, solo unidades y solo del país seleccionado arriba (con Panamá, solo lo de Panamá). Y en la ficha de Producto, el bloque «Compras» agrupa las compras por país. Es la misma regla de «En tránsito» de Compras (orden abierta, con fecha de envío y sin fecha de llegada).", modulo: "publicaciones-dropi", href: "/publicaciones-dropi" },
  { fecha: "2026-10-21", titulo: "Planificación: tiendas por marca y solo mar o aire", texto: "En Compras › Planificación, el filtro de tienda ofrece las marcas (Ecomfive, Kenku, Clicksi, Mercado Libre, Nube/Oferta, Oferfy, Otras tiendas y Sin tienda) sin repetirlas por país, y el de vía solo Marítimo y Aéreo: lo terrestre y lo que no tiene vía cuenta como marítimo.", modulo: "compras", href: "/compras/planificacion" },
  { fecha: "2026-10-21", titulo: "Competencia completa en cada ficha", texto: "La competencia de un producto ahora se une también por su publicación de Dropi (su ID), no solo por el parecido del nombre y la foto. Así los productos que estaban en Análisis de competencia pero no mostraban nada en su ficha ya traen nuestro precio y stock en Dropi y sus competidores, y la búsqueda de competidores usa también el nombre con que está el producto en Dropi.", modulo: "analisis-competencia", href: "/analisis-competencia" },
  { fecha: "2026-10-21", titulo: "Correlativo en las publicaciones de Dropi", texto: "Cada publicación de Gestión de publicaciones Dropi tiene ahora su propio número, PUB-0001, PUB-0002…, distinto al ID de Dropi: lo pone el sistema al crearla y no cambia. Se ve en la fila y en la ficha, se puede buscar y sale en la descarga.", modulo: "publicaciones-dropi", href: "/publicaciones-dropi" },
  { fecha: "2026-10-21", titulo: "Copiar el SKU con un clic y nombre en Dropi", texto: "En Producto, al pulsar un SKU (en la lista o en la ficha) se copia al portapapeles. La ficha de un producto también dice «Nombre en Dropi», con el nombre de su publicación vinculada, y la de una publicación nombra ese campo «Nombre en Dropi».", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-21", titulo: "Ahora se llama Gestión de IDs Dropi", texto: "Gestión de publicaciones Dropi pasa a llamarse «Gestión de IDs Dropi» (Operación › Fulfillment). En su ficha, la utilidad y el margen se llaman ahora «Utilidad bruta» y «Margen bruto».", modulo: "publicaciones-dropi", href: "/publicaciones-dropi" },
  { fecha: "2026-10-21", titulo: "Competencia en la ficha de la publicación", texto: "La ficha de una publicación de Gestión de publicaciones Dropi ya muestra la competencia de su producto vinculado: quién más lo vende en Dropi, a qué precio, con cuánto stock y cuánto vendió en 7 y 30 días, con su historial. Son los mismos datos de Producto y de Compras.", modulo: "publicaciones-dropi", href: "/publicaciones-dropi" },
  { fecha: "2026-10-21", titulo: "Ventas en Dropi en la ficha de cada dropshipper", texto: "La ficha del dropshipper en el CRM tiene «Ventas en Dropi»: netas de 30 días y de siempre, % no efectivo, última orden, netas por mes y qué productos vende. Se vincularon 53 dropshippers con su usuario de Dropi Panamá (por correo, teléfono o nombre idéntico) y se crearon 372 fichas nuevas para quienes compran en Dropi y no estaban en el CRM (etiqueta «Creado desde Dropi»).", modulo: "crm-dropshippers", href: "/crm-dropshippers/directorio" },
  { fecha: "2026-10-21", titulo: "Compras › Reponer", texto: "Para administradores: Compras tiene la pestaña «Reponer», con lo que se vende en Dropi y se está acabando, por SKU, lo que ya viene en compras abiertas y cuánto comprar para cubrir 60 días de venta (o 30 o 90). «Crear compra» abre la compra nueva con el producto y la cantidad ya elegidos.", modulo: "compras", href: "/compras/reponer" },
  { fecha: "2026-10-21", titulo: "Ventas de Dropi en cada publicación", texto: "Para administradores: Gestión de publicaciones Dropi muestra las ventas en Dropi de cada publicación (netas de 30 días, stock y días de inventario) y, en la ficha, sus ventas por mes y el estado de venta que dicen los datos, con «Usar» para ponerlo. Nuevos filtros: Stock en Dropi y Estado de venta según Dropi.", modulo: "publicaciones-dropi", href: "/publicaciones-dropi" },
  { fecha: "2026-10-21", titulo: "Ventas Dropi en Desempeño", texto: "Desempeño tiene «Ventas Dropi»: las unidades netas de cada producto que tenemos en Dropi (pedidas menos canceladas, rechazadas y devueltas), por mes y por día, qué hay que reponer, qué crece y qué cae, el stock que no se mueve, las ventas por SKU y por dropshipper. Sale del Historial de Existencia de Dropi.", modulo: "ventas-dropi", href: "/ventas-dropi" },
  { fecha: "2026-10-21", titulo: "Publicaciones Dropi: lista y tablero de acciones", texto: "Gestión de publicaciones Dropi se ve ahora como una lista de filas (foto, nombre con su ID y SKU, estado, precio, utilidad, margen, dónde está y revisión) en vez de una tabla, con un tablero de acciones arriba: lo que hay que revisar, bajar de precio, vincular o reponer, con su cantidad; al pulsar una tarjeta filtra la lista. Un administrador también puede eliminar una publicación, desde su ficha o desde la papelera de la fila.", modulo: "publicaciones-dropi", href: "/publicaciones-dropi" },
  { fecha: "2026-10-21", titulo: "SKU con su variante", texto: "El SKU de un producto ahora dice qué lo distingue de otro igual: el color, la talla o la cantidad de cápsulas (por ejemplo BANDA/EJERCICIO/PEDALES/MORADO o ACEITE/OREGANO/CAPSULAS/300/VERDE), en vez de un /2 o /3. Al crear un producto, la sugerencia ya lo agrega sola desde el nombre, y los productos que se distinguían por número se pasaron a la nueva forma.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-21", titulo: "Cada persona ve solo lo suyo", texto: "Si tu rol no incluye una sección, esa sección ya no aparece ni te dice «sin acceso»: el menú muestra solo las áreas y páginas que puedes abrir, y si entras a una dirección que no es tuya vas directo a tu primera página. Tampoco salen enlaces a módulos que no puedes abrir." },
  { fecha: "2026-10-21", titulo: "Nuevo diseño del Generador de landings", texto: "El editor de landings se ve como el boceto aprobado: pasos con número (en verde los ya vistos), «Crear desde cero» o «Clonar una landing» arriba, botones con ícono, la vista previa con su estado y el avance de Gemini encima mientras genera las imágenes. En Textos, un aviso marca las frases que Meta suele rechazar.", modulo: "generador-landings", href: "/generador-landings" },
  { fecha: "2026-10-20", titulo: "Usuarios y roles, rediseñado", texto: "Personas, Roles y la ficha de cada persona se ven distintos: cada módulo se da con tres niveles (Sin acceso, Solo lectura o Edición), con una barra que muestra cuánto cubre el rol. Se pueden crear roles copiando otro, y darle a una persona permisos propios encima de su rol. En Compras, «Afinar» decide qué pestañas, acciones, campos y compras ve cada rol o persona: lo que no puede ver no aparece.", modulo: "usuarios", href: "/usuarios" },
  { fecha: "2026-10-21", titulo: "Publicaciones Dropi vinculadas con Producto", texto: "Cada publicación de Gestión de publicaciones Dropi se vincula con su producto (SKU) de Producto. Las de SKU o nombre idéntico ya quedaron vinculadas; para las demás, la ficha sugiere el producto (misma foto o nombre parecido) y se confirma con un clic. Los packs van a su compuesto.", modulo: "publicaciones-dropi", href: "/publicaciones-dropi" },
  { fecha: "2026-10-21", titulo: "Gestión de publicaciones Dropi", texto: "Operación › Fulfillment tiene «Gestión de publicaciones Dropi», debajo de Compras: los productos que tenemos publicados en Dropi como proveedor (antes la lista GCC de ClickUp), con precio, margen calculado, estado de venta, dónde está el stock, reposición, privatización y la próxima revisión cada 28 días.", modulo: "publicaciones-dropi", href: "/publicaciones-dropi" },
];

/** Las novedades que le sirven a una persona (las generales y las de sus módulos). */
export const novedadesPara = (modulos: string[]) => NOVEDADES.filter((n) => !n.modulo || modulos.includes(n.modulo));
