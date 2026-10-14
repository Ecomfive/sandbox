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

## Qué llega en cada aviso (observado con dos muestras reales)

| | Reel (`ig_reel`) | Publicación (`ig_post`, un video) |
|---|---|---|
| Copy (`title`) | Sí, completo | Sí, completo |
| Enlace de Instagram | Sí (`instagram.com/reel/…`) | No |
| Archivo de video | **No** | **Sí** (la `url` es el archivo; se copia a Storage) |
| Quién lo envió | Su id (y su `@usuario` con el token) | Igual |
| Me gusta, comentarios, vistas, cuenta del video | No vienen | No vienen |

Son dos muestras: confirmar con más antes de darlo por regla. La consulta a Instagram con el id del reel o la publicación
(`consultarMedia`, `src/lib/instagram/guardar.ts`) está para averiguar qué deja leer Meta de una publicación ajena; su respuesta o
su error queda en la ficha, en «Datos de Meta».
