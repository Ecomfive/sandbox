# WhatsApp en el CRM: cómo conectar un número (WhatsApp Cloud API)

Guía para conectar el número de WhatsApp de la empresa a la **Bandeja de WhatsApp** del CRM (`/crm-dropshippers/bandeja`). El código está
en `src/lib/whatsapp/`, `src/app/api/whatsapp/` y `src/app/(app)/crm-dropshippers/bandeja/` (ver `CLAUDE.md`). Se conecta **directo con la
API oficial de Meta, sin Chatwoot** (decisión del 26 oct 2026). No usar soluciones por código QR: no son oficiales y el número se puede
bloquear. Los nombres de los menús de Meta cambian seguido: si algo no se llama igual, buscar por el sentido.

## Qué hace falta

1. **La base:** correr la migración `supabase/migrations/0158_whatsapp.sql`.
2. **Una app de Meta** (developers.facebook.com › Crear app › tipo Empresa, en el portafolio comercial de la empresa) con el producto
   **WhatsApp**. Puede ser una app nueva o la misma de Instagram (ver `INSTAGRAM-META.md`): si es la misma, su secreto es el mismo.
3. **La cuenta de WhatsApp Business** de la empresa (WABA) y **el número** agregado en WhatsApp › Configuración de la API. Meta pide
   verificar el número con un código y, para pasar los límites de prueba, **verificar el negocio** (Configuración del negocio › Centro de
   seguridad).
   - Un número que hoy se usa en la **app WhatsApp Business del celular**: Meta ofrece usarlo a la vez en la app y en la API
     («coexistencia»), pero depende del país y del tipo de cuenta; si no está disponible, pasar el número a la API lo saca de la app.
     **Confirmarlo en Meta antes de mover el número que usa Atención.** Lo más seguro para empezar: un número nuevo de prueba.
4. **Un token permanente:** Configuración del negocio › Usuarios del sistema › agregar uno (Administrador) › asignarle la app y la cuenta de
   WhatsApp › Generar token con los permisos `whatsapp_business_messaging` y `whatsapp_business_management`. El token temporal de la
   pantalla de la API vence en 24 h: no sirve para producción.
5. **Los datos en el servidor** (Vercel › Settings › Environment Variables; nunca en el código ni con `NEXT_PUBLIC_`):
   - `WHATSAPP_TOKEN`: el token permanente del paso 4.
   - `WHATSAPP_APP_SECRET`: Configuración de la app › Básica › Clave secreta de la app.
   - `WHATSAPP_VERIFY_TOKEN`: una palabra larga que se inventa (se escribe igual en el paso 6).
   - `WHATSAPP_API_VERSION` (opcional): la versión de la Graph API, por ejemplo `v23.0` (es la que se usa si no se pone).
   Después de agregarlos, volver a desplegar.
6. **El webhook:** en la app › WhatsApp › Configuración › Webhook: URL `https://<dominio del sistema>/api/whatsapp/webhook` y el
   `WHATSAPP_VERIFY_TOKEN`. Meta la verifica en el momento. Luego, en «Campos del webhook», **suscribir `messages`**.
7. **Publicar la app (modo Activo).** Con Instagram, en modo Desarrollo se verificaba el webhook pero no llegaban mensajes reales.

## Varios números y coexistencia (27 oct 2026)

- Se pueden conectar varios números a la misma cuenta (2 sin verificar el negocio, unos 20 con el negocio verificado). Cada uno entra
  solo con su primer mensaje; después se le pone nombre y área (`atencion`, `comercial` o `direccion`) en `whatsapp_numeros`:
  `update whatsapp_numeros set nombre = 'CEO', area = 'direccion' where numero = '+507…';`
- **Coexistencia** (el número sigue en la app WhatsApp Business del celular y además en la API; disponible en Panamá): se conecta
  por el registro integrado de Meta (Embedded Signup), escaneando un código desde la app. Requisitos: app Business 2.24.17 o más nueva
  y abrirla al menos cada 14 días. En el webhook, suscribir también **`smb_message_echoes`**: así lo que se responde desde el celular
  llega a la bandeja como «Desde el celular» (migración 0164) y cuenta en los KPIs. El historial que Meta importa al conectar
  (campo `history`) todavía no se guarda.

## Cómo saber que funciona

- Escribirle al número desde otro WhatsApp: la conversación aparece en la bandeja en segundos (se refresca cada 8 s).
- El número de la empresa se crea solo con su primer mensaje, con el nombre «WhatsApp +507…» y el área Atención. Para cambiar el nombre
  («Atención») o pasarlo a Comercial: tabla `whatsapp_numeros` (columnas `nombre` y `area`).
- Responder desde la bandeja: debe llegar al celular, y el mensaje pasa de «Enviado» a «Entregado» y «Leído».

## Reglas de WhatsApp que hay que conocer

- **24 horas:** se puede responder con texto libre hasta 24 h después del último mensaje del dropshipper. Después, solo con una **plantilla
  aprobada** por Meta (WhatsApp › Administrar plantillas), que tiene costo por conversación. Las plantillas desde la bandeja están pendientes.
- **Archivos:** Meta guarda las fotos, audios y documentos que llegan unos 30 días. Copiarlos a Storage para siempre está pendiente.
- **Calidad del número:** muchos bloqueos o reportes bajan la calificación del número y Meta puede limitarlo. No mandar mensajes masivos
  sin plantilla ni a quien no escribió.
