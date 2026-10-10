// Los primeros manuales de proceso (borradores para revisar y completar desde el sistema). Los carga una vez
// `scripts/cargar-manuales-borrador.ts`; después se editan en Ayuda › Manuales y el código ya no los toca.

export const MANUALES_BORRADOR: { titulo: string; modulos: string[]; contenido: string }[] = [
  {
    titulo: "Crear y seguir una orden de compra",
    modulos: ["compras"],
    contenido: `## Antes de crearla
- Confirma el producto en Producto: que exista, que esté Activo y, si tiene variantes, cuáles se compran.
- Ten la cotización del proveedor: unidades, costo total, incoterm y vía de envío.

## Crear la compra
1. Compras › «Agregar». Elige el país (si es para un cliente, marca el Tipo de venta «Venta de importación»).
2. Escribe el nombre. El código ECOM se asigna solo.
3. Abre la ficha y, en «Productos», agrega cada producto o variante con sus unidades y el costo total de la cotización.
4. Etapa: 01 Cotizar mientras se negocia; 04 Tracking al pagar.

## Seguimiento
1. Registra los pagos (Primer y Segundo Pago, Pagado a Proveedor) y sus fechas.
2. Al salir la mercancía: Fecha de Envío y etapa 04 Tracking.
3. Al llegar: Fecha de llegada y etapa 05 Arribo Mercancía.
4. Cuando todo esté cerrado (pagado y recibido), Estado Completado: la compra pasa a Cerrados.

## Si algo falla
- Comenta empezando con «Inconveniente:» y describe el problema (aduana, retraso, faltante).
- Menciona con @ a quien deba actuar.`,
  },
  {
    titulo: "Recibir mercancía en bodega",
    modulos: ["inventario", "compras"],
    contenido: `## Al llegar la mercancía
1. Busca la orden de compra por su código ECOM y verifica productos y unidades contra lo que llegó.
2. Cuenta las unidades por producto (y por variante). Separa lo dañado.
3. En Inventario, abre cada producto y registra una Entrada en la bodega propia donde se guarda. Si maneja vencimiento, anota lote y fecha.
4. Lo dañado va a una ubicación con propiedad «dañado».

## Cerrar la compra
1. En la compra: Fecha de llegada y etapa 05 Arribo Mercancía.
2. Si faltó o sobró algo, comenta «Inconveniente:» con el detalle.

## Pendiente en el sistema
- La recepción directa desde la compra (que el recibido entre solo al inventario) todavía no está construida: por ahora la entrada se registra a mano en Inventario.`,
  },
  {
    titulo: "Vincular productos a compras históricas",
    modulos: ["compras", "producto"],
    contenido: `## Para qué
Vincular cada compra con su producto alimenta el histórico de compras: unidades compradas desde la primera vez, costo promedio y total invertido.

## Cómo
1. En Compras, usa el filtro rápido «Sin productos».
2. Abre una compra y, en «Productos», busca el producto (por variante si tiene).
3. Unidades: la Cantidad total de la compra. Costo: el monto total que dice la descripción de la compra.
4. Si no estás seguro de qué producto es, compara la foto y el nombre; ante la duda, déjala sin vincular y coméntala.

## Notas
- 232 compras se vincularon automáticamente (nombre y foto iguales, con el monto de la descripción).
- Las dudosas quedaron para revisión manual.`,
  },
  {
    titulo: "Conciliar un retiro de Dropi",
    modulos: ["retiros"],
    contenido: `## Crear el retiro
1. Conciliación de Retiros › «Agregar»: cuenta destino, monto y comisión.
2. En Dropi, al pedir el retiro, escribe el correlativo (#0007) en el concepto.

## Cuando llega el dinero
1. Abre el retiro y pulsa «Conciliar».
2. Anota lo recibido y la referencia del banco. El soporte (captura) es opcional.
3. El retiro queda Cerrado y Consolidado.

## Si algo no cuadra
1. Pulsa «Novedad» y describe el problema.
2. Al resolverlo, «Ver novedad» › «Resolver».`,
  },
  {
    titulo: "Atender un pedido de Dropi en Novedad",
    modulos: ["pedidos-dropi"],
    contenido: `## Revisar
1. En Hoy, «Pedidos de Dropi en Novedad» › Revisar; o en Pedidos Dropi, la tarjeta Novedad.
2. Abre el pedido y lee el motivo que reporta Dropi.

## Resolver
1. Contacta al dropshipper o al cliente según el caso (dirección, ausencia, rechazo).
2. Registra la gestión en el CRM, en la ficha del dropshipper.
3. Responde la novedad en Dropi.

## Por completar
- Tiempos de respuesta esperados y a quién escalar cada tipo de novedad.`,
  },
  {
    titulo: "Dar de alta a una persona nueva",
    modulos: ["usuarios"],
    contenido: `## Crear la cuenta
1. Usuarios y roles › «Agregar»: nombre, correo y rol.
2. Copia la contraseña temporal y compártela por fuera del sistema (chat o correo).
3. En su ficha, «Países»: si es de un solo país, marca «Solo estos» y su país.

## Primer día
1. Pídele que entre y cambie su contraseña.
2. Que haga en Ayuda › Universidad el curso «Primeros pasos en el sistema» y los de sus módulos.
3. Revisa en Universidad › Progreso que los haya completado.`,
  },
];
