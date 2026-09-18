# Rendimiento — diagnóstico pendiente de aplicar

Diagnóstico hecho el 18 sept 2026 sobre por qué la navegación entre páginas
se siente lenta. Medido en producción (TTFB rápido, ~85ms, en todas las
páginas — el cuello de botella está en las consultas a Supabase antes de
poder renderizar, no en la red ni en Vercel).

## Tiempos medidos (producción)

| Página | Tiempo real de carga |
|---|---|
| Dashboard | ~1.4s |
| **Pedidos Dropi** | **~2.4s** (el peor caso) |
| Alertas | ~1.1s |
| Productos | ~1.5s |

## Causa principal — Pedidos Dropi

`src/app/(app)/pedidos-dropi/page.tsx` usa `traerTodasLasFilas()` (que pagina
más allá del límite de 1000 filas de Supabase) para traer **todas las
columnas de todos los pedidos** del rango de fechas, solo para:

- `resumen.length` → contar pedidos (línea ~79)
- `resumen.reduce(...)` → sumar montos (línea ~80)
- agrupar por estado en JS (líneas ~90-91)
- `carteraGanancia` (`historial_cartera`, líneas 68-76) → se usa solo como
  `Set` para verificar membresía (línea 83-85)

Todo esto se puede resolver con agregaciones en Postgres (`count`, `sum`,
`group by`, o un `.in()` contra las referencias de interés) en vez de traer
miles de filas completas a JavaScript.

## Otros hallazgos (menor impacto, pero se acumulan)

- `getPaisActual()` (`src/lib/pais.ts`) y el lookup de la plataforma "Dropi"
  por nombre se repiten en **cada página** aunque casi nunca cambian — no
  están cacheados (`React.cache`/`unstable_cache`).
- Consultas independientes que podrían ir en `Promise.all` pero corren una
  detrás de otra: `conciliaciones/page.tsx`, `productos/page.tsx`,
  `retiros/[id]/page.tsx`.
- `calcularPendientes()` (`src/lib/alertas/pendientes.ts`) y las series del
  Dashboard (`src/lib/dashboard/queries.ts`) no tienen límite superior en el
  rango de fechas — un rango personalizado muy amplio podría traer la tabla
  completa.

## Plan propuesto (de mayor a menor impacto)

1. Arreglar Pedidos Dropi: mover el conteo/suma/desglose a la base de datos.
2. Dejar de re-consultar país y plataforma Dropi en cada página (cache).
3. Paralelizar las consultas sueltas en Conciliaciones, Productos y la
   ficha de Retiros.
4. Poner un límite razonable a los rangos de fechas personalizados.

**Estado: sin aplicar — el usuario pidió guardar esto para después.**
