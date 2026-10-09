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
  { termino: "Etapa", definicion: "En qué paso va una compra: Backlog, 01 Solicitud Internacional, 02 Cotizar… hasta 11 Completado (o Descartado). De ella salen los tiempos.", modulos: ["compras"] },
  { termino: "Estado", definicion: "El semáforo de gestión de una compra (Pendiente, En Gestión, En Revisión, Completado…). Es distinto de la etapa: la compra se archiva cuando el Estado es Completado.", modulos: ["compras"] },
  { termino: "Venta de importación", definicion: "Una compra para un cliente que nos pide mercancía de cualquier parte (antes «Importadora»). Es una compra de un país con el «Tipo de venta» en «Venta de importación» (la otra opción es «Proveeduría»); se ven filtrando o agrupando por esa columna.", modulos: ["compras"] },
  { termino: "Vincular productos", definicion: "Agregar a una compra los productos del sistema que se compraron, con unidades y costo. Así se suma el histórico de cada producto.", modulos: ["compras", "producto"] },
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
      { titulo: "Ver las compras", pasos: ["Arriba eliges qué ver: Todos los países o un país. Las ventas de importación se ven filtrando por la columna «Tipo de venta» (Proveeduría o Venta de importación).", "La lista arranca agrupada por etapa; puedes agrupar, filtrar, mover y ocultar columnas, y guardar tu vista.", "Dentro de cada grupo, las compras van en secuencia por su código (ECOM01-0444, 0431, 0430…), de mayor a menor.", "Los filtros de un toque (Cotizando, Producción, En tránsito, Atrasadas, Sin productos) aíslan lo que buscas."] },
      { titulo: "Crear una compra", pasos: ["Pulsa «Agregar» (Nueva orden de compra) y elige el país con su bandera (si no está, «Agregar país» al final de la lista: escribe su nombre y elígelo; queda agregado al sistema). La etapa arranca en «01 - Solicitud Internacional». Antes de crearla ya ves su N.º OC y su código ECOM. El nombre es opcional.", "En «Foto real del producto» sube la foto que manda el proveedor: al crear la compra puedes arrastrarla desde el escritorio o desde internet y soltarla en cualquier parte del panel, o pegarla con Ctrl+V.", "Etiquetas: «Añadir etiqueta» abre la lista de todas las que existen (con su color); pulsa para poner o quitar, o escribe una nueva y pulsa Enter para crearla.", "En el bloque «Productos» (debajo de Etiquetas, igual que en la ficha) empieza a escribir el SKU, el nombre o el N.º: salen las sugerencias con su foto; elige con el ratón o con flechas y Enter. Escribe unidades y costo y pulsa «Agregar a la orden».", "Al final del panel puedes dejar comentarios desde ya (con @ y archivos), igual que en la ficha: «Agregar comentario» los deja listos.", "La factura o el soporte de la compra van como archivo en un comentario (ya no hay campo «Documentos»).", "Pulsa «Crear compra»: se guarda con sus productos y comentarios, y la Cantidad total y el monto salen de los productos."] },
      { titulo: "Planificación automática", pasos: ["La Planificación (el mes en que llega la compra) se calcula sola: no se escribe.", "Al poner o cambiar la Fecha de Envío, la vía o el país, el sistema le suma lo que tardaron los envíos anteriores de ese país por esa vía (la mediana; por ejemplo, Panamá por mar ~59 días, Costa Rica por mar ~85) y pone el mes de llegada.", "En la ficha, debajo de la Fecha de Envío, ves la llegada estimada y de dónde salen los días. Con varias vías se planifica con la más lenta.", "Sin fecha de envío no hay planificación; las compras antiguas de ClickUp sin fecha de envío conservan la que tenían."] },
      { titulo: "Tiendas con color", pasos: ["Cada tienda se ve con su color, en la columna y en la ficha, como las etiquetas.", "Al elegir la tienda, el lápiz junto a cada una despliega sus colores y su nombre.", "Cambiar el nombre lo cambia en todas las compras que tienen esa tienda (de todos los países); si escribes el nombre de otra tienda que ya existe, se juntan."] },
      { titulo: "Envíos: agentes, tiempos y tarifas", pasos: ["En la pestaña «Envíos» (después de Tiempos y fallas) arriba están los indicadores (países, rutas activas, agentes, tiempo real de marítimo y aéreo contra lo prometido, y cuántas rutas tardan más), la barra «prometido vs. real» de todos los países y el ranking de agentes (pulsa uno para ver solo sus rutas).", "Debajo, una tarjeta por país con lo que tarda cada vía y una fila por ruta: el agente, la vía, lo real contra lo prometido con su barra, la tarifa y el interruptor para activarla o desactivarla. «+ Ruta» en la tarjeta agrega otro agente o vía a ese país; «Agregar ruta» arriba sirve para un país nuevo.", "Filtra por vía, agente o país, o pasa a la vista «Tabla» para ver todas las columnas.", "Un punto rojo en «Últimos 12 meses» dice que el agente tarda más de lo que promete.", "Arriba, «Todos los países» junta todo en una barra por vía: la franja verde es lo prometido y los puntos lo real (promedio histórico, últimos 12 meses y últimos 2 meses); un punto con borde rojo pasa de lo prometido.", "En la fila de cada país ves en pequeño cuánto tarda cada vía juntando a todos sus agentes, y al final del grupo su total con las mismas columnas; abajo, el total de todos los países.", "«Agregar» crea una ruta para cualquier país del mundo, aunque todavía no tenga compras.", "En la ficha de una ruta la activas o desactivas, cambias lo que promete y agregas tarifas por tipo de producto (por CBM o por kg) con la fecha desde la que rigen; la anterior queda en el historial.", "Lo real sale de las compras con su «Agente de envío», país, vía y fechas de envío y llegada: pon el agente en cada compra."] },
      { titulo: "Editar sin abrir la ficha", pasos: ["Pulsa cualquier celda (etapa, fechas, montos…): se abre un panel pequeño debajo.", "Las opciones se guardan al elegirlas; lo escrito, con Enter o al pulsar fuera. Escape cancela.", "Para cambiar varias a la vez, márcalas con la casilla y usa la barra de abajo."] },
      { titulo: "Productos de la compra", pasos: ["En la ficha completa, bloque «Productos»: busca el producto (o su variante) y escribe unidades y costo unitario o total; el otro se calcula solo.", "La Cantidad total y el Monto Total de la compra salen de sus productos.", "Mientras una compra no tenga productos verás la marca «Sin productos»."] },
      { titulo: "Comentarios y actividad", pasos: ["Al final de la ficha, el bloque «Actividad» junta todo como en ClickUp: los comentarios (con sus imágenes en miniatura; púlsalas para verlas grandes), cada cambio con su autor y hora, y los archivos.", "Arriba del bloque eliges ver Todo, solo Comentarios o solo Cambios; lo más nuevo queda abajo, junto al campo para comentar, y lo viejo se abre con «Ver anteriores».", "Comenta con @ para avisar a alguien; puedes pegar una captura, arrastrar o adjuntar imágenes, PDF, Excel, Word, PowerPoint, CSV o texto (hasta 25 MB cada uno).", "Debajo de cada comentario: 👍 «Me gusta», 😊 para reaccionar con otro emoji (pulsa el tuyo otra vez para quitarlo) y «Responder», que deja tu respuesta debajo y le avisa a quien lo escribió.", "Empieza un comentario con «Inconveniente:» para marcar una falla (se ve en rojo)."] },
      { titulo: "Informe, Dashboard y Tiempos", pasos: ["Informe: lo creado, pagado y llegado por período.", "Dashboard: toda la operación con filtros que se cruzan.", "Tiempos y fallas: cuánto tarda cada tramo y qué está fallando."] },
    ],
  },
  {
    modulo: "producto",
    titulo: "Producto",
    ruta: "/producto",
    resumen: "El catálogo único de productos (el mismo para todos los países): SKU, foto, variantes, código de barras, envío y compras.",
    secciones: [
      { titulo: "Crear un producto", pasos: ["Pulsa «Agregar»: marca el Estado (Activo o Test) y el Tipo (Simple o Compuesto) y escribe el nombre; mientras lo escribes, el SKU se sugiere solo. El N.º lo pone el sistema.", "Si es compuesto, en «Componentes» busca cada producto igual que en una orden de compra (escribe el SKU, el nombre o el N.º y elige de la lista con su foto) y pon su cantidad. Debajo se dibuja el mapa de cómo se arma: cada componente unido al producto nuevo.", "Código de barras: viene marcado «Interno» y ya ves su número y su etiqueta (que puedes imprimir) antes de crear el producto. Si el producto trae el del fabricante, elige «Del fabricante» y escríbelo (un compuesto arranca en «Sin código de barras»).", "Al salir del nombre, el sistema te sugiere un SKU con sus palabras separadas por barra (Ej: BALSAMO/PURPURA/MELAXIN); bórralo y escribe otro si prefieres. Las variantes agregan sus valores (…/ROJO/M).", "El SKU no puede repetirse: si ya lo tiene otro producto, el sistema te dice cuál. Para corregirlo después, «Cambiar» junto al SKU en la ficha, y cámbialo también en Dropi y Shopify.", "Marca «Tiene variantes» si se vende en colores o tallas y define sus opciones.", "Arranca en Test; pásalo a Activo cuando se vaya a comprar."] },
      { titulo: "La ficha del producto", pasos: ["En la lista, pasa el cursor sobre el nombre de un producto: si es compuesto ves el mapa de cómo se arma; si es simple, su foto grande, en cuántas órdenes se compró, cuántas unidades y la última orden.", "La sección «Componentes» de un compuesto muestra el mismo mapa: cada componente con su cantidad unido al producto.", "Nombre: escríbelo en el campo «Nombre» del bloque Producto; se guarda al salir del campo o con Enter.", "Foto: con la ficha abierta, arrastra una imagen desde el escritorio o desde cualquier página de internet y suéltala, o pégala con Ctrl+V. También puedes usar «Subir foto» o «Cambiar».", "Código de barras: el del fabricante o «Generar código interno».", "Envío, vencimiento por lote y variantes se configuran en sus bloques."] },
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
    titulo: "Productos Test",
    ruta: "/productos-test",
    resumen: "Los productos que se prueban en marketing y cuáles resultaron winners.",
    secciones: [{ titulo: "Uso", pasos: ["Informe: tests por día, semana o mes y los winners (CPA menor a $4).", "Productos: la lista con su ficha; «Copiar informe» para compartir."] }],
  },
  {
    modulo: "filtro-productos",
    titulo: "Filtro de productos",
    ruta: "/filtro-productos",
    resumen: "Ideas de productos evaluadas antes de pasarlas a test.",
    secciones: [{ titulo: "Uso", pasos: ["«Agregar» crea la ficha con su foto y datos.", "Filtra y agrupa para decidir qué pasa a test."] }],
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
  { fecha: "2026-10-08", titulo: "Venta de importación en vez de Importadora", texto: "Importadora ya no está entre los países: una venta de importación es una compra con su casilla marcada (al crearla o en su ficha) y se filtra por esa columna. Las 12 de antes quedaron en México.", modulo: "compras", href: "/compras/lista" },
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
