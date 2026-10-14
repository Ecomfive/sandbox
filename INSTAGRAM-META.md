# Instagram como fuente: cómo se montó la app de Meta

Guía para repetir la conexión (otra app, otra cuenta, otro negocio). Lo que se describe se hizo y se probó el **14 oct 2026**; el
código está en `src/lib/instagram/` y `src/app/api/instagram/webhook/`, y la pestaña en `/instagram` (ver `CLAUDE.md`, «Testing Lab ›
Instagram»). Los nombres de los menús de Meta cambian seguido: si algo no se llama igual, buscar por el sentido.

## Lo que hizo falta (y lo que no)

**Hizo falta**
1. Una cuenta de Instagram **profesional** (Empresa) ligada al Business Manager, que es la que **recibe** los mensajes (`scuby.du007`).
2. Una app de Meta (tipo Empresa) con el caso de uso **«Administrar mensajes y contenido en Instagram»**, que trae los permisos
   `instagram_business_basic`, `instagram_business_manage_comments` e `instagram_business_manage_messages`.
3. La cuenta que recibe, conectada en **API de Instagram › Configuración de la API con el inicio de sesión de Instagram**, paso 2
   (tiene que haber aceptado antes el rol de «Evaluador de Instagram» de la app), con el interruptor **«Suscripción a webhook» en Sí**.
4. El webhook registrado en el paso 3: URL `https://<dominio>/api/instagram/webhook` y el token de verificación; suscrito al campo **`messages`**.
5. **Publicar la app (modo Activo).** Es lo que de verdad destrabó los mensajes: en modo Desarrollo se verificaba el webhook pero
   **no llegaba ningún mensaje real**; al publicar, empezaron a llegar. La documentación de Meta lo dice: la app debe estar en Live
   para que Meta envíe notificaciones.

**No hizo falta**
- Que las personas que comparten **acepten el rol de Evaluador de Instagram** para que **llegue** el mensaje (alguien con la
  invitación pendiente envió una publicación y llegó igual). **Ojo:** puede cambiar **qué manda Meta** (ver «Quién comparte cambia lo
  que llega»).
- Que el paso 2 de la pantalla de la API quede con la marca verde (el icono siguió «a medias» y funcionó).
- Verificar el negocio ni enviar la app a revisión (App Review): con los permisos en acceso estándar («Listo para probar») alcanza.
- Generar el identificador (token) de acceso para recibir: solo sirve para **consultar** el usuario de quien envía y los datos de la
  publicación. Con él puesto, el sistema muestra `@usuario` en vez de un número.

**No se pudo confirmar**: si hace falta la opción de Instagram «Permitir acceso a los mensajes» (Configuración › Mensajes › Herramientas
conectadas) y si los mensajes que caen en «Solicitudes» llegan igual. Se probó con cuentas que ya se seguían o ya tenían conversación.

## Paso a paso

1. **App.** `developers.facebook.com` › Crear app › caso de uso «Administrar mensajes y contenido en Instagram» (en el filtro
   «Mensajes empresariales») › tipo Empresa › elegir el portafolio comercial.
2. **Datos de la app para poder publicarla** (Configuración de la app › Básica): nombre para mostrar, correo de contacto,
   **URL de la política de privacidad** (bastó la de una tienda: cualquier página pública que abra), **icono 1024×1024**,
   **categoría** y las instrucciones de eliminación de datos (la misma URL). El resto se deja vacío. Guardar cambios.
3. **Rol de la cuenta que recibe.** Roles › Añadir personas › «Evaluador de Instagram» › su usuario; aceptar la invitación desde
   esa cuenta (Instagram › Configuración › Aplicaciones y sitios web › Invitaciones de testers).
4. **Conectar la cuenta.** Casos de uso › API de Instagram › Configuración de la API con el inicio de sesión de Instagram:
   «Add all required permissions» (paso 1) y «Añadir cuenta» (paso 2) iniciando sesión con la cuenta que recibe (no con otra: Meta usa
   la sesión de Instagram abierta en el navegador; si sale otra, «Cambiar de cuenta» o ventana de incógnito). Opcional: «Generar
   identificador» y guardar el token.
5. **Variables en Vercel** (Production, tipo Secreto, nunca `NEXT_PUBLIC_`) y **Redeploy sin caché**:
   - `INSTAGRAM_APP_SECRET`: la **«Clave secreta de la aplicación de Instagram»** de la pantalla del paso 4 (no la de Configuración ›
     Básica). Con ella llegaron firmados los avisos y se aceptaron. Si algún día los avisos dan 401, probar con la otra.
   - `INSTAGRAM_VERIFY_TOKEN`: una frase larga inventada; la misma se escribe en Meta.
   - `INSTAGRAM_ACCESS_TOKEN` (opcional): el identificador generado; **vence a los ~60 días**: regenerarlo y actualizarlo.
6. **Webhook** (paso 3 de la misma pantalla): URL de devolución de llamada + token de verificación › Verificar y guardar. En los
   registros de Vercel debe verse un `GET /api/instagram/webhook` con 200 de `facebookplatform/1.0`. Suscribir **`messages`** y
   poner el interruptor de la cuenta en **Sí**.
7. **Publicar la app** (menú «Publicar»). No pide revisión si los permisos siguen en acceso estándar.
8. **Probar.** Compartir un reel por mensaje directo a la cuenta que recibe; en 10 a 30 segundos cae en `/instagram`. Si no llega:
   registros de Vercel con el filtro `/api/instagram/webhook` (si no hay ningún `POST`, el problema está en Meta; si hay `POST` con 401,
   es el secreto; con 200 y sin fila, mirar `instagram_capturas`).

## Cómo compartir para que llegue el enlace (regla para el equipo, probada el 14 oct)

**Abrir primero la publicación (o el anuncio) y compartir con su avión de papel; nunca reenviar el mensaje desde la conversación.**

- **Reenviar desde la conversación** (compartir el mensaje que ya llegó en un chat): llega como `ig_post` con **solo el archivo** (video o imagen) y
  **sin enlace**. Probado por Hernán con un anuncio: IG-0019 (`Cata-Kor NAD+`), imagen de 0,1 MB, sin enlace. Es lo que explica las capturas «solo
  archivo» que habían llegado (IG-0002, IG-0007, IG-0011, IG-0013: eran anuncios reenviados desde chats).
- **Abrir la publicación y pulsar su avión de papel**: llega como `ig_reel` **con enlace**. Probado con un anuncio: IG-0020 (`Ducha de Mano 3 en 1`,
  cuenta `pty_nuvo`), enlace `/p/DeSh9KxMqNy/`.
- Por la **web de Instagram** todas las rutas probadas llegaron con enlace (cuadrícula del perfil, `/reel/…`, `/p/…`, feed y pestaña de Reels:
  IG-0001 fusionada, IG-0016, IG-0017 e IG-0018), también para contenido orgánico. La app del celular puede tener más rutas; la regla anterior se
  confirmó en el celular con los dos anuncios.
- Lo anterior **sustituye** a la hipótesis de «quién comparte» y a la de «anuncio frente a orgánico»: lo que decide es **desde dónde se comparte**
  (el mensaje de una conversación o la publicación abierta). El mismo anuncio puede llegar de las dos formas.

## Por qué el mismo contenido llega de formas distintas (hipótesis anterior descartada)

El 14 oct se pensó que el tipo del aviso dependía de **quién compartía** (cuenta con el rol aceptado → `ig_reel` con enlace; cuentas
pendientes → `ig_post` con archivo). **Era falso**: IG-0011 y IG-0012 son **el mismo contenido** (mismo identificador de Meta,
`18102301511361563`), compartido dos veces por la **misma persona** con dos minutos de diferencia: una llegó como `ig_post` (archivo de
23 MB, sin enlace) y la otra como `ig_reel` (enlace `/p/DdmZSerggFG/`, sin archivo). Lo que cambia es, aparentemente, **desde dónde se
comparte** (no se ha confirmado cuál es cada camino). Y una publicación de **imagen** (foto o carrusel) llega como `ig_post` con un
archivo que no es video (IG-0006, IG-0013): se guarda como imagen.

Consecuencias en el sistema:
- La tabla muestra el **formato** de lo que llegó («Con enlace», «Con video», «Con imagen», «Enlace y video», «Enlace e imagen» o «Sin
  enlace ni archivo»), no «Reel» o «Publicación».
- El **identificador de Meta es el mismo** para el mismo contenido (y también el código del enlace): por eso **cada contenido tiene una sola
  captura**. Si lo mismo se comparte varias veces, o una vez como archivo y otra como enlace, la nueva llegada se **fusiona en la primera**
  (`fusion.ts`, `fusionarEnPrimera` en `guardar.ts`): la primera se completa con lo que traiga la otra (enlace, archivo, cuenta, nombre de la
  página, cifras, fecha, textos y notas; nada de lo que ya tenía se pisa), y cada envío queda registrado en `metricas.envios` (quién y
  cuándo; la ficha dice «Compartida N veces»). Los reintentos de Meta no duplican: un mensaje ya fusionado se reconoce por esos envíos.
  El botón «Fusionar N repetidas» de la lista hace lo mismo con las que ya estaban repetidas antes. Si la captura principal sigue «nuevo» y
  la absorbida ya tenía una decisión (por testear, descartado), se conserva esa decisión.
- **Un enlace pegado después de compartir un archivo** («Copiar enlace» y mandarlo como mensaje) no crea otra captura: se une a la última
  captura de esa persona (20 minutos) que no tenga enlace y se lee su página para completarla (`pegarEnlaceALaUltima`). Es la forma segura de
  tener el enlace cuando lo compartido llega solo como archivo.
- **Reintento desde lo guardado:** la ficha trae «Reintentar el archivo» (o «Completar desde el enlace»): vuelve a descargar el archivo del
  aviso de Meta que se guardó en `payload` y, si hay enlace, lee su página. Sirve, por ejemplo, para las imágenes que llegaron antes de
  saberlas guardar (IG-0006, IG-0013); si Meta ya venció la dirección del archivo, avisa el motivo.
- **Las cifras y el nombre de la página solo se pueden leer cuando hay enlace** (salen de su vista previa pública): una captura que llega
  solo como archivo no los tiene, salvo que la misma publicación llegue después con enlace.
- La lista se **refresca sola cada 30 segundos** mientras la pestaña se ve (`router.refresh()`).

## Con el enlace se completa todo: la página de «insertar» (embed)

Lo que el aviso de Meta no trae (el **archivo de video**, las **vistas**) sale del enlace de la captura: la página pública de insertar
`instagram.com/p/<código>/embed/captioned/` (se pide con el agente de las vistas previas de Facebook, como la vista previa) trae un
bloque `contextJSON` con la dirección del video en la red de archivos de Instagram, `video_view_count`, me gusta, comentarios, la cuenta,
la duración y `product_type` (`clips` = reel). Probado el 14 oct con el reel de `nuvotienda.ve`: video MP4 válido de 2,2 MB, 43 me gusta,
5 comentarios y 974 vistas. `embed.ts` lo lee (solo acepta archivos de `cdninstagram.com` y `fbcdn.net`) y `lectura.ts` junta lo leído
con la vista previa (que manda en me gusta y comentarios: la vista previa dio 12 comentarios y la de insertar 5, que parece no contar
respuestas; la de insertar aporta vistas y, si la otra falla, el resto). **Resultado: una captura que llega con enlace termina con el
archivo, las vistas, los me gusta, los comentarios, la cuenta, el nombre de la página y la fecha**, sin importar cómo se compartió. La
ficha trae «Completar desde el enlace» / «Volver a leer el enlace» (`completarCaptura`) para las que llegaron antes o cuando Instagram
no respondió; lo corregido a mano no se pisa. Es la misma zona gris que la vista previa (acceso automatizado) y se apaga con
`INSTAGRAM_LECTURA_PUBLICA=0`. **Límite probado:** Instagram puede tener la página de insertar **desactivada** para una publicación (IG-0005/0009, el anuncio de
Perfectx de `mundodigital4955`, e IG-0012, de `vohanh459`: la respuesta es una página genérica que dice «disabled», sin `shortcode_media`).
Parecen ser anuncios o cuentas con restricciones; en esos casos la vista previa sí da me gusta, comentarios, cuenta, nombre y fecha, pero
**no hay archivo ni vistas** por esta vía (queda `metricas.embed_error`). En las publicaciones orgánicas probadas (`nuvotienda.ve`) funcionó
siempre. **Lo único que sigue sin resolverse es lo contrario**: una captura que llega solo como archivo no
trae enlace, y de un archivo no se puede sacar su enlace (el identificador `ig_post_media_id` no es el código del enlace).

## El enlace de la bio de una cuenta (landing de tiendas orgánicas): no se puede leer sin sesión

Con la sesión iniciada, el perfil de `nuvotienda.ve` muestra su enlace de la bio (`www.nuvovenezuela.com`). **Sin sesión no hay ninguna vía**: ni el
embed del perfil (`/<cuenta>/embed/`, que solo trae nombre, seguidores y 6 publicaciones, sin `external_url` ni biografía), ni la página normal con
agente de navegador, de Facebook o de Googlebot (se probaron las tres). `web_profile_info` responde 429. Para tiendas orgánicas sirve como página de
destino sugerida, pero habría que leerla a mano con una sesión (como en esta prueba) y no se puede automatizar desde el servidor. Para anuncios, el
destino correcto es el del botón del anuncio (Biblioteca de anuncios), no el de la bio.

## Cuando llega solo el archivo: cómo buscar su enlace (probado el 14 oct)

De un archivo no se puede **calcular** el enlace: el `asset_id` de su dirección es el mismo `ig_post_media_id` (identificador de Graph,
`18102301511361563`), y el código del enlace (`DdmZSerggFG`) corresponde a otro número (`3991989340766077254`); no hay fórmula entre los dos.
Lo que sí se probó o se dejó en marcha:
- **Google** (`site:instagram.com "frase del copy"`): **no sirve y se quitó el botón.** Con la herramienta de búsqueda, 0 de 3 casos devolvieron
  una página de Instagram (reel orgánico `nuvotienda.ve`, su reel de guantes y el de `nuvo.tienda`); con un Google real en Chrome devolvió el perfil y
  publicaciones parecidas de la cuenta, pero no se vio la publicación exacta, y para un anuncio (Perfectx) nada. Instagram casi no se indexa y las
  direcciones de los resultados vienen ocultas. No ayuda a conseguir el enlace.
- **Reconocer la publicación dentro de la cuenta** (idea de comparar el video con las publicaciones de la cuenta; probado, no implementado): la página
  de insertar del **perfil** (`instagram.com/<cuenta>/embed/`, mismo agente de vista previa) trae un bloque con `graphql_media`: **solo las 6 últimas
  publicaciones**, cada una con código (el enlace), tipo (`GraphVideo`/`GraphImage`/`GraphSidecar`), medidas, descripción, me gusta y portada
  (`web_profile_info` responde 429). En `nuvo.tienda` (13 publicaciones) y `nuvotienda.ve` (37) la publicación conocida sí estaba entre las 6, y para
  distinguir publicaciones con la misma descripción servirían el tipo y las medidas (se leen del `tkhd` del MP4; también la duración, del `mvhd`).
  **Pero** hace falta saber la cuenta (de un archivo no se sabe) y, en las cuentas de **anuncios** de las capturas que llegaron solo como archivo
  (`vohanh459`, `mundodigital4955`) esa página de insertar está **desactivada** («disabled»): no habría lista. Con las 4 capturas de archivo reales no
  habría servido de nada, por eso no se construyó.
- **Pedirle a Meta el mensaje** (API de conversaciones, `GET /{mid}?fields=id,created_time,from,to,message,attachments,shares`): **no sirve, se
  quitó.** Probado el 14 oct con IG-0007: Meta contesta bien pero solo con `id`, `from` (quién lo envió), `to` (a quién), `created_time` y
  `message` vacío; **ni `attachments` ni `shares`**, aunque se pidieron. Lo compartido no se puede leer por aquí.
- **Pegar el enlace a mano**: la ficha tiene el campo «Enlace de Instagram»; al guardar uno nuevo se lee su página enseguida (archivo, vistas,
  cifras, cuenta, nombre).
- **El mismo contenido por otra ruta**: si alguien lo comparte de forma que llega con enlace, se fusiona y el archivo hereda el enlace (por el id
  de Meta). **Un enlace pegado como mensaje** después de compartir se une a la última captura de esa persona sin enlace.
- Para un **anuncio**, el «enlace» útil es el de la Biblioteca (`facebook.com/ads/library/?id=<identificador>`), que se encuentra con el botón de la
  Biblioteca; un anuncio «dark post» no tiene enlace de Instagram.

## Cómo conseguir la página de destino de un anuncio: la Biblioteca de anuncios

La Biblioteca de anuncios de Meta (`facebook.com/ads/library`, pública, sin iniciar sesión) muestra de cada anuncio su anunciante, su
texto, el identificador y **la dirección del botón de compra**. Buscando el copy de la captura **como frase exacta** sale el anuncio:
con el copy de IG-0005 («Apoya tu bienestar corporal con Perfectx…») aparecieron 4 anuncios de «Mundo Digital» con el destino
`clicksitienda.com/products/producto-2lp-pa001-crema-perfetcx`. La ficha trae el botón **«Buscar el anuncio en la Biblioteca de
anuncios»** (`src/lib/instagram/biblioteca.ts`), que abre esa búsqueda ya armada (países: todos; estados: todos). Con el **nombre de la página** (que sale del título de la vista previa:
«Nuvo Venezuela on Instagram: …») busca sus palabras junto con las del copy: se probó «Mundo Digital» + el copy de Perfectx y dio los mismos
4 anuncios que la frase exacta, y solo el nombre da 50.000; la combinación es igual de precisa y evita mezclar tiendas cuando el copy se
copia entre varias (algo habitual). Sin nombre se busca la frase exacta; la persona copia el
destino al campo «Página de destino». **No se automatiza**: la Biblioteca se arma con JavaScript (haría falta un navegador) y Meta
prohíbe leerla de forma automática (su API oficial solo cubre anuncios políticos fuera de la UE).

## Los dos enlaces de cada captura: qué se puede asegurar y qué no

- **Enlace de Instagram del anuncio o la publicación:** un reel siempre lo trae. Una publicación (`ig_post`) no: solo trae el archivo
  de video y su id, y de ese id no se puede armar el enlace.
- **Enlace de la página de destino:** Meta **no lo entrega** en el mensaje directo, el perfil público de la cuenta no muestra su
  «link en la bio» a una consulta anónima y, en las muestras, el copy tampoco trae ninguna dirección de tienda. Lo que sí se aprovecha,
  en este orden: (1) el enlace que la persona **escribe al compartir**: Instagram lo manda como un **mensaje de texto aparte**, después
  del reel (visto el 14 oct: el texto no venía dentro del aviso del reel), y el sistema lo une a la **última captura de esa misma
  persona de los últimos 20 minutos** (`extraerNotas` / `guardarNotas`; lo escrito pasa a «Mensaje que escribió» y la página a su
  destino si la captura no tenía; sin captura reciente se ignora), (2) el primer enlace que no sea de
  Instagram ni de Facebook dentro del **copy**, (3) lo que se escribe a mano en la ficha. La forma fiable de tenerlo siempre es la
  primera: pedir al equipo que pegue la dirección de la tienda en el mensaje al compartir.
- La tabla permite filtrar y agrupar por «Con enlace / Sin enlace» y «Con página / Sin página» para completar lo que falte.

## Qué llega en cada aviso (observado con dos muestras reales)

| | Reel (`ig_reel`) | Publicación (`ig_post`, un video) |
|---|---|---|
| Copy (`title`) | Sí, completo | Sí, completo |
| Enlace de Instagram | Sí (`instagram.com/reel/…`) | No |
| Archivo de video | **No** | **Sí** (la `url` es el archivo; se copia a Storage) |
| Quién lo envió | Su id (y su `@usuario` con el token) | Igual |
| Me gusta, comentarios, vistas, cuenta del video | No vienen | No vienen |

Cinco muestras (4 reels y 1 publicación de video; ningún anuncio patrocinado todavía). Un reel trae `url` (el enlace `/reel/…` o `/p/…`),
`title` y `reel_video_id`; una publicación trae `url` (un archivo en `lookaside.fbsbx.com/ig_messaging_cdn`, que se copia a Storage), `title` e
**`ig_post_media_id`** (no `id`, como dice la documentación).

**La consulta a Instagram con ese id no sirve** (`consultarMedia`, `src/lib/instagram/guardar.ts`): con estos permisos Meta responde
*«Unsupported get request. Object … does not exist, cannot be loaded due to missing permissions, or does not support this operation»*
para una publicación de otra cuenta. Me gusta, comentarios, vistas y compartidos **no se pueden leer por la API**: se completan a
mano en la ficha («Cifras de la publicación», dentro de `metricas`). La respuesta de la consulta queda en «Datos de Meta».

**Lectura de la vista previa pública (implementada, decisión de Hernán, 14 oct 2026):** al recibir una captura con enlace de reel o
publicación, el servidor pide **una vez** esa página pública (`src/lib/instagram/vista-previa.ts`, `leerVistaPublica` en `guardar.ts`) con el
descargador seguro y el agente de las vistas previas de Facebook, y lee `og:description`: «43 likes, 12 comments - nuvotienda.ve on
February 4, 2025: …». Se guardan **me gusta, comentarios, cuenta y fecha de publicación** (en `metricas` y `autor_usuario`), marcados
`fuente: "vista_previa"` («dato no oficial» en la ficha); las **vistas y los compartidos no salen** ahí y se escriben a mano. Si una
persona corrige algo en la ficha, pasa a `fuente: "manual"`. Probado con tres enlaces reales (43/12, 102/95 y 2/0). Riesgos que se
aceptaron: las condiciones de Meta limitan el acceso automatizado, y Instagram puede dejar de responder o pedir inicio de sesión a las
direcciones de Vercel (el motivo queda en `metricas.vista_previa_error`, y la captura se guarda igual). Una publicación (`ig_post`) no
trae enlace, así que no tiene lectura. **Se apaga sin tocar el código** poniendo `INSTAGRAM_LECTURA_PUBLICA=0` en Vercel.
