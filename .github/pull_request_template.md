## Qué cambia

<!-- En pocas líneas: qué hace este PR y por qué. -->

## Seguridad (marca lo que aplica)

- [ ] Toda acción del servidor o ruta nueva revisa el acceso con `exigirAcceso` (módulo, escritura, país y tienda en una llamada) o con las guardias de `src/lib/auth.ts`; la prueba de cierre (`npm run test:seguridad`) pasa.
- [ ] Lo que llega del navegador (ids, país, tienda, rutas de archivos) se comprueba contra lo guardado en la base, no se confía en el formulario.
- [ ] Si toca permisos, archivos/Storage, webhooks, IA o datos de clientes: pasó por `/security-review` antes de publicarse.
- [ ] Una migración nueva trae su reversa en `supabase/rollbacks/` y termina con un `select` de revisión.
- [ ] No hay secretos en el código ni variables nuevas con `NEXT_PUBLIC_` que deban ser privadas.
- [ ] El Centro de ayuda (`src/lib/ayuda/contenido.ts`) cuenta lo nuevo.

## Pruebas

- [ ] `npx tsc --noEmit` y `npx next build` pasan con `main` combinado.
