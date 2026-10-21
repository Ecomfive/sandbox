# Portal del proveedor (Chin): plan de construcción

Plan aprobado sobre el prototipo del 21 oct 2026 (https://claude.ai/artifact/4LZynFHH2dJQbeRLJS5nmN). **La interfaz es la del
prototipo**: mismas pestañas, tablas, tarjetas, panel lateral y flujos; solo cambian los colores y piezas por los del sistema
(tabla «Colores» al final).

## Qué se construye

Dos pantallas sobre el mismo dato:

- **Nuestra vista** · *Operación › Fulfillment › Portal del proveedor* (`/portal-proveedor`, módulo `portal-proveedor`, en el menú
  justo debajo de Compras). Pestañas: **Novedades del proveedor**, **Por decidir**, **En cotización**, **Tránsito**, **Pagos**.
  La explicación de «Cómo funciona» del prototipo pasa a la guía del Centro de ayuda.
- **Portal de Chin** · otra entrada, sin el menú ni nada más del sistema (`/proveedor`, más adelante `proveedores.ecomfive.io`).
  Pestañas: **Por cotizar**, **Cotizado**, **En producción**, **Enviado**, **Pagos**.

Acordado con Hernán: todo en español; solo Chin (proveedor y agente logístico a la vez); anticipo del 50 % a los **10 días corridos**
desde la fecha de envío y saldo del 50 % a la llegada; plazos por mar Panamá 45–55, México 60 y **Costa Rica 80** días; Chin puede
cambiar las unidades al cotizar (pides 1,000 y la caja trae 960).

## Cómo funciona el espejo

```
Compras (wms_compras)  ──disparador──▶  proveedor_pedidos (espejo)  ◀──acciones del portal──  Portal de Chin
        ▲                                         │
        └──── la acción del portal aplica el cambio a la compra, deja el evento y avisa ◀──┘
```

- **Compras no cambia.** Una compra con proveedor «Chin» que entra en `cotizar` aparece sola en el espejo. Un disparador en
  `wms_compras` (insert/update) copia a `proveedor_pedidos` solo lo que Chin puede ver: nombre del producto, foto de referencia,
  país, vía, unidades pedidas, nota para el proveedor, etapa y fecha de llegada. Así da igual dónde se cambie la compra (ficha, celda,
  lote, importación): el espejo siempre está al día.
- **Chin nunca toca `wms_compras`.** Escribe en el espejo con las acciones del portal (`src/app/(proveedor)/…/actions.ts`), que
  validan todo en el servidor y, en la misma acción, pasan el cambio a la compra (`src/lib/proveedor/aplicar.ts`):
  - Cotizar: `costo_unitario` y `cantidad_pedida` de su línea de producto (si la compra tiene una sola) o `qty_total` y `monto_total`;
    etapa a `cotizado`; la foto real queda como adjunto de la compra (`wms_compra_adjuntos`, origen `proveedor`).
  - Marcar enviado: etapa a `tracking` y `fecha_envio` (la Planificación se recalcula como hoy).
  - Confirmar un pago: `primer_pago`/`fecha_pago_1` o `segundo_pago`/`fecha_pago_2` y `pagado_a_proveedor`.
  - Cada cambio deja su evento en `wms_compra_eventos` (origen `proveedor`), una línea en la Actividad de la compra y la auditoría.
- **Lo que Chin no ve:** precio de venta, márgenes, tiendas, etiquetas, responsables, comentarios internos, otras compras ni otros
  proveedores. Si la compra se pasa a otro proveedor o se anula, sale del espejo.

### Quién mueve cada etapa

| Paso | Ecomfive | Chin |
|---|---|---|
| Pedir cotización (compra en «01 - Cotizar» con unidades, país, vía, foto, nota) | Sí, desde Compras o «En cotización» | — |
| Costo unitario, total, unidades por caja y foto real → Cotizado | — | Sí |
| Cotizado → Producción o Descartado | Sí («Por decidir» o Compras) | — |
| Producción → Tracking con fecha de envío | — | Sí |
| Marcar llegada (etapa «Arribo mercancía» + fecha de llegada) | Sí (bodega) | Lo ve |
| Avisar un pago (monto, referencia, comprobante, a qué cuotas va) | Sí | Lo ve |
| Confirmar el pago recibido | Lo ve | Sí |

## Base de datos (migración nueva, la siguiente libre)

Todas con RLS activado y **sin políticas** (solo el servidor). Llaves UUID v7.

- `proveedores`: `nombre` («Chin»), `nombre_en_compras` (el texto de `wms_compras.proveedor`), `dias_anticipo` (10),
  `porcentaje_anticipo` (50), `activo`.
- `proveedor_usuarios`: `usuario_id` (→ `auth.users`), `proveedor_id`, `nombre`, `activo`. **No tienen fila en `perfiles`**, así que
  `getUsuarioActual` no los reconoce y ninguna página ni acción del sistema les abre (todas exigen `requireModulo`).
- `proveedor_pedidos` (el espejo): `compra_id` único, `proveedor_id`, `producto`, `foto_referencia`, `pais_codigo`, `via`,
  `modalidad`, `unidades_pedidas`, `nota_para_proveedor`, `etapa` (por_cotizar · cotizado · produccion · enviado · llegado ·
  descartado), `unidades_ofrecidas`, `costo_unitario`, `monto_total`, `foto_real_ruta`, `comentario_proveedor`, `cotizado_en`,
  `confirmado_en`, `fecha_envio`, `fecha_llegada`, `visto_por_proveedor_en`, `actualizado_en`.
- `proveedor_avisos_pago`: `proveedor_id`, `fecha`, `monto`, `referencia`, `comprobante_ruta`, `estado` (avisado · confirmado),
  `avisado_por`, `confirmado_por`, `confirmado_en`.
- `proveedor_aviso_cuotas`: `aviso_id`, `pedido_id`, `cuota` (anticipo · saldo), `monto`.
- `proveedor_novedades`: lo que cambió cada lado (`lado` ecomfive/proveedor, `tipo`, `texto`, `pedido_id`, `leida_en`). Alimenta
  «Novedades del proveedor» y los contadores de las dos vistas.
- `notificaciones_usuario.tipo` admite `'proveedor'`: la campana del responsable de la compra avisa cada cambio de Chin.
- Disparador `proveedor_sincronizar_compra()` en `wms_compras` y carga inicial de las compras abiertas de Chin (hoy ~300: 91 en
  Cotizar, 29 Cotizado, 35 Producción, 135 Tracking, 10 Arribo).
- Bucket privado `proveedor-portal` (`<proveedor>/<pedido>/…`): fotos reales y comprobantes, subida directa con dirección firmada,
  validados por su firma (`detectarImagen` / `detectarAdjunto`), vistos con enlaces firmados de una hora.
- `wms_rutas_envio`: Chin · Costa Rica · mar queda en 80 días (hoy vacío). Los plazos del tránsito salen de esa tabla.

## Reglas puras (`src/lib/proveedor/`, con prueba en `test:seguridad`)

- `cuotas.ts`: anticipo = 50 % del total, vence `fecha_envio + 10`; saldo = 50 %, vence `fecha_llegada`; estado de cada cuota
  (pagada a tiempo, pagada N d tarde, vence en N d, vence hoy, vencida N d).
- `transito.ts`: días desde el envío contra el plazo de su país y vía (en plazo, llega en ≤ 7 d, atrasado N d, llegó antes/tarde).
- `cotizacion.ts`: total ↔ costo unitario con las unidades ofrecidas; marca «pediste 1,000» si cambian.
- `espejo.ts`: qué etapa de la compra corresponde a cuál del portal y qué campos se copian (una sola lista; sirve al disparador y a
  la prueba que compara las dos).
- `permisos-proveedor.ts`: qué paso puede dar cada lado (la tabla de arriba), usado por todas las acciones.

## Seguridad (lo que se prueba)

- Toda acción del portal empieza con `requireProveedor()` (usuario con sesión **y** fila activa en `proveedor_usuarios`) y comprueba
  que el pedido sea de su proveedor; nunca recibe un `proveedor_id` del navegador.
- El portal tiene su propio layout `(proveedor)`: sin `NavBar`, menú, buscador, campana ni «Crear». Un usuario de proveedor que abre
  cualquier ruta del sistema vuelve al portal; el login lo manda a `/proveedor`.
- Solo se aceptan los campos de la lista blanca de cada acción; montos y unidades se validan (positivos, límites razonables).
- Las fotos y comprobantes se validan por su contenido; un archivo abandonado se borra.
- Prueba de que un usuario de proveedor no pasa `requireModulo` ni ve pedidos de otro proveedor.

## Fases (cada una es un PR que Hernán combina)

1. **Base y espejo.** Migración (tablas, disparador, bucket, carga inicial, ruta CR 80 días), reglas puras con pruebas y la lectura
   del espejo. Sin pantallas. *Hernán corre la migración y verifico que las ~300 compras de Chin quedaron en el espejo.*
2. **Nuestra vista.** Página «Portal del proveedor» debajo de Compras con Novedades, Por decidir, En cotización y Tránsito
   (**Pagos pasa a la fase 4**: en Compras, `fecha_pago_1` es en realidad la fecha en que vence y casi no hay montos pagados, así
   que el cumplimiento saldría falso hasta tener los avisos confirmados y el historial de las hojas de Chin); «Por decidir» y «Marcar llegada»
   cambian la compra; «Nueva compra en Cotizar» abre la ficha de Compras con el proveedor Chin. Módulo `portal-proveedor` (se da a
   los roles que tienen Compras), guía del Centro de ayuda y novedad.
3. **Portal de Chin.** Cuenta de Chin (se crea desde Usuarios y roles como «usuario de proveedor»), entrada `/proveedor`, sus cinco
   pestañas, el panel «Cotizar» (costo, total, unidades por caja, foto real, comentario) y «Marcar enviado». Cada cambio llega a la
   compra y a Novedades/campana.
4. **Pagos.** «Avisar pago» con reparto por cuota y comprobante; Chin lo confirma y se actualizan los pagos de la compra.
   Indicadores de cumplimiento en las dos vistas.
5. **Historial.** Importar las hojas de Chin (pagos de PA/CR/MX y cotizaciones) para que el cumplimiento y el tránsito tengan los
   datos desde 2025: lo que se pueda emparejar con una compra (producto, país y fecha de envío) se vincula; el resto queda como
   historial. Script con `--aplicar`, como las demás importaciones.
6. **Opcional:** dirección propia `proveedores.ecomfive.io` y un correo diario a Chin con lo pendiente.

Cada fase con interfaz pasa por `ui-ux-pro-max` e `impeccable`, y por `tsc`, `test:seguridad` y `next build` antes del PR.

## Colores: del prototipo al sistema

| Prototipo | Sistema |
|---|---|
| Acento violeta (pestaña activa, «Cotizado» nuevo, aviso de pago) | `--primario` / `--primario-suave` |
| Línea degradada arriba de los indicadores | `marco-neon` (`--neon`) |
| Contador vivo (rosado) | `--aviso` |
| Chips ok / aviso / mal / info | `Badge` con `success` / `warning` / `destructive` / `azul` |
| Fondo suave, franjas de encabezado | `--muted` |
| Bordes y bordes de campos | `--border` / `--border-control` |
| Botón principal negro | `bg-foreground text-background` |
| Indicadores, cabeceras y tablas | `Indicador`, `CabeceraTarjeta`, `claseTh` / `claseTd` (`piezas-panel.tsx`) |
| Panel lateral de cotizar y de aviso de pago | `Ventana lado="derecha"` + `Seccion` |
| Tipografía Geist | la del sistema |

## Decidido para la fase 3 (Hernán, 21 oct 2026)

- **La campana avisa a Francis Aponte** cuando Chin cambia algo (precio, foto, envío, pago confirmado). Se guarda como dato del
  proveedor (`proveedores.notificar_a`, la persona), no fijo en el código, para poder cambiarlo.
- **Chin tiene una sola cuenta** por ahora (la tabla ya admite más).
- **La foto real queda aparte**: va como adjunto de la compra (origen `proveedor`) y la foto de la compra sigue siendo la de
  referencia.
