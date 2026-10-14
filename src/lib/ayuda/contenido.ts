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
  { termino: "Rol", definicion: "El conjunto de permisos que tiene una persona: qué módulos abre y cuáles son solo de lectura. Se configura en Usuarios y roles." },
  { termino: "Países permitidos", definicion: "Los países cuyas compras, histórico y datos puede ver una persona. «Todos los países» no limita nada." },
  { termino: "Ficha", definicion: "El panel que se abre a la derecha al pulsar una fila: muestra todo de ese registro y, si tienes permiso, ahí mismo se edita." },
  { termino: "Vista guardada", definicion: "Una combinación de filtros, agrupación y columnas que guardas con nombre en una tabla para volver a ella con un clic." },
  { termino: "Cerrados", definicion: "El botón de la barra de una tabla que muestra lo que ya terminó (compras completadas, retiros conciliados). Por defecto se ocultan." },
  { termino: "Mención (@)", definicion: "Escribir @ y el nombre de alguien en un comentario o nota: le llega un aviso en «Para ti» con el enlace al comentario." },
  { termino: "SKU", definicion: "El código único de un producto: lo identifica en el WMS, Shopify, las tiendas y Dropi, y con él una venta encuentra el producto para descontar inventario. Lo escribes al crear el producto y no puede repetirse: si ya existe, el sistema te avisa. Se puede corregir desde la ficha por uno que no exista (y hay que cambiarlo también en las plataformas).", modulos: ["producto", "inventario", "compras"] },
  { termino: "Captura de Instagram", definicion: "Un reel, publicación o video que alguien del equipo compartió por mensaje directo con la cuenta de fuentes. Cae solo en Testing Lab › Instagram con su video guardado, su copy y quién lo envió; su código es IG-0001, IG-0002…", modulos: ["instagram"] },
  { termino: "N.º de producto", definicion: "El correlativo que pone el sistema al crear un producto (#0001, #0002…). Ordena la lista de productos; no se repite ni se cambia.", modulos: ["producto"] },
  { termino: "Producto simple", definicion: "Un producto que se compra y se guarda tal cual.", modulos: ["producto", "inventario"] },
  { termino: "Producto compuesto (combo)", definicion: "Una combinación de productos simples con su cantidad. No guarda stock: al venderlo se descuenta cada componente.", modulos: ["producto", "inventario"] },
  { termino: "Variante", definicion: "Una versión de un producto (color, talla…). Cada variante tiene su propio SKU y su stock; las compras se hacen por variante, no por el producto padre.", modulos: ["producto", "inventario", "compras"] },
  { termino: "Activo / Test", definicion: "El estado de un producto. Test: se está probando, todavía no se compra ni tiene stock. Activo: se compra y tiene inventario.", modulos: ["producto", "inventario", "compras"] },
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
  { termino: "Ruta de envío", definicion: "Lo que ofrece un agente para llevar a un país por una vía (marítimo o aéreo, DDP o DAP): el tiempo que promete, sus tarifas y si el canal está activo. Están en Compras › Envíos.", modulos: ["compras"] },
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
      { titulo: "Anular una compra", pasos: ["Una compra no se borra: en su ficha, «Anular» pide el motivo y la pasa a la etapa Descartado (Estado Completado), con la insignia «Anulada».", "Conserva su N.º OC, su código ECOM, su actividad y sus productos. Se ve con las demás descartadas: activa «Cerrados» y mira el grupo Descartado. Deja de contar en la planificación, los envíos y el histórico de compras del producto.", "Desde su ficha, «Restaurar» la devuelve a la etapa y el estado que tenía. Anular y restaurar quedan en su Actividad y en la auditoría."] },
      { titulo: "Planificación automática", pasos: ["La Planificación (el mes en que llega la compra) se calcula sola: no se escribe.", "Al poner o cambiar la Fecha de Envío, la vía o el país, el sistema le suma lo que tardaron los envíos anteriores de ese país por esa vía (la mediana; por ejemplo, Panamá por mar ~59 días, Costa Rica por mar ~85) y pone el mes de llegada.", "En la ficha, debajo de la Fecha de Envío, ves la llegada estimada y de dónde salen los días.", "Sin fecha de envío no hay planificación; las compras antiguas de ClickUp sin fecha de envío conservan la que tenían."] },
      { titulo: "Tiendas con color", pasos: ["Cada orden lleva una sola tienda: pulsa la celda (o el campo en la ficha) y elige otra, o escribe una nueva para crearla; pulsar la que ya está la quita.", "Cada tienda se ve con su color, en la columna y en la ficha, como las etiquetas.", "Al elegir la tienda, el lápiz junto a cada una despliega sus colores y su nombre.", "Cambiar el nombre lo cambia en todas las compras que tienen esa tienda (de todos los países); si escribes el nombre de otra tienda que ya existe, se juntan."] },
      { titulo: "Envíos: agentes, tiempos y tarifas", pasos: ["En la pestaña «Envíos» (después de Tiempos y fallas) arriba están los indicadores (países, rutas activas, agentes, tiempo real de marítimo y aéreo contra lo prometido, y cuántas rutas tardan más), la barra «prometido vs. real» de todos los países y el ranking de agentes (pulsa uno para ver solo sus rutas).", "Debajo, una tarjeta por país con lo que tarda cada vía y una fila por ruta: el agente, la vía, lo real contra lo prometido con su barra, la tarifa y el interruptor para activarla o desactivarla. «+ Ruta» en la tarjeta agrega otro agente o vía a ese país; «Agregar ruta» arriba sirve para un país nuevo.", "Filtra por vía, agente o país, o pasa a la vista «Tabla» para ver todas las columnas.", "Un punto rojo en «Últimos 12 meses» dice que el agente tarda más de lo que promete.", "Arriba, «Todos los países» junta todo en una barra por vía: la franja verde es lo prometido y los puntos lo real (promedio histórico, últimos 12 meses y últimos 2 meses); un punto con borde rojo pasa de lo prometido.", "En la fila de cada país ves en pequeño cuánto tarda cada vía juntando a todos sus agentes, y al final del grupo su total con las mismas columnas; abajo, el total de todos los países.", "«Agregar» crea una ruta para cualquier país del mundo, aunque todavía no tenga compras.", "En la ficha de una ruta la activas o desactivas, cambias lo que promete y agregas tarifas por tipo de producto (por CBM o por kg) con la fecha desde la que rigen; la anterior queda en el historial.", "Lo real sale de las compras con su «Agente de envío», país, vía y fechas de envío y llegada: pon el agente en cada compra."] },
      { titulo: "Editar sin abrir la ficha", pasos: ["Pulsa cualquier celda (etapa, fechas, montos…): se abre un panel pequeño debajo.", "Las opciones se guardan al elegirlas; lo escrito, con Enter o al pulsar fuera. Escape cancela.", "Para cambiar varias a la vez, márcalas con la casilla y usa la barra de abajo. Con la tabla agrupada, la casilla del grupo marca todas las de ese grupo."] },
      { titulo: "Productos de la compra", pasos: ["En la ficha completa, bloque «Productos»: busca el producto (o su variante) y escribe unidades y costo unitario o total; el otro se calcula solo.", "La Cantidad total y el Monto Total de la compra salen de sus productos.", "Mientras una compra no tenga productos verás la marca «Sin productos»."] },
      { titulo: "Comentarios y actividad", pasos: ["Al final de la ficha, el bloque «Actividad» junta todo como en ClickUp: los comentarios (con sus imágenes en miniatura; púlsalas para verlas grandes), cada cambio con su autor y hora, y los archivos.", "Arriba del bloque eliges ver Todo, solo Comentarios o solo Cambios; lo más nuevo queda abajo, junto al campo para comentar, y lo viejo se abre con «Ver anteriores».", "Comenta con @ para avisar a alguien; puedes pegar una captura, arrastrar o adjuntar imágenes, PDF, Excel, Word, PowerPoint, CSV o texto (hasta 25 MB cada uno).", "Debajo de cada comentario: 👍 «Me gusta», 😊 para reaccionar con otro emoji (pulsa el tuyo otra vez para quitarlo) y «Responder», que deja tu respuesta debajo y le avisa a quien lo escribió.", "En tus propios comentarios aparecen «Editar» y «Eliminar». Al editar corriges el texto, quitas archivos con su ✕ o agregas otros con «Adjuntar», y queda marcado «(editado)» (al pasar el cursor se ve cuándo); si agregas una @mención nueva, a esa persona le llega el aviso. «Eliminar» pide confirmación y borra el comentario con sus archivos; no se puede si tiene respuestas de otras personas.", "Empieza un comentario con «Inconveniente:» para marcar una falla (se ve en rojo)."] },
      { titulo: "Informe, Dashboard y Tiempos", pasos: ["Informe: lo creado, pagado y llegado por período.", "Dashboard: toda la operación con filtros que se cruzan.", "Tiempos y fallas: cuánto tarda cada tramo y qué está fallando."] },
    ],
  },
  {
    modulo: "producto",
    titulo: "Producto",
    ruta: "/producto",
    resumen: "El catálogo único de productos (el mismo para todos los países): SKU, foto, variantes, código de barras, envío y compras.",
    secciones: [
      { titulo: "Crear un producto", pasos: ["Pulsa «Agregar»: el Estado arranca en Test (un producto nuevo se prueba primero), marca el Tipo (Simple o Compuesto) y escribe el nombre; mientras lo escribes, el SKU se sugiere solo. El N.º lo pone el sistema.", "Foto: súbela ahí mismo, arrástrala (del escritorio o de una página de internet) o pégala con Ctrl+V; queda como la foto del producto.", "Posible duplicado: al escribir el nombre o subir la foto, si ya hay un producto con un nombre o una foto parecidos sale el aviso «Posible duplicado» con su foto, SKU y nombre, y si se parece por el nombre, por la foto o por las dos. Revísalo antes de crear: el aviso no impide crearlo.", "Estado: Activo (se compra), Test (se está probando), Inactivo (ya no se vende bien; vende lo que le queda) o Descontinuado (ya no se va a traer más). Inactivo y Descontinuado no se pueden comprar hasta pasarlos a Activo en su ficha; se filtran con sus tarjetas arriba de la lista.", "Envío: desde la ficha de crear ya llenas si es producto físico, el embalaje, el tamaño empacado (largo × ancho × alto), el peso, el país de origen y el código SA, como en la ficha del producto.", "Cuando el producto se aprueba y en su ficha pasa de Test a Activo, el sistema crea sola su orden de compra en «01 - Cotizar», en el país de la barra de arriba, con su nombre y su foto; ahí agregas la cantidad y el costo al cotizar (un compuesto no lleva orden).", "Si es compuesto, en «Componentes» busca cada producto igual que en una orden de compra (escribe el SKU, el nombre o el N.º y elige de la lista con su foto) y pon su cantidad. Debajo se dibuja el mapa de cómo se arma: cada componente unido al producto nuevo.", "Código de barras: viene marcado «Interno» y ya ves su número y su etiqueta (que puedes imprimir) antes de crear el producto. Si el producto trae el del fabricante, elige «Del fabricante» y escríbelo; si no lleva, «Sin código de barras».", "Mientras escribes el nombre, el sistema sugiere un SKU con sus palabras separadas por barra (Ej: BALSAMO/PURPURA/MELAXIN); si escribes otro a mano, deja de cambiarlo. Las variantes agregan sus valores (…/ROJO/M).", "El SKU no puede repetirse: si ya lo tiene otro producto, el sistema te dice cuál. Para corregirlo después, «Cambiar» junto al SKU en la ficha, y cámbialo también en Dropi y Shopify.", "Marca «Tiene variantes» si se vende en colores o tallas y define sus opciones.", "Arranca en Test; pásalo a Activo cuando se vaya a comprar.", "Si un producto ya no se vende bien, cambia su Estado a «Inactivo» en su ficha: sigue vendiendo el stock que le queda y se sigue viendo en todas partes con su insignia gris, pero no se puede agregar a una compra. Para volver a comprarlo, pásalo otra vez a Activo (desde Compras te lo ofrece al agregarlo)."] },
      { titulo: "La ficha del producto", pasos: ["En la lista, pasa el cursor sobre el nombre de un producto: si es compuesto ves el mapa de cómo se arma; si es simple, su foto grande, en cuántas órdenes se compró, cuántas unidades y la última orden.", "Columna «Test»: dice «Test» en los productos que vienen de Test productos. Pasa el cursor encima para ver cómo le fue (Winner, Fallido, Consulta…) y los datos de su test: país, fecha, gasto, compras, CPA (verde si es menor a $4), CTR, hook y CVR, y «Ver en Test productos». Solo salen los tests vinculados a su producto; en el filtro «Test» eliges los que tuvieron test o no.", "Columna «Oferta»: el precio de la oferta con que se testeó (solo en los productos que vienen de Test productos).", "En la ficha del producto, si salió de Test productos, el bloque «Resultado del test» muestra si cumplió el criterio y las barras de CPA, compras, CTR, hook y CVR contra el promedio de los winners (la marca negra).", "La sección «Componentes» de un compuesto muestra el mismo mapa: cada componente con su cantidad unido al producto.", "Nombre: escríbelo en el campo «Nombre» del bloque Producto; se guarda al salir del campo o con Enter.", "Foto: con la ficha abierta, arrastra una imagen desde el escritorio o desde cualquier página de internet y suéltala, o pégala con Ctrl+V. También puedes usar «Subir foto» o «Cambiar».", "Código de barras: todos los productos tienen uno (el interno o el del fabricante); desde la ficha se cambia por el del fabricante y se imprime la etiqueta.", "Envío, vencimiento por lote y variantes se configuran en sus bloques."] },
      { titulo: "Histórico de compras", pasos: ["El bloque «Compras» muestra las unidades compradas desde la primera vez, lo invertido y cada compra.", "Solo cuenta las compras donde el producto está vinculado."] },
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
          "Aquí salen los productos de Selección de productos en estado «Crear oferta», del país de la barra de arriba.",
          "Cada producto puede tener de 1 a 3 ofertas: nombre (p. ej. «2x1»), unidades, precio en dólares y notas. Llena la fila vacía y pulsa «Agregar»; cambia una oferta y pulsa «Guardar»; «Quitar» la borra.",
          "El margen es el precio menos el costo del proveedor por las unidades de la oferta (en verde si gana, en rojo si pierde), con su porcentaje sobre el precio.",
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
          "Cada fila es una captura con su N.º (IG-0001), su tipo (reel, publicación o video), quién la envió, cuándo llegó y su estado. Cae «Nuevo»; pásala a «Por testear» o «Descartado» pulsando su estado en la lista (sin abrir la ficha) o desde la ficha. Lo descartado se oculta; el botón «Descartados» de la barra lo muestra aparte.",
          "Pulsa una captura para abrir su ficha: el video guardado en nuestro almacenamiento (no depende de que el reel siga publicado), el copy y el enlace de Instagram, quién lo compartió y el mensaje que escribió, las métricas (me gusta, comentarios, vistas) si se pudieron consultar, y al final su actividad.",
          "Instagram no entrega la página de destino: para tenerla siempre, escribe el enlace de la tienda en el mensaje al compartir. Instagram lo manda como un mensaje aparte y el sistema lo une a tu última captura (hasta 20 minutos después) y lo guarda como «Página de destino»; si no, toma el primer enlace que aparezca en el copy. Filtra por «Sin página» para completar a mano lo que falte, junto con las notas. Un reel siempre trae su enlace de Instagram; una publicación no. Los me gusta, los comentarios, la cuenta que lo publicó y la fecha se llenan solos al recibir la captura, leyendo lo que la página pública del reel muestra (aparece «Leído de la vista pública de Instagram · dato no oficial»); si Instagram no lo muestra, quedan vacíos. Las vistas y los compartidos no son públicos: se escriben a mano. Todo se puede corregir en «Cifras de la publicación» de la ficha. Una publicación que llega sin enlace no trae cifras.",
          "No hay botón «Agregar»: las capturas las crea Instagram. Un reel llega con su copy y su enlace, pero sin el archivo de video: la ficha lo dice y trae el botón «Ver en Instagram». Una publicación de video llega con el archivo guardado. Los anuncios patrocinados pueden no llegar.",
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
          "Los estados son Seleccionado, Crear oferta y Descartado. Lo que llega de una fuente o se crea a mano entra Seleccionado; pásalo a «Crear oferta» para armarle sus ofertas en Creación de ofertas. Cambia el estado pulsando la insignia de su celda o en la ficha; para varias filas, márcalas y usa «Estado» en la barra de abajo.",
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
      { titulo: "Uso", pasos: ["Directorio: busca y abre la ficha de un dropshipper.", "Registra interacciones y casos; con @ avisas a un compañero.", "Vínculos: une a cada dropshipper con su usuario de Dropi para ver su desempeño."] },
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
    resumen: "Quién trabaja en el sistema, qué módulos ve cada rol y qué países ve cada persona.",
    secciones: [
      { titulo: "Personas", pasos: ["«Agregar» crea la cuenta; comparte la contraseña temporal por fuera.", "En la ficha: rol, países permitidos, suspender o eliminar."] },
      { titulo: "Roles", pasos: ["Cada rol marca qué módulos abre y cuáles son solo de lectura.", "«Ver así» te deja probar el sistema con los permisos de otro rol."] },
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
  { fecha: "2026-10-14", titulo: "Análisis de competencia en una pantalla", texto: "Análisis de competencia ahora tiene solo dos pestañas: Competidores y Resumen. En Competidores, las novedades van arriba y cada competidor se abre en su sitio con sus productos (los iguales a los nuestros primero, con el precio frente al nuestro); cada producto despliega su historial.", modulo: "analisis-competencia", href: "/analisis-competencia" },
  { fecha: "2026-10-14", titulo: "Sin «Nuevos que no tenemos»", texto: "Análisis de competencia ya no tiene la pestaña ni las alertas de «Nuevos que no tenemos»: quedan Dashboard, Alertas, Productos, Competidores y Bitácora.", modulo: "analisis-competencia", href: "/analisis-competencia" },
  { fecha: "2026-10-14", titulo: "La competencia de cada producto", texto: "La ficha de un producto (Producto) trae el bloque «Competencia en Dropi»: quién más lo vende en Panamá, a qué precio frente al nuestro, su stock y cuánto vendió en 7 y 30 días, con el historial de cada uno. En una compra, cada producto tiene «Ver competencia en Dropi».", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-14", titulo: "Aviso de competidor nuevo", texto: "Cuando un proveedor nuevo empieza a vender en Dropi Panamá sale en «Hoy» (Necesita tu atención), en Avisos y con un contador en Análisis de competencia, hasta marcar su alerta como vista. La ficha de un producto en Análisis de competencia muestra fotos pequeñas que se agrandan con un clic y el historial de cada competidor en una tabla.", modulo: "analisis-competencia", href: "/analisis-competencia/alertas" },
  { fecha: "2026-10-14", titulo: "Análisis de competencia con Dashboard", texto: "Análisis de competencia ahora tiene pestañas (Dashboard, Alertas, Productos, Competidores y Bitácora) y una barra de indicadores como los demás dashboards. El Dashboard muestra el stock vendido por la competencia por día, quién y qué categoría vende más, nuestro precio frente al más bajo y los productos que más venden, con filtros que se cruzan.", modulo: "analisis-competencia", href: "/analisis-competencia" },
  { fecha: "2026-10-14", titulo: "Análisis de competencia", texto: "Nuevo en Investigación: todo el catálogo de Dropi Panamá comparado con lo que vende ECOMFIVE, por nombre y por foto. Alertas cuando un competidor baja el precio o el stock de un producto igual al nuestro, cuánto stock venden ellos por día, semana y mes, y la bitácora de cada cambio.", modulo: "analisis-competencia", href: "/analisis-competencia" },
  { fecha: "2026-10-14", titulo: "Creación de ofertas", texto: "Testing Lab › Creación de ofertas ya funciona: los productos de Selección en «Crear oferta» tienen de 1 a 3 ofertas (nombre, unidades y precio en dólares) con su margen frente al costo del proveedor.", modulo: "creacion-ofertas", href: "/creacion-ofertas" },
  { fecha: "2026-10-14", titulo: "Selección: Crear oferta, ya testeados y prioridad", texto: "Selección de productos ya no tiene «Por evaluar»: lo nuevo entra Seleccionado y pasa a «Crear oferta». Lo que ya se testeó o ya está en Producto entra Descartado solo, con la nota de por qué, y lo que aparece en varios proveedores o fuentes sale marcado «Prioridad».", modulo: "seleccion-productos", href: "/seleccion-productos" },
  { fecha: "2026-10-14", titulo: "Scraping: dólares, cruces y enviar a Selección", texto: "Scraping de proveedores muestra cada precio también en dólares (tipo de cambio del día), marca lo ya testeado o ya en Producto y lo que se repite en otros proveedores (Prioridad), agranda la foto al pasar el cursor, trae el historial en tabla y los privados dentro de la ficha del producto publicado, y envía productos a Selección.", modulo: "scraping-proveedores", href: "/scraping-proveedores" },
  { fecha: "2026-10-14", titulo: "Instagram como fuente", texto: "Testing Lab › Instagram: lo que el equipo comparte por mensaje directo con la cuenta de fuentes cae solo en una lista, con el video guardado, el copy, el enlace y quién lo envió, para decidir si se testea.", modulo: "instagram", href: "/instagram" },
  { fecha: "2026-10-14", titulo: "Scraping de proveedores", texto: "Testing Lab › Scraping de proveedores ya funciona: agrega un proveedor de Dropi y el sistema guarda todos sus productos con foto, precio y stock, y en cada búsqueda anota qué subió o bajó de stock, qué cambió de precio, qué es nuevo y qué desapareció (agotado o privado). Los privados se vinculan por nombre con su producto con foto. Ya está cargado HYPER MODA (779 productos).", modulo: "scraping-proveedores", href: "/scraping-proveedores" },
  { fecha: "2026-10-14", titulo: "Compras sin nombre", texto: "Una compra se identifica por sus códigos (N.º OC y código del país): se quitó el campo «Nombre» que venía de ClickUp, de la ficha, la columna, la búsqueda y la descarga.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-13", titulo: "Selección de productos", texto: "Testing Lab › Selección ya tiene su tablero: los candidatos de las fuentes o creados a mano, con su código de fuente, enlaces, precios de referencia y los estados Por evaluar, Seleccionado y Descartado.", modulo: "seleccion-productos", href: "/seleccion-productos" },
  { fecha: "2026-10-13", titulo: "Íconos en el menú", texto: "Cada página del menú lateral lleva su ícono a la izquierda del nombre, también en Favoritos, para encontrarla de un vistazo.", modulo: "dashboard", href: "/" },
  { fecha: "2026-10-13", titulo: "Testing Lab", texto: "Nueva área del menú, Testing Lab, con el recorrido de un producto en Proveeduría: Fuentes (Drop Killer, Tu Winner y Scraping de proveedores), Selección (Selección de productos), Producción (Creación de ofertas) y Resultados (Test productos y Filtro de productos, que salen de Marketing). Los módulos nuevos están en preparación.", modulo: "productos-test", href: "/productos-test" },
  { fecha: "2026-10-13", titulo: "El test de un 2x1 también en su producto simple", texto: "Un test de un 2x1 (o X2) queda vinculado al compuesto. Ahora su producto simple también lo muestra en la columna «Test», la oferta y el «Resultado del test» de la ficha, con la nota «Test de su compuesto». Ejemplo: la lona impermeable transparente muestra el winner de su 2x1.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-13", titulo: "Compras abre la ficha completa de un clic", texto: "Al pulsar la descripción de una compra se abre directo su ficha completa, con la actividad. Ya no sale primero el resumen a la derecha con «Abrir ficha completa».", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-13", titulo: "Aviso de posible duplicado", texto: "Al crear un producto, si el nombre o la foto se parecen a los de uno que ya existe, la ficha muestra «Posible duplicado» con ese producto (foto, SKU y nombre) y si se parece por el nombre o por la foto.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-13", titulo: "Estado «Descontinuado»", texto: "Un producto que ya no vamos a traer más se marca «Descontinuado» en el selector Estado de su ficha (gris). Vende lo que le queda pero no se puede comprar; tiene su tarjeta para filtrarlos en la lista de Producto.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-13", titulo: "Test productos abre en la lista", texto: "Al entrar a Test productos se abre directo la pestaña «Productos». El Informe y el Dashboard siguen en sus pestañas, al lado.", modulo: "productos-test", href: "/productos-test/productos" },
  { fecha: "2026-10-13", titulo: "«Nuevo producto» junto al campo Producto", texto: "En «+ Agregar» de Test productos ya no hay dos pestañas: el botón «Nuevo producto» está al lado del campo «Producto (de Producto)». Abre la ficha de Producto y, al crearlo, vuelves al formulario con el producto elegido para completar el test.", modulo: "productos-test", href: "/productos-test/productos" },
  { fecha: "2026-10-13", titulo: "Aviso de vencimiento: 90 días", texto: "Un producto con vencimiento avisa ahora 90 días antes de que venza un lote si no le pones otro número (antes eran 60). Se cambia en el bloque Vencimiento de su ficha.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-13", titulo: "Cada quien ve sus países también en Inventario", texto: "Con países limitados, Inventario solo deja cargar movimientos en bodegas de tus países, la actividad de un producto ya no muestra órdenes ni movimientos de otros países y los números de «Por corregir» en Avisos son solo de tus módulos.", modulo: "inventario", href: "/inventario" },
  { fecha: "2026-10-13", titulo: "Países limitados: nunca otro país", texto: "Si a una persona se le limitan los países y ninguno de los suyos está disponible, la barra de arriba dice «Sin país» y las páginas quedan vacías, en vez de abrir Costa Rica.", modulo: "usuarios", href: "/usuarios" },
  { fecha: "2026-10-13", titulo: "«Hoy» muestra solo lo de tus módulos", texto: "Las tarjetas de Ventas Dropi, Operaciones, Conciliación del mes, Dropshippers y Proveedores rastreados salen solo si tu rol abre ese módulo. La primera que veas queda abierta.", modulo: "dashboard", href: "/" },
  { fecha: "2026-10-13", titulo: "Avisos muestra solo lo que te toca", texto: "La actividad del Centro de notificaciones ya no trae cambios de módulos que no abres ni compras de países que no tienes asignados.", modulo: "notificaciones", href: "/notificaciones" },
  { fecha: "2026-10-13", titulo: "«Ver así» se vuelve a activar", texto: "Si estabas probando el sistema con los permisos de otro rol, vuelve a pulsar «Ver así»: la vista previa se reinició con un cambio de seguridad. Solo la usa quien puede modificar Usuarios y roles.", modulo: "usuarios", href: "/usuarios" },
  { fecha: "2026-10-13", titulo: "Actualizar retiros desde Dropi pide confirmar", texto: "El botón de actualizar de Retiros abre la herramienta de este equipo con el botón «Actualizar ahora»: ya no arranca sola al abrirse.", modulo: "retiros", href: "/retiros" },
  { fecha: "2026-10-13", titulo: "Todos los productos a la vista", texto: "La lista de Producto y el buscador de productos de una compra mostraban solo los primeros 1 000 productos y dejaban fuera los más antiguos o los del final del abecedario. Ahora cargan todos.", modulo: "producto", href: "/producto" },
    { fecha: "2026-10-12", titulo: "Dashboard de Test productos", texto: "Nueva pestaña «Dashboard» en Test productos: indicadores, tests por periodo, winners por categoría, distribución del CPA, CTR frente a CPA y winners frente a fallidos, con filtros que se cruzan, igual que el Dashboard de Compras.", modulo: "productos-test", href: "/productos-test/dashboard" },
  { fecha: "2026-10-12", titulo: "Test productos sin el bloque Seguimiento", texto: "La ficha y el formulario de un producto en test ya no traen Revisado, Última revisión, Explotación ni Observación: ese seguimiento se lleva en su tarea de ClickUp.", modulo: "productos-test", href: "/productos-test/productos" },
  { fecha: "2026-10-12", titulo: "Valor de la marca negra en el resultado del test", texto: "En las barras del resultado de un test (en Test productos y en la ficha de Producto), pasa el cursor por la marca negra para ver su valor: el criterio del CPA o el promedio de los winners de esa métrica.", modulo: "productos-test", href: "/productos-test/productos" },
  { fecha: "2026-10-12", titulo: "Colores del estado de un producto", texto: "El estado de cada producto se reconoce por su color: Activo en verde, Test en azul e Inactivo en rojo, en la lista, en el selector de su ficha, al crearlo y en Inventario.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-12", titulo: "Productos inactivos", texto: "Un producto que ya no se vende bien se marca «Inactivo» en su ficha: vende lo que le queda en inventario, pero no se vuelve a comprar hasta pasarlo a Activo. La lista de Producto tiene la tarjeta «Inactivos» para filtrarlos.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-12", titulo: "Filtro de productos vinculado a Producto", texto: "En la ficha de un producto del Filtro eliges su producto de Producto, con el mismo buscador de la orden de compra; el nombre se llena solo.", modulo: "filtro-productos", href: "/filtro-productos" },
  { fecha: "2026-10-12", titulo: "Test productos: nombre nuevo y «Nuevo producto»", texto: "Productos Test ahora se llama Test productos. Su lista trae «Nuevo producto», con la misma ficha de Producto: el producto se crea en Producto y queda en Test productos ya vinculado.", modulo: "productos-test", href: "/productos-test/productos" },
  { fecha: "2026-10-12", titulo: "Resumen en Productos Test", texto: "La lista de Productos Test muestra arriba el total en test, los winners y los que faltan por vincular a Producto, con su número y como filtro de un toque.", modulo: "productos-test", href: "/productos-test/productos" },
  { fecha: "2026-10-12", titulo: "Productos Test vinculados a Producto", texto: "Al agregar un producto en prueba lo eliges de los que ya existen en Producto, con el mismo buscador de la orden de compra; el nombre se llena solo.", modulo: "productos-test", href: "/productos-test/productos" },
  { fecha: "2026-10-12", titulo: "Elige cuántas filas ver por página", texto: "En el pie de las tablas con varias páginas (Compras, Retiros, Pedidos…) está «Filas por página»: 50, 100, 500 o Todas. Se recuerda para ti en todas las tablas. Con Todas ves toda la lista en una sola página, como en un tablero de ClickUp.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-12", titulo: "Eliminar comentarios y quitar sus archivos", texto: "En tus propios comentarios de una compra puedes pulsar Eliminar (con confirmación) o, al Editar, quitar un archivo con su ✕ y adjuntar otro. Un comentario con respuestas de otras personas no se puede eliminar.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-13", titulo: "Oferta del test", texto: "Producto tiene la columna «Oferta»: el precio con que se testeó el producto (solo los que vienen de Test productos); también sale al pasar el cursor por «Test», en la ficha del producto y como columna en Test productos.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-12", titulo: "Foto en la lista de Test productos", texto: "Cada producto en test muestra su foto al inicio de la fila; al pasar el cursor se ve grande.", modulo: "productos-test", href: "/productos-test/productos" },
  { fecha: "2026-10-12", titulo: "Resultado del test en la ficha del producto", texto: "La ficha de un producto que salió de Test productos trae el bloque «Resultado del test»: si cumplió el criterio y sus métricas en barras, como en Test productos.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-12", titulo: "De Test productos a Filtro de productos", texto: "Un producto en test vinculado a un producto Activo de Producto pasa solo a Filtro de productos, en «Cotizar», con su foto y métricas; pasa al guardarlo en Test productos o al poner su producto en Activo.", modulo: "filtro-productos", href: "/filtro-productos" },
  { fecha: "2026-10-12", titulo: "Producto nuevo dentro de «+ Agregar»", texto: "En Test productos, «+ Agregar» abre un panel con dos pestañas: «Nuevo producto» (la ficha completa de Producto, que lo crea y lo deja vinculado) y, al lado, «Producto existente» (lo eliges de Producto).", modulo: "productos-test", href: "/productos-test/productos" },
  { fecha: "2026-10-12", titulo: "Informe de Test productos con los colores del Dashboard", texto: "El Informe de Test productos usa los colores del Dashboard de Compras: winners en degradado morado, en consulta en rosa, fallidos en violeta suave y las barras de categorías en el mismo degradado.", modulo: "productos-test", href: "/productos-test/informe" },
  { fecha: "2026-10-12", titulo: "Resultado del test con los colores del Dashboard", texto: "Las barras de «Resultado del test» (CPA, compras, CTR, hook y CVR) usan el mismo degradado de las barras del Dashboard de Compras; la marca negra sigue siendo el criterio o el promedio de los winners.", modulo: "productos-test", href: "/productos-test/productos" },
  { fecha: "2026-10-12", titulo: "Vinculado o sin vincular en cada fila", texto: "En Test productos, cada producto dice bajo su nombre si está vinculado a Producto (con su SKU) o si falta vincularlo.", modulo: "productos-test", href: "/productos-test/productos" },
  { fecha: "2026-10-12", titulo: "Columna «Test» en Producto", texto: "La lista de Producto dice si cada producto tuvo un test y cómo le fue; al pasar el cursor muestra los datos de ese test (gasto, compras, CPA, CTR, hook y CVR).", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-12", titulo: "Envío al crear un producto", texto: "La ficha «Nuevo producto» trae el bloque Envío (producto físico, embalaje, tamaño empacado, peso, país de origen y código SA).", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-12", titulo: "Producto aprobado pasa solo a Compras", texto: "Al pasar un producto de Test a Activo, se crea su orden de compra en «01 - Cotizar» en el país de la barra de arriba. Además, el producto nuevo arranca en Test y se le puede poner la foto al crearlo.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-12", titulo: "Enter comenta después de adjuntar", texto: "Al adjuntar un archivo a un comentario, el cursor pasa al botón Comentar (o Responder) en cuanto termina de subir: pulsar Enter lo envía, en vez de volver a abrir el selector de archivos.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-12", titulo: "Marcar todo un grupo con su casilla", texto: "Cuando la tabla está agrupada (por ejemplo por Etapa), cada grupo tiene su casilla: márcala para seleccionar de una vez todas las compras de ese grupo. Con algunas marcadas se ve a medias, y si el grupo estaba cerrado se abre al marcarlo.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-10", titulo: "Menos etapas en Compras", texto: "Se quitaron Solicitud Internacional, Evaluación de Proveedor, Solicitud a Proveedor, Compra y Pago y Aviso Logística. Las etapas son ahora Backlog, 01 Cotizar, 02 Cotizado, 03 En Producción, 04 Tracking, 05 Arribo Mercancía, 06 Completado y Descartado; las compras que estaban en una etapa quitada pasaron a la más parecida.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-09", titulo: "Todos los productos con código de barras", texto: "Los 191 productos que no tenían código de barras ya tienen el interno; desde su ficha se imprime la etiqueta o se cambia por el del fabricante.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-09", titulo: "Productos de las órdenes en Cotizar", texto: "Se crearon 76 productos (con foto, código de barras y vencimiento donde aplica) y se vincularon a sus 81 órdenes en Cotizar con su cantidad total.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-09", titulo: "Editar tus comentarios", texto: "En la actividad de una compra puedes editar los comentarios que escribiste; quedan marcados «(editado)».", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-09", titulo: "Una sola tienda por orden", texto: "La Tienda de una orden de compra es una sola: al elegir otra se cambia, en la columna, en la ficha y en la barra de varias compras.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-09", titulo: "Filtros con colores", texto: "Al filtrar Compras por Etapa o Estado, cada opción sale con el mismo color que en la columna.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-09", titulo: "Columna «Orden de compra»", texto: "La columna principal de Compras se llama «Orden de compra» y lleva las etiquetas; ya no hay una columna aparte de Etiquetas.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-09", titulo: "Anular en vez de eliminar compras", texto: "El botón de la ficha ahora es «Anular»: la compra conserva su código y su historial, pasa a la etapa Descartado con la insignia «Anulada» y se puede restaurar.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-09", titulo: "Vista rápida de productos", texto: "En Producto, pasa el cursor sobre el nombre: un compuesto muestra el mapa de sus componentes y uno simple su foto grande y sus compras. La ficha de un compuesto también muestra su mapa.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-09", titulo: "Producto nuevo más visual", texto: "Estado y Tipo se marcan con botones, el SKU se sugiere mientras escribes el nombre, el código de barras interno viene marcado y un compuesto muestra el mapa de sus componentes.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-09", titulo: "Componentes con buscador", texto: "Al crear un producto compuesto, cada componente se busca como en una orden de compra: con foto, SKU, nombre y N.º.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-08", titulo: "Compras abre en la lista", texto: "Al entrar a Compras se abre directo la pestaña «Compras»; el Informe sigue en su pestaña.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Responder, reaccionar y adjuntar Excel", texto: "En la actividad de una compra puedes responder un comentario (le avisa a quien lo escribió), darle «Me gusta» o un emoji, y adjuntar Excel, Word, PowerPoint, CSV o texto además de imágenes y PDF.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Actividad de la compra como ClickUp", texto: "Comentarios, cambios y archivos en un solo bloque, en orden de tiempo, con filtro Todo / Comentarios / Cambios, imágenes en miniatura y el campo para comentar abajo.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Código de barras interno por defecto", texto: "Al crear un producto, el código de barras interno se genera solo y se ve de una vez con su etiqueta; si trae el del fabricante, eliges «Del fabricante» y lo escribes.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-08", titulo: "La lupa busca en abiertas y cerradas", texto: "La búsqueda de las tablas encuentra abiertas y cerradas a la vez (en Compras no salían las compras abiertas)." },
  { fecha: "2026-10-08", titulo: "Una sola vía de envío y «Tipo de venta»", texto: "La vía de envío de una compra es una sola (marítimo, aéreo o terrestre). «Tipo de venta» elige entre Proveeduría y Venta de importación.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "«Mostrar todas» las columnas", texto: "El menú Columnas de cualquier tabla trae «Mostrar todas» y «Ocultar todas», y su lista se desplaza por dentro sin mover la página." },
  { fecha: "2026-10-08", titulo: "Venta de importación en vez de Importadora", texto: "Importadora ya no está entre los países: una venta de importación es una compra con el «Tipo de venta» en «Venta de importación» y se filtra por esa columna. Las 12 de antes quedaron en México.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Envíos rediseñado", texto: "Compras › Envíos ahora es un tablero: indicadores, prometido vs. real por vía, ranking de agentes y una tarjeta por país donde agregas rutas y las activas o desactivas.", modulo: "compras", href: "/compras/envios" },
  { fecha: "2026-10-08", titulo: "Envíos: barras de prometido vs. real", texto: "En Compras › Envíos, un resumen de todos los países con una barra por vía, el tiempo de cada país por vía y la columna «Últimos 2 meses».", modulo: "compras", href: "/compras/envios" },
  { fecha: "2026-10-08", titulo: "Compras › Envíos", texto: "Nueva pestaña con cada agente de envío por país y vía: lo que promete, lo que de verdad tarda (histórico, 12 meses y año actual), tarifas por CBM o kg y si el canal está activo.", modulo: "compras", href: "/compras/envios" },
  { fecha: "2026-10-08", titulo: "Agente de envío en las compras", texto: "Cada compra lleva su agente de envío (Chin, Avery…), aparte del proveedor; con él se mide cuánto tarda cada agente.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Tiendas con color y nombre editable", texto: "Las tiendas de Compras se ven con su color, como las etiquetas; con el lápiz se cambia su color o su nombre en todas las compras.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Agregar un país desde la compra", texto: "En «Elige el país» de la orden nueva, «Agregar país» busca el país por su nombre y lo agrega al sistema ahí mismo.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Compra nueva en Solicitud Internacional", texto: "Una orden de compra nueva arranca en la etapa «01 - Solicitud Internacional» en vez de Backlog.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "«Cantidad total» en vez de «QTY Total»", texto: "En Compras, la columna y el campo QTY Total ahora se llaman Cantidad total.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Planificación automática", texto: "La Planificación de cada compra se calcula sola con la fecha de envío y lo que tardan los envíos de su país por mar, aire o tierra.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Sin «Documentos» ni «Producto relacionado»", texto: "Se quitaron esos dos campos de Compras. Los archivos que tenía «Documentos» ahora están en un comentario de cada compra.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Comentarios al crear una compra", texto: "La orden de compra nueva ya trae Comentarios, con @menciones y archivos, igual que la ficha; se guardan al crearla.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Arrastrar la foto real de una compra", texto: "Al crear una orden de compra, arrastra la foto del proveedor desde el escritorio o desde internet (o pégala con Ctrl+V).", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Nueva orden de compra", texto: "El país se elige con su bandera, el N.º OC y el código se ven antes de crearla, el nombre es opcional y la foto es la «Foto real del producto».", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Etiquetas en la ficha como en la columna", texto: "Al crear o editar una compra, «Añadir etiqueta» muestra todas las etiquetas con su color, busca y crea una nueva si no existe.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Buscar productos con foto", texto: "Al agregar un producto a una compra, mientras escribes salen las sugerencias con su foto en miniatura, SKU, nombre y N.º.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "Productos al crear una compra", texto: "La compra nueva ya trae el bloque «Productos» en el mismo lugar que la ficha: se crea con sus productos, unidades y costo.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-08", titulo: "SKU sugerido", texto: "Al crear un producto, el sistema sugiere el SKU con las palabras del nombre separadas por barra; puedes cambiarlo.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-08", titulo: "Arrastrar la foto del producto", texto: "Con la ficha del producto abierta, arrastra una imagen del escritorio o de internet (o pégala con Ctrl+V) y queda como su foto.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-08", titulo: "N.º de producto y SKU sin repetir", texto: "Cada producto tiene su N.º correlativo, que ordena la lista. El SKU no se repite: el sistema avisa si ya existe, y se corrige desde la ficha por uno libre.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-08", titulo: "Editar el nombre del producto", texto: "En la ficha del producto, el nombre ahora se edita ahí mismo y queda en su actividad.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-08", titulo: "Compras en secuencia por código", texto: "Dentro de cada etapa las compras quedan ordenadas por su código, de mayor a menor, aunque lleguen salteadas.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-07", titulo: "Centro de ayuda", texto: "Glosario, guías de cada módulo, la Universidad con cursos y examen, y los manuales de proceso del equipo.", href: "/ayuda" },
  { fecha: "2026-10-07", titulo: "Países permitidos por persona", texto: "Cada persona puede limitarse a sus países: solo ve las compras e histórico de esos países.", modulo: "usuarios", href: "/usuarios" },
  { fecha: "2026-10-07", titulo: "Histórico de compras de cada producto", texto: "En la ficha del producto: unidades compradas desde la primera vez, total invertido, costo promedio y cada compra.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-07", titulo: "Fotos de producto", texto: "Cada producto tiene su foto (en Producto e Inventario). Se sube o se cambia desde su ficha.", modulo: "producto", href: "/producto" },
  { fecha: "2026-10-07", titulo: "Subtotales por grupo", texto: "Al agrupar una tabla, cada grupo cierra con su subtotal. En Compras: lo que se debe por etapa.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-07", titulo: "Varias tiendas por compra", texto: "La Tienda de una compra ahora puede ser una o varias, y se eligen o crean al escribirlas, como las etiquetas.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-07", titulo: "Comentarios con imágenes y PDF", texto: "Pega una captura o adjunta un PDF en un comentario de una compra; se ve como miniatura debajo del texto.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-07", titulo: "Cambiar varias compras a la vez", texto: "Marca varias compras con su casilla y cambia un dato a todas desde la barra de abajo.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-07", titulo: "Encabezado fijo y fila de totales", texto: "En Compras, los títulos de las columnas se quedan arriba al bajar y los totales quedan pegados abajo.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-06", titulo: "Editar las celdas como en ClickUp", texto: "Todas las celdas de Compras se editan con el mismo panel: opciones con color, buscador y fechas con atajos.", modulo: "compras", href: "/compras/lista" },
  { fecha: "2026-10-06", titulo: "Etiquetas con color", texto: "Las etiquetas de las compras se crean, se ponen y se colorean desde el ícono junto al nombre.", modulo: "compras", href: "/compras/lista" },
];

/** Las novedades que le sirven a una persona (las generales y las de sus módulos). */
export const novedadesPara = (modulos: string[]) => NOVEDADES.filter((n) => !n.modulo || modulos.includes(n.modulo));
