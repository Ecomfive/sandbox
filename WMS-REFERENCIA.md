# WMS de Ecomfive: arquitectura y referencia (GreaterWMS)

Documento de trabajo para construir el Sistema WMS por fases. Reúne (1) la arquitectura V2 acordada
(«Producto como base», PDF `arquitectura-wms.pdf`, 24 sept 2026), (2) el análisis del repositorio
[GreaterWMS](https://github.com/GreaterWMS/GreaterWMS) (Django + Quasar, Apache 2.0, ~4 400 estrellas) y (3) cómo
llevarlo a nuestro stack (Next.js + Supabase). **No se reutiliza su código** (otro stack); se toma su modelo de datos y
sus flujos, que son lo valioso. Estado: **diseño, nada de esto está construido todavía** salvo lo marcado como «ya existe».

## 1. Arquitectura V2 (lo que queremos)

- **Producto es la base.** Sin catálogo de producto no existen Inventario, Compras ni Análisis de Competencia.
- **Bodegas** (6 fuentes físicas): Despacho, Fulfillment, Dropi, Effi, Boxfull, Dunamixfy → dan de alta stock en **Inventario**
  (el HUB: stock consolidado, todas las bodegas y todos los productos).
- **Compras** *consulta* (C) el producto y recibe resultados de Testings y de Análisis de Competencia.
  **Gestión Tiendas** (Venta Ecommerce), **Gestión Proveeduría** (Venta B2B) y **Competencia** *asocian* (A) el producto.
- **Cada venta descuenta inventario** (flecha de retorno de Tiendas y Proveeduría hacia Inventario).
- **Cuatro sincronizaciones:** Shopify (externa: catálogo y stock), WMS Fulfilment (interna), Sync Bodega Despacho
  (interna, pedidos despachados) y Sync Pedidos Dropi (externa, pedidos de la bodega Dropi).

## 2. Qué es GreaterWMS y cómo se organiza

Backend Django REST Framework + frontend Quasar/Vue, base relacional, ~32 apps. Salió de 15 años de WMS real (Ford Asia
Pacific). Carpetas del repo (cada una es un módulo con `models.py`, `views.py`, `serializers.py`, `filter.py`, `urls.py`):

| Grupo | Apps de GreaterWMS | Equivalente en Ecomfive |
|---|---|---|
| Catálogo de producto | `goods` + `goodsclass`, `goodsbrand`, `goodscolor`, `goodsshape`, `goodsspecs`, `goodsorigin`, `goodsunit` | Producto (hoy: fichas Shopify y Dropi, catálogo maestro de SKU) |
| Inventario | `stock` (`StockList` + `StockBin`) | Inventario (hoy solo cantidad simple) |
| Ubicaciones físicas | `warehouse`, `binset`, `binsize`, `binproperty` | No existe (nuestras bodegas son solo una lista) |
| Entradas | `asn` (aviso de llegada = recepción) | Compras (sin recepción física) |
| Salidas | `dn` (nota de entrega) + `PickingList` | No existe |
| Auditoría de stock | `cyclecount` (conteo cíclico y manual), `QTYRecorder` (libro de movimientos) | No existe |
| Terceros | `supplier`, `customer`, `company`, `driver` | Gestión Proveeduría / Gestión Tiendas |
| Operación | `scanner` (PDA / código de barras), `capital`, `payment`, `dashboard` | Ideas a futuro |
| Plataforma | `staff`, `userlogin`, `userprofile`, `userregister`, `throttle`, `uploadfile`, `utils` | Ya lo tenemos (Supabase Auth y roles) |

## 3. El modelo de inventario (lo más valioso)

`StockList` no tiene una sola cantidad: lleva **cubetas** por producto.

| Cubeta | Significado |
|---|---|
| `goods_qty` | Total del producto en el sistema |
| `onhand_stock` | Físico real en la bodega |
| `can_order_stock` | Disponible para prometer/vender |
| `ordered_stock` | Ya vendido/reservado por un pedido |
| `inspect_stock` | En inspección |
| `hold_stock` | Bloqueado |
| `damage_stock` | Dañado |
| `asn_stock` | En camino, aún no llega |
| `dn_stock` | Reservado en una salida sin confirmar |
| `pre_load_stock`, `pre_sort_stock`, `sorted_stock` | Etapas de la recepción |
| `pick_stock`, `picked_stock` | Etapas del picking |
| `back_order_stock` | Pedido pendiente por faltante |

`StockBin` reparte lo mismo **por ubicación** (bin): el mismo producto vive en varios bins, cada uno con `goods_qty`,
`pick_qty` y `picked_qty`, más el tamaño (`bin_size`) y la propiedad (`bin_property`: Normal, Damage, Inspection, Holding)
del bin. La propiedad del bin decide a qué cubeta suma lo que se guarda ahí.

## 4. Los flujos, con las cubetas que mueven (leído del código de `asn/views.py`, `dn/views.py`, `cyclecount/views.py`)

### Recepción (ASN) — estados 1 a 5
1. **Crear la orden (1):** cabecera (`AsnList`) + líneas (`AsnDetail`) con cantidad esperada. Calcula peso, volumen y costo
   totales con los datos del producto y **suma a `asn_stock` y `goods_qty`** (mercancía en camino).
2. **Pre-load (2)** y **Pre-sort (3):** avanzan el estado de la orden y de todas sus líneas (etapas de descarga y clasificación).
3. **Sorted (3→4 o 5):** por cada línea se captura `goods_actual_qty` (lo recibido) y se compara con lo esperado:
   `goods_shortage_qty` (faltó), `goods_more_qty` (sobró) o exacto. Ajusta `goods_qty`, resta de `pre_sort_stock` y suma a
   `sorted_stock`; el costo total se corrige por el faltante o el sobrante. Con 0 recibido la línea cierra como faltante total.
4. **Mover a bin (4→5):** por cada cantidad guardada en un bin: `sorted_stock` baja, **`onhand_stock` sube** y, según la
   propiedad del bin, sube `damage_stock`, `inspect_stock`, `hold_stock` o **`can_order_stock`** (bin Normal). Crea la fila de
   `StockBin` y una fila del **libro de movimientos** (`QTYRecorder`: bin, producto, cantidad, código de la orden, quién).

### Salida (DN) — estados 1 a 6
1. **Pre-order (1):** cabecera + líneas del pedido de salida; la cantidad queda en `dn_stock`.
2. **Nueva orden (2):** confirma el pedido: **`can_order_stock` baja, `ordered_stock` sube, `dn_stock` baja** (reserva).
3. **Order release (3):** asigna físico. Calcula lo pickeable (`onhand − inspect − hold − damage − pick_stock`), recorre los bins
   Normal con stock, arma el **`PickingList`** (bin → producto → cantidad) y mueve **`ordered_stock` → `pick_stock`**. Si no
   alcanza, lo faltante va a **`back_order_stock`** y se crea una línea de back order.
4. **Picked (4):** el operario confirma lo pickeado: **`onhand_stock` baja, `pick_stock` baja, `picked_stock` sube**; si se
   pickeó menos, lo no pickeado regresa a `can_order_stock`. Se marca cada renglón de picking.
5. **Dispatch (5):** sale de la bodega: `picked_stock` baja y la línea pasa a `intransit_qty`. Limpia los bins que quedaron en cero.
6. **POD (6):** prueba de entrega: por línea compara lo entregado con lo enviado (`delivery_actual_qty`, `delivery_shortage_qty`,
   `delivery_more_qty`, `delivery_damage_qty`).

### Conteo cíclico
`cyclecount`: captura por bin y producto el `goods_qty` del sistema, el `physical_inventory` contado y la `difference`.
Hay conteo diario (`CyclecountModeDay`), general y manual (`ManualCyclecountMode`), con estado 0 (pendiente) y 1 (contado),
y exportación. Todo lo que cambia stock deja un código de transacción (`t_code`) que enlaza bin, movimiento y orden.

### Escáner
`scanner`: guarda el código leído (`mode` + `code`) y resuelve a qué picking o recepción corresponde; es lo que usa el PDA.
Nuestro «pistoleo» (migración 0003) es el equivalente.

## 5. Lo que no debemos copiar (problemas de su diseño)

- Todo va por **texto** (`goods_code`, `bin_name`, `supplier`), sin llaves foráneas ni restricciones: nosotros usamos `uuid` con FK.
- **Sin transacciones ni bloqueos:** leen la fila de stock, suman en Python y guardan. Dos operarios a la vez pierden cantidades.
  En Postgres cada transición debe ser **una función SQL atómica** (`UPDATE … SET x = x + n` con `SELECT … FOR UPDATE`).
- Estados como **números sueltos** (1..6): nosotros usamos texto con `check`.
- **Borran** la fila de stock al llegar a 0 y limpian bins vacíos: perdemos historia. Preferimos conservar y usar el libro.
- `openid` como multi-inquilino y una sola bodega por instalación: nosotros necesitamos **stock por producto × bodega** (país incluido).
- Costo/peso/volumen recalculados a mano en cada vista: aquí van como columnas calculadas o vistas.

## 6. Cómo llevarlo a Ecomfive (diseño para Supabase)

Tablas propuestas (nombres tentativos, prefijo `wms_`; ya existe `wms_bodegas`, `wms_productos`, `wms_compras`):

| Tabla | Para qué | Viene de |
|---|---|---|
| `wms_bodegas` (ya existe) + ampliar con tipo (propia / Dropi / externa) y si sincroniza | Las 6 bodegas por país | `warehouse` |
| `wms_ubicaciones` (bin) | Ubicación dentro de una bodega, con tamaño y propiedad (normal, dañado, inspección, retenido) | `binset`, `binsize`, `binproperty` |
| `wms_stock` (producto × bodega) | Las cubetas de stock; una fila por par | `StockList` |
| `wms_stock_ubicacion` (producto × ubicación) | Cantidad por bin | `StockBin` |
| `wms_movimientos` | **Libro inmutable**: cada cambio de cantidad con tipo, origen (orden), cantidad, quién y cuándo | `QTYRecorder` |
| `wms_recepciones` + `wms_recepcion_lineas` | Recepción de una compra: esperado / recibido / faltante / sobrante / dañado | `AsnList`/`AsnDetail` |
| `wms_salidas` + `wms_salida_lineas` + `wms_picking` | Salida de mercancía por venta o despacho, con reserva, picking y entrega | `DnList`/`DnDetail`/`PickingList` |
| `wms_conteos` | Conteo cíclico: sistema vs. contado y diferencia | `cyclecount` |

Reglas de diseño:
- **Una función SQL por transición** (`wms_reservar`, `wms_liberar_picking`, `wms_confirmar_picking`, `wms_despachar`,
  `wms_recibir`, `wms_guardar_en_ubicacion`, `wms_ajustar_por_conteo`) que actualiza cubetas y escribe el movimiento en una sola
  transacción. Las acciones del servidor solo las llaman (`supabase.rpc`) y auditan con `registrarAuditoria`.
- **Reserva al crear el pedido, descuento al despachar** (patrón DN): crear baja disponible y sube reservado; despachar saca del físico.
- El libro es la verdad: las cubetas se pueden **reconstruir** sumando movimientos, y el conteo cíclico compara contra eso.
- Compras: hoy `wms_compras` es un seguimiento de etapas y pagos con `producto_relacionado` como texto libre y `qty_total`/`monto_total`
  globales, **sin líneas por producto ni recepción**. Hay que agregarle líneas (producto, cantidad esperada, costo) y enlazarla a
  `wms_recepciones`. Coordinar con quien la construyó.
- Producto central: el SKU maestro como identidad, la ficha tipo Shopify como ficha completa y la ficha Dropi como asociación
  (pendiente de confirmar).
- Sincronizaciones: las de Dropi y Shopify **no escriben cubetas a mano**: registran movimientos con su origen (`sync_dropi`, `sync_shopify`)
  para que se puedan auditar y revertir.

## 7. Fases

1. **Producto central y bodegas:** producto maestro + las 6 bodegas por país + asociaciones (tienda, proveeduría, competencia, testing).
2. **Inventario multi-estado:** `wms_stock` con cubetas por producto y bodega + `wms_movimientos`.
3. **Bodegas → ubicaciones (bins):** `wms_ubicaciones` y `wms_stock_ubicacion`.
4. **Recepción con reconciliación (simple):** líneas en Compras y `wms_recepciones` (esperado vs. recibido vs. dañado, y guardar en ubicación).
5. **Salida y despacho:** `wms_salidas` con reserva, picking, despacho y entrega; enganchar las ventas de Tiendas y Proveeduría.
6. **Conteos cíclicos** y **sincronizaciones** (Dropi primero, Shopify al final: necesita acceso a su API).

Testings (validación de productos) y la vista del producto (todo lo que cuelga de él) se agregan al final.

## 8. Decisiones confirmadas (24 sept 2026)

1. **El stock de la bodega Dropi lo tiene Dropi.** Dropi es la fuente de verdad de esa bodega: el sync lo **lee** de Dropi y lo
   registra como movimientos con origen `sync_dropi`; no se calcula a partir de sus pedidos ni se edita a mano aquí. «Sync Pedidos
   Dropi» sigue siendo aparte y sirve para las ventas, no para el stock.
2. **Reserva al crear el pedido y descuento al despachar** (patrón DN).
3. **El SKU maestro es el producto central** (su código es la identidad; la ficha tipo Shopify es la ficha completa; la ficha Dropi y
   las de tienda son asociaciones).
4. **Todas las bodegas llevan ubicaciones (bins)**, también las externas (Dropi, Effi, Boxfull, Dunamixfy), no solo cantidad total.
5. **La recepción es simple:** esperado / recibido / dañado (con faltante y sobrante calculados). No se replican las etapas
   pre-load, pre-sort ni sorted de GreaterWMS; solo «esperada → recibida» y guardar en ubicación.

Consecuencias: en las bodegas cuyo stock manda un tercero (Dropi) las ubicaciones y cantidades vienen del sync y son de solo lectura
aquí; en las propias (Despacho, Fulfillment) el WMS es quien mueve las cubetas.

## 9. Dónde mirar en GreaterWMS cuando se construya cada fase

- Cubetas y bins: `stock/models.py`, `stock/views.py` (`StockListViewSet`, `StockBinViewSet`).
- Recepción: `asn/views.py` (`AsnDetailViewSet.create`, `AsnSortedViewSet`, `MoveToBinViewSet`).
- Salida: `dn/views.py` (`DnNewOrderViewSet`, `DnOrderReleaseViewSet`, `DnPickedViewSet`, `DnDispatchViewSet`, `DnPODViewSet`).
- Conteos: `cyclecount/models.py`, `cyclecount/views.py`. Libro de movimientos: `cyclecount.QTYRecorder`.
- Escáner: `scanner/views.py`. Catálogos de producto: `goods*` (siete tablas de atributos).
