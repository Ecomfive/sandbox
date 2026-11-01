-- Arreglo de la 0215 (31 oct 2026): al copiar la migración al portapapeles, los acentos de las 19 tareas iniciales quedaron dañados
-- («M√©xico» en vez de «México»), y el autor quedó vacío porque el perfil de Alcides usa otro correo. Vuelve a escribir el título y la
-- descripción de las que siguen dañadas (no toca las que ya se corrigieron a mano) y les pone como autor a Alcides Andrade.
-- Se puede correr de nuevo sin efecto. Reversa: no hace falta (solo corrige textos).

update tareas_equipo t set titulo = v.titulo, descripcion = v.descripcion, actualizado_en = now()
from (values
  (1, 'México: bodega B3903 «Dropi Monterrey» y cómo republicar', 'La B3903 también es de Dropi (como la B49). Falta sumarla a las bodegas de Dropi y definir cómo se republica en México, que no es igual que en Panamá.'),
  (2, 'México: poner el fulfillment de Dropi en Configuración', 'En Configuración, con México elegido arriba, escribir cuánto cobra Dropi México por pedido (en pesos). Hoy está vacío y las 64 publicaciones de México no lo restan.'),
  (3, 'Costa Rica: 6 publicaciones sin costo de mercancía', 'PUB-0536 (lentes TR90), PUB-0541 (Purifying Gel), PUB-0482 (combo Aichun), PUB-0459 (aceite de orégano 300), PUB-0512 (spray Dr. Melaxin) y PUB-0464 (aceite Lefun): su producto no tiene compra con costo. Además PUB-0630 tiene ₡2.83 (parece un valor en dólares).'),
  (4, 'Costa Rica: 11 publicaciones con precio ₡1 000 o ₡1', 'Salen con margen negativo. Siete están activas: PUB-0533, 0532, 0530, 0490, 0627, 0628 y 0629. Revisar si el precio está mal leído de Dropi o son de prueba.'),
  (5, 'Retiros: tolerancia de conciliación por moneda', 'La diferencia que se acepta al conciliar es la misma cifra en dólares y en colones: en Costa Rica es mucho más estricta. Definir una por país.'),
  (6, 'Retiros: retirar al cambio según la moneda', 'Costa Rica paga y cobra en colones y se retira al cambio de la moneda que se elija. Hoy el retiro no guarda en qué moneda se recibe ni el tipo de cambio.'),
  (7, 'Tipo de cambio oficial para los cierres', 'El tipo de cambio sale de un servicio gratuito de internet. Para cierres contables conviene el oficial (Banco Central de Costa Rica, Banxico).'),
  (8, 'Compras en México: «$» se confunde con pesos', 'Compras siempre está en dólares y se escribe con «$». En México, el peso también usa «$». Decidir si Compras muestra «US$».'),
  (9, 'WhatsApp: plantilla «mensaje_interno» para Meta', 'Agregarla desde CRM › Plantillas y pulsar «Mandar a Meta» para que el WhatsApp interno pueda escribir pasadas 24 horas.'),
  (10, 'CRM: «Pasar a Comercial» crea un seguimiento que ya no se ve', 'Los seguimientos se quitaron de las fichas. Decidir si se quita el botón o qué debe crear.'),
  (11, 'WhatsApp: guardar fotos y audios antes de que Meta los borre', 'Meta guarda los archivos de los mensajes unos 30 días. Falta copiarlos al sistema.'),
  (12, 'WhatsApp: «No, gracias» en el primer contacto', 'Cuando un contacto nuevo responde «No, gracias», marcar el chat como resuelto y no volver a escribirle primero.'),
  (13, 'WhatsApp: avisar al cliente cuando llega la mercancía', 'Hoy «Avisarme cuando llegue» avisa solo al equipo. Falta mandar al cliente la plantilla de llegada con el producto y la fecha.'),
  (14, 'Dropi: probar privatizar y crear producto con Dropi real', 'Privatizar en Dropi y publicar un producto nuevo están probados contra un Dropi simulado. Falta una prueba real de cada uno.'),
  (15, 'Inventario: conectar el descuento automático por venta', 'wms_aplicar_venta ya reserva, libera y despacha por SKU, pero no está conectada a Dropi ni a Shopify.'),
  (16, 'Unir «Apagar en Dropi» con «Archivar»', 'Propuesta pendiente de decidir: un solo botón para sacar el stock y archivar.'),
  (17, 'Promociones para 89 productos de bajo rendimiento', 'Hay un Excel en datos-privados con los 89 productos de peor rendimiento para decidir promociones.'),
  (18, 'Rendimiento: límite a los rangos de fechas personalizados', 'Último punto de RENDIMIENTO-PENDIENTE.md: un rango muy largo hace lenta la página.'),
  (19, 'WhatsApp: cifrar los números de teléfono (etapa 2)', 'Hoy los números se ocultan en pantalla pero en la base están en texto normal.')
) as v(numero, titulo, descripcion)
where t.numero = v.numero and (t.titulo ~ '[√¬‚]' or coalesce(t.descripcion, '') ~ '[√¬‚]');

update tareas_equipo t set creado_por = p.id, creado_por_nombre = p.nombre
from perfiles p
where t.creado_por is null and t.numero <= 19 and p.nombre = 'Alcides Andrade';
