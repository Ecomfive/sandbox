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
- Que las personas que comparten **acepten el rol de Evaluador de Instagram** (alguien con la invitación pendiente envió una
  publicación y llegó igual). Con la app publicada basta con que compartan el mensaje con la cuenta.
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

## Los dos enlaces de cada captura: qué se puede asegurar y qué no

- **Enlace de Instagram del anuncio o la publicación:** un reel siempre lo trae. Una publicación (`ig_post`) no: solo trae el archivo
  de video y su id, y de ese id no se puede armar el enlace.
- **Enlace de la página de destino:** Meta **no lo entrega** en el mensaje directo, el perfil público de la cuenta no muestra su
  «link en la bio» a una consulta anónima y, en las muestras, el copy tampoco trae ninguna dirección de tienda. Lo que sí se aprovecha,
  en este orden: (1) el enlace que la persona **escribe en el mismo mensaje** al compartir, (2) el primer enlace que no sea de
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
