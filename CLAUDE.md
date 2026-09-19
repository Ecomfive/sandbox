@AGENTS.md

# Sistema Gestión de Plataformas Ecomfive

Ver [PRODUCT.md](PRODUCT.md) para el propósito del producto, usuarios y
alcance actual (Costa Rica + Panamá, Dropi). Este archivo es para
convenciones técnicas del código.

## Stack

- Next.js (App Router), Server Components y Server Actions.
- Supabase: Postgres + Storage. RLS activado en todas las tablas
  (`for all using (auth.role() = 'authenticated')`).
- Hosting en Vercel, desplegado desde el repo `Ecomfive/sandbox` en GitHub,
  CI/CD automático en push a `main`.
- Sin autenticación de usuarios finales todavía (ver PRODUCT.md) — es una
  limitación temporal conocida, no una decisión de diseño definitiva.

## Convenciones importantes

- Todas las páginas llevan `export const dynamic = "force-dynamic"` — no
  hay caché de página, cada carga consulta datos frescos.
- **Server Components no pueden pasar funciones como props a Client
  Components** (solo datos serializables o funciones marcadas
  `"use server"`). Si un Client Component necesita un callback dinámico,
  sacarlo a su propio archivo `"use client"` y definir la función ahí
  dentro (ver `src/app/(app)/retiros/[id]/cerrar-retiro-form.tsx` como
  ejemplo).
- Acciones que crean/modifican datos importantes deben registrar auditoría
  con `registrarAuditoria()` (`src/lib/auditoria.ts`) — ver
  `src/app/(app)/retiros/actions.ts` o `productos/actions.ts` como ejemplo.
- Supabase/PostgREST limita cada `select` a ~1000 filas. Para traer un
  dataset completo existe el helper `traerTodasLasFilas()` que pagina
  automáticamente. **Ojo:** usarlo solo cuando de verdad se necesitan todas
  las filas en JS; si solo se necesita un conteo, suma o agrupación, es
  mejor hacer esa agregación directamente en Postgres (`count`, `sum`,
  `group by`) en vez de traer todo y calcularlo en JavaScript — ver
  [RENDIMIENTO-PENDIENTE.md](RENDIMIENTO-PENDIENTE.md) para el diagnóstico
  detallado de dónde falta esto todavía.
- Columnas calculadas se definen en la propia migración de SQL con
  `generated always as (...) stored` (ej. `monto_neto` en `retiros`) en vez
  de calcularse en el código.

## Dónde vive cada cosa

- `supabase/migrations/` — cambios de esquema, en orden numerado. Correr
  cada migración nueva manualmente en el editor SQL de Supabase.
- `src/app/(app)/<seccion>/page.tsx` — página de cada sección; `actions.ts`
  junto a ella con sus Server Actions.
- `src/components/` — componentes compartidos entre secciones.
- `src/lib/` — helpers de datos y lógica compartida (país actual, fechas,
  auditoría, etc.).
- `scripts/` — scripts que corren fuera del request cycle (ingestión de
  Dropi, mantenimiento de sesión, etc.), ejecutados con `npx tsx`.

## Trabajo pendiente conocido

- [RENDIMIENTO-PENDIENTE.md](RENDIMIENTO-PENDIENTE.md): diagnóstico de
  rendimiento de navegación entre páginas, con plan de arreglo priorizado.
  **Sin aplicar todavía** — no implementar sin confirmar con Hernán primero.

## Flujo de trabajo con git

- Cambios se hacen en una rama propia (`git checkout -b nombre-rama`), no
  directo a `main`.
- Al terminar: `git push -u origin nombre-rama` y abrir un Pull Request a
  `main` en GitHub para revisión antes de mergear.
- Vercel genera un deploy de preview automático por cada rama/PR abierto,
  independiente del deploy de producción.
