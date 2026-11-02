# Drop: cómo funciona (referencia)

Drop es **otra aplicación de dropshipping, aparte de Dropi, y solo de Costa Rica** (regla de Hernán, 3 nov 2026: todo lo que se agregue de Drop es de Costa Rica; los montos van en colones).
Este documento recoge cómo funciona Drop según **Nicole**, la persona que gestiona los IDs de Drop (explicado a Hernán y Jhokser el 3 nov 2026), para que el sistema se adapte a Drop y
quien agregue después otros módulos de Drop lo tenga a mano. El código de lo que ya existe está en `src/lib/publicaciones-drop/` y `src/app/(app)/publicaciones-drop/`; las reglas de país
y plataforma, en `src/lib/plataformas.ts`. La guía para quien sincroniza o conecta datos de Drop está al final.

## Entrar

| | Dropi | Drop |
|---|---|---|
| Inicio de sesión | Pide un **código de autenticación** (verificación en dos pasos) | **No** pide código |
| Pantalla de inicio | Hay que ir al módulo de productos | Se abre solo en **«Mis productos»** |

## Crear un producto

| | Dropi | Drop |
|---|---|---|
| Botón | «Agregar» (azul) | «Crear producto» (negro) |
| Al pulsarlo | Una ventana emergente pregunta si se quiere crear un producto | Entra directo al panel para crearlo |
| Nombre | Título; opción de poner **otro nombre para la guía de envío** | Solo el título; **no** hay otro nombre para la guía |
| Descripción | Larga (mínimo 200 caracteres) | Corta: se pone **el mismo nombre del producto**. **Mínimo 10 caracteres** (confirmado por Nicole, 3 nov 2026) |
| Público o privado | Se elige al crear | **No se elige**: se privatiza después, desde el mismo ID |
| Peso y medidas | Piden peso, largo, ancho y alto | **No** piden peso ni medidas |
| Precio de venta | Obligatorio | Obligatorio |
| Precio sugerido | Obligatorio si es público (opcional si es privado) | **Opcional y no se pone**: Drop calcula uno aproximado solo y **solo lo ve el dropshipper**, no nosotros |
| Imágenes | De **3 o más** | De **1 a 5** |
| Enlace de creativos | No | Se puede poner un enlace (Drive) a los creativos |
| Aviso de poco stock | No | Opción de recibir un **aviso por correo** si un producto o variante está casi sin stock |
| SKU | El mismo nombre del producto (salvo en los combos) | **Siempre el mismo nombre del producto** |
| Simple o variable | Hay que elegir | **No** se elige |
| Categoría | Se elige | Se elige una de las **12 de Drop**: Tecnología, Decoración para el hogar, Productos ecológicos, Cuidado personal, Ropa y accesorios, Artículos de oficina, Accesorios de viaje, Hogar y cocina, Deportes y Gimnasio, Suministros para mascotas, Juguetes y juegos, Salud y bienestar (`CATEGORIAS_DROP`) |
| Recursos adicionales (videos…) | Existe el módulo; **no se usa** | No existe |
| Garantías | Módulo obligatorio: hay que aceptarlas y escribir en observaciones que se está de acuerdo con las de por defecto | **No existe** |
| Guardar | «Guardar» | «Guardar producto» |

Al guardar, Drop abre una vista del producto con: **estado, proveedor, inventario, precio de venta, precio sugerido** (calculado solo, lo ve el dropshipper), **bodega, fecha de creación, SKU y el código de venta público** (algo como su ID).
Ese código de venta público es el **ID de la publicación en Drop**.

## Stock

- **Dropi (Costa Rica):** hay que hacer un ingreso de 100 unidades para poder crear el producto y luego editar el stock y quitarlas, para que quede en cero, porque el stock de Dropi lo agrega la bodega de Dropi, no nosotros.
- **Drop:** el producto **se crea con stock cero** solo. El stock entra con una **solicitud de ingreso de inventario**: desde el producto, «Gestionar inventario» (o desde el módulo de gestión de inventario) se pide el ingreso de 100, 200… unidades. La bodega recibe la mercancía, la cuenta
  y la compara, y **aprueba o declina** la solicitud (ingresando lo que de verdad llegó). Hasta ahora siempre se ha mandado la cantidad correcta, así que solo la aceptan y las unidades aparecen solas.
  **No se sube ni se quita stock a mano**: solo se hacen solicitudes. Por eso en Drop no hay botón de editar stock.

## Privatizar

- **Dropi:** se crea otro producto privado aparte (con su propio ID), con el correo del dropshipper y las unidades reservadas.
- **Drop:** se hace **desde el mismo ID y con el mismo SKU** (confirmado por Nicole, 3 nov 2026): el producto queda privado para un dropshipper específico y se **aparta una cantidad de unidades solo para él**; se pone su **correo**, las **unidades** y el **precio de venta** (el mismo o uno distinto para ese cliente). No hay un producto privado aparte.
- **Alerta de poco stock (Drop):** cuando falta stock Drop crea una **alerta que llega al correo** (la opción «avisar por correo» de «Crear producto»). Además, **al quedarse sin stock un producto, Drop solo lo desactiva** (confirmado por Nicole, 3 nov 2026): no hay que pausarlo ni inactivarlo a mano. Por eso Drop **no pausa** por falta de stock, y en el sistema «Sin stock» cuenta las publicaciones con 0 unidades **estén activas o no** (`sinStockDrop`); volver a activar es tras un ingreso de inventario.

## Inactivar, activar, eliminar

- «Apagar» de Dropi se llama **inactivar** en Drop; una publicación inactiva se vuelve a **activar**.
- Drop **no archiva**: solo se **elimina**.
- Drop **no republica**.
- «Poner en liquidación» no se hace actualmente en Drop: el botón queda **pendiente** para ver si se usa.

## El SKU de Drop

- El SKU de Drop **es el nombre del producto** y **no se puede cambiar**.
- Al sincronizar las publicaciones se guarda tal cual como **«SKU de Drop»** y luego se **vincula con el SKU de nuestro producto** (el de Producto): se sugiere por el parecido entre las palabras del SKU de Drop y las del SKU y el nombre de nuestro producto, y por las **imágenes**
  (la misma huella de foto y las reglas de `src/lib/publicaciones/vincular.ts`), y una persona lo confirma.

### Vincular con nuestro producto al crear (regla de Hernán, 3 nov 2026)

- El SKU de Drop es el nombre y no se cambia, así que **al crear un producto en Drop se vincula con uno nuestro** y se procura que el SKU de Drop sea **el mismo que el SKU de nuestro producto** (o, si se prefiere, su nombre).
- En «Crear producto» (`CrearProductoDropPanel`): se elige el producto nuestro, o el sistema lo vincula solo cuando lo escrito es igual al nombre o al SKU de uno (`sugerirProductos`); si solo se parece, ofrece «Vincular». Sin vincular se puede después.
- Un producto que **ya está creado en Drop** conserva su SKU: quedan los dos SKU («SKU de Drop» y «SKU nuestro») y el vínculo los conecta.

## Qué hace el sistema hoy y qué falta

- **Lee** las publicaciones de Drop (`app.soydrop.com`, cuenta «Proveedor Ecomfive Costa Rica»; menú del proveedor: Dashboard, Mis productos, Solicitudes de inventario) con `scripts/drop-guardar.ts` y las guarda en `drop_publicaciones` (migración 0221); deja una sugerencia de producto a vincular
  (por nombre y por foto) y una persona la confirma con «Vincular». Detalle en el CLAUDE.md, «Datos de Drop».
- Módulo «Gestión de IDs Drop» (`/publicaciones-drop`): pestañas Publicaciones, Recomendaciones, Tareas y Reglas; tablero de tarjetas; la fila con **Inactivar/Activar, Gestionar inventario, Dar acceso privado, Liquidación (pendiente) y Eliminar**; el formulario **«Crear producto»** con los datos de Drop y
  sus validaciones (`faltantesCrearDrop`); Análisis de competencia con la plataforma Drop (vacío). **Todavía no escriben en Drop**: los botones y el formulario validan y avisan «hazlo en Drop».
- Falta: **escribir** en Drop (crear productos, pedir ingresos de inventario, dar accesos privados, inactivar/activar, eliminar), leer las **solicitudes de inventario** y su estado (aprobada o declinada), conectar la competencia de Drop y crear las tablas de lo que falte (`drop_*`, con RLS sin políticas). Drop **no pide
  código de autenticación**, lo que debería hacer más simple conectarlo.
- Preguntas abiertas: si Drop tiene tareas como Dropi (el botón «Tareas» sigue apagado).
