# Seguridad

Resultado de la auditoría del 2 de octubre de 2026 y lo que se hizo con cada hallazgo. Para revisar esto en cualquier
momento: `npm run test:seguridad` (pruebas del sanitizador y de las imágenes) y
`node scripts/verificar-seguridad-supabase.mjs` (comprueba la base desde fuera; solo lee).

## Cómo está protegida la app

- **El control de acceso vive en el servidor**, en cada página, acción y ruta (`requireModulo`, `requireModuloEscritura`,
  `getUsuarioActual`, que también comprueba que el perfil esté activo). El middleware solo refresca la sesión.
- **La app lee y escribe siempre con la clave de servicio** (`createServiceClient`), que se salta RLS. El cliente con la
  sesión de la persona (`createSessionClient`) se usa solo para iniciar y cerrar sesión y saber quién es.
- **Las tablas tienen RLS activado y sin políticas** (migración `0063`): solo el servidor puede tocarlas. Nadie puede
  llamar directo a la API de Supabase con la clave pública, ni con sesión ni sin ella.

## Hallazgos y estado

| Gravedad | Hallazgo | Estado |
|---|---|---|
| Crítico | Registro de cuentas abierto en Supabase | **Cerrado el 2 de oct de 2026** y verificado |
| Crítico | 44 políticas RLS daban lectura y escritura completas a cualquier usuario con sesión (podía subirse a Admin) | **Migración `0063` aplicada el 2 de oct de 2026** y verificada con una cuenta con sesión |
| Alto | Sanitizador de HTML con expresiones regulares (4 de 7 ataques pasaban sin tocar) | Arreglado: lista permitida con `sanitize-html` y 30 pruebas |
| Alto | Next.js 16.3.5 con una vulnerabilidad crítica en `next/og` (no se usaba) | Arreglado: 16.3.8; `npm audit` sin vulnerabilidades |
| Medio | Cookies de sesión legibles desde JavaScript | Arreglado: `httpOnly`, `secure` y `sameSite` |
| Medio | Sin cabeceras de seguridad (se podía incrustar la app en otro sitio) | Arreglado: `X-Frame-Options`, CSP parcial, `nosniff`, `Referrer-Policy`, `Permissions-Policy` |
| Medio | El avatar se validaba por el tipo que declara el navegador (pasaba un SVG) | Arreglado: se valida la firma del archivo (JPG, PNG, WebP, GIF) |
| Medio | Buckets sin límite de tamaño ni de tipo | Arreglado en la migración `0063` |
| Medio | Texto de búsqueda sin limpiar en un filtro `.or()` | Arreglado |
| Medio | 5 de 6 cuentas son Admin | Revisado: las cuentas `oce***@gmail.com` y `con***@ecomfive.io` están confirmadas como Admin; roles sin cambios |
| Bajo | Secreto de los crons comparado sin tiempo constante | Arreglado |
| Bajo | Mensajes de error crudos de la base llegan al navegador | Sin cambios |

## Verificación del 2 de octubre de 2026

Tras cerrar el registro y aplicar la migración, `node scripts/verificar-seguridad-supabase.mjs` con una cuenta con
sesión dio: registro público desactivado ✓, una persona sin sesión no lee ninguna de las 45 tablas ✓ y una persona con
sesión, llamando directo a la API, no lee ninguna de las 45 tablas ✓. Los buckets quedaron con sus límites (`avatars`
2 MB, `wms-productos` 50 MB, los privados 25 MB). Producción sirve las cabeceras de seguridad. Vale la pena repetir la
verificación después de cada migración que cree tablas. Una tabla vacía no prueba por sí sola que esté protegida: lo
que garantiza el cierre es que ninguna tabla de `public` tiene políticas (la migración las quitó todas).

## Pasos que se siguieron, en este orden

1. **Cerrar el registro (1 minuto, ahora).** Supabase → Authentication → Sign In / Providers → Email → desactiva
   «Allow new users to sign up». Las invitaciones desde Usuarios y roles siguen funcionando. Comprueba con
   `node scripts/verificar-seguridad-supabase.mjs`: la sección 1 debe salir con ✓.
2. **Probar la rama `seguridad-arreglos` en su vista previa de Vercel.** Inicia sesión, cambia la foto de perfil, busca
   un producto, abre una ficha de producto y sube una imagen. Con el registro cerrado y sin la migración, todo debe
   funcionar igual.
3. **Fusionar la rama a `main`.** El código es compatible con la base antes y después de la migración.
4. **Correr la migración `0063`.** Supabase → SQL Editor → pega `supabase/migrations/0063_rls_solo_servidor.sql` y
   ejecútala. Verás avisos «Política eliminada: … en <tabla>» (42 si el CRM v2 de la migración `0062` aún no está instalado; 44 si lo está). Es repetible.
5. **Comprobar en producción.** Con una cuenta de prueba que no sea de administrador:
   `PRUEBA_EMAIL=… PRUEBA_PASSWORD=… node scripts/verificar-seguridad-supabase.mjs`. Todo debe salir con ✓. Después
   recorre la app unos minutos: Hoy, Retiros, Pedidos Dropi, Productos Test y el CRM.
6. **Si algo dejó de funcionar:** corre `supabase/rollbacks/0063_rollback.sql` para volver al estado anterior mientras se
   investiga. Eso reabre la base a cualquier cuenta con sesión: mantén el registro cerrado.

La migración y su reversa se probaron en una base PostgreSQL desechable con las 62 migraciones existentes: antes, un
usuario con rol «Lector» leía todo, editaba su propio perfil para volverse Admin e insertaba y borraba filas; después, no
ve nada, no puede cambiar su rol y el servidor sigue funcionando.

## Después

- Revisar las cuentas y los roles en Usuarios y roles: confirmar a `oce***@gmail.com` y `con***@ecomfive.io`, y dar
  rol Admin solo a quien lo necesite. Cuentas sin confirmar que no se usan: eliminarlas.
- Activar la autenticación en dos pasos en las cuentas de Supabase, Vercel y GitHub de quienes administran.
- Si la clave de servicio (`SUPABASE_SERVICE_ROLE_KEY`) se compartió fuera de `.env.local` o de Vercel, rotarla.

## No abordado todavía

- **Política de contenido completa (`script-src` con nonce).** La actual es parcial a propósito: evita el clickjacking y
  varias inyecciones sin romper los scripts de Next.js.
- **Límite de intentos de inicio de sesión propio.** Hoy solo aplican los límites de Supabase.
- **Mensajes de error genéricos.** Varias acciones devuelven el mensaje de la base tal cual.
- **Subidas de archivos al servidor** (extractos): se limitan por tamaño en el bucket; el análisis de Excel usa la
  versión 0.20.3 de SheetJS instalada desde su CDN oficial, con hash de integridad en `package-lock.json`.
