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

## Estado

- **Punto 1 (Pedidos Dropi, agregaciones en Postgres): aplicado** (rama
  `pedidos-agregado-en-base`, con Hernán confirmando el 21 sept). Migración
  `0037_resumen_pedidos_dropi.sql`: `pedidos_dropi_resumen` (un renglón por
  estado: cantidad, monto y alertas) y `pedidos_dropi_alertas`; la página las
  llama con `obtenerResumenPedidos` (`src/lib/pedidos/resumen.ts`). Si la
  migración no se ha corrido, la página cae al cálculo en JavaScript de antes.
  **Hay que correr la 0037 en el editor SQL de Supabase** para que el arreglo
  tenga efecto.
- **Puntos 2 y 3: aplicados** (rama `rendimiento-carga`). País, plataformas del
  país y la plataforma Dropi se guardan en memoria unos minutos
  (`src/lib/cache-ttl.ts`); el perfil de la persona y sus permisos se piden en
  una sola consulta y se comparten dentro de la petición (`cache` de React,
  `src/lib/auth.ts`); el layout pide todo a la vez; Conciliaciones, Productos,
  la ficha de Retiros, la ficha de un proveedor y Usuarios paralelizan sus
  consultas. Medido en un banco local con latencia simulada de 80 ms por consulta
  (no contra la base real): la primera respuesta de las páginas pasó de ~930–1050
  ms a ~440–490 ms y las consultas por página, de 13–18 a 9–14.
- **Punto 4 (límite a rangos personalizados): sin aplicar.**

## Primera tanda del 27 oct 2026 (tras pasar la base de Nano a Small el 26 oct)

Medido antes del cambio:
- **Las funciones de Vercel corrían en Washington (`iad1`) y la base está en Oregón (us-west-2)**: cabecera `x-vercel-id` =
  `iad1::iad1::…` en una ruta dinámica. Cada consulta cruzaba EE. UU. (~70 ms ida y vuelta) y una página hace 10–15.
  **Arreglo:** `vercel.json` › `"regions": ["pdx1"]` (Portland, junto a la base). Comprobar después con
  `fetch("https://mom-beta-proveduria.vercel.app/api/whatsapp/webhook")` → `x-vercel-id` debe decir `…::pdx1::…`.
- Desde un PC en Panamá, cada consulta tarda ~190 ms solo de red; el conteo de «Novedad» (118.591 órdenes, sin índice) ~65 ms más.

Aplicado:
1. **Índices** (migración `0162_indices_rendimiento.sql`): `ordenes` (Novedad parcial y país+plataforma+fecha), `historial_auditoria`
   (entidad+id+fecha y fecha), comentarios «Inconveniente…» de Compras (parcial), `wms_compra_eventos` (fecha, id) y
   `scraping_producto_historial` (fecha, id).
2. **`obtenerPendientesHoy` guardado 45 s por país** (`conTtl`, `src/lib/pendientes-hoy.ts`): lo pide el layout en cada página y lo
   repiten «Hoy» y «Avisos»; son nueve consultas. Son datos del país (cliente de servicio), no de la persona.
3. **Presencia cada 60 s** (antes 20): `LatidoPresencia` (una escritura por persona), umbral de «Activo» 135 s y Usuarios refresca cada
   60 s y solo con la pestaña a la vista.

Segunda tanda (pendiente): ventas diarias, eventos de Compras y Scraping agregados en SQL; `crm_sincronizar_ordenes` solo lo nuevo;
quitar `select("*")`/jsonb que no se usan (`referencias.ts`); el punto 4 de arriba (límite a rangos personalizados); series de «Hoy»
cortadas en 1000 filas.

