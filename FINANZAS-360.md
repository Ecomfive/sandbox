# Portal AF4 360° — de los Excel financieros al sistema

Documento técnico de la migración de los libros de Excel de finanzas al portal: qué hoja va a qué módulo y tabla, las
reglas de negocio y el orden en que se cargan. **Las cifras reales, los cuadres contra los Excel y los nombres de las
personas no van en el repositorio**: están en `datos-privados/FINANZAS-360-completo.md` (carpeta ignorada por git),
junto con los Excel originales.

## De cada Excel a su módulo

| Archivo | Qué es | Módulo | Migración |
|---|---|---|---|
| `GASTOS_PANAMA_<año>.xlsx` · hoja del año | Libro de movimientos | **Finanzas › Libro de movimientos** (`fin_movimientos`) | 0114–0116, 0120 |
| ídem · hoja EERR | Estado de resultados por tienda y base de reparto | **Estado de resultados** (`fin_eerr_mensual`, `fin_base_distribucion`) | 0113–0114 |
| ídem · hoja EFE | Flujo de caja | **Flujo de caja** (`fin_flujo_mensual`, `fin_saldos_iniciales`) | 0117 |
| ídem · reparto de utilidades | Utilidad por socio | **Distribución de utilidades** (`fin_socios`, `fin_participaciones`) | 0117 |
| ídem · CPC / CPP | Cuentas por cobrar y por pagar | **Cuentas por cobrar / por pagar** (`fin_cartera`, `fin_cartera_abonos`) | 0118 |
| ídem · Bienes de Uso | Activo fijo y depreciación | **Bienes de uso** (`fin_bienes_uso`) | 0120 |
| `PRECIOS_DE_COSTE_MERCANCIA.xlsx` | Costo real por lote y mapeo Dropi | **Costos de mercancía** (`fin_costos_lotes`, `fin_costo_vigente`) | 0121 |
| `PLANILLA_FORMAL_PANAMA.xlsx`, `NOMINA_EXTRANJERA.xlsx` | Nómina formal y externa (USDT) | **Equipo › Nómina** (`nom_*`, datos sensibles) | 0119 |
| `GESTION_OCEANS_PANAMA.xlsx` | Órdenes de las tiendas Shopify | **Ventas por tienda** (`ven_ordenes`) | 0122 |
| `CONCILIACIONES_DE_BANCO_*.xlsx` | Bancos, Yappy, MiPOS, Servientrega | **Conciliación bancaria** (`conc_*`) | 0123 |
| `GESTION_DELIVERYS_*.xlsx` | Liquidación de repartidores | **Operación › Deliverys** (`del_*`) | 0124 |
| — | Vista de CFO e informe mensual | **Panel financiero** | 0125 |
| — | Órdenes reales, depósitos de repartidores e ingresos por cuenta | **Conciliación bancaria v2** | 0129 |
| — | Caja semana a semana, 3 escenarios, gastos recurrentes, precisión | **Proyección de caja** (`fin_proyeccion_*`) | 0131, 0137 |
| — | Presupuesto por tipo, presupuesto vs real en Panel e Informe, múltiplo configurable y DCF | **Presupuesto** y **Panel › Valoración** (`fin_config.valoracion`) | 0132 |
| — | Cliente por teléfono (huella), recompra, cohortes, LTV, CAC, ROAS y ROAS de margen | **Clientes y marketing** (`cli_*`) | 0133 |
| — | Inventario valorizado, efectivo de repartidores desde las órdenes, tareas diarias y alertas | **Rentabilidad › Inventario**, **Deliverys**, **Panel › Tareas programadas** (`fin_alertas`, `/api/cron/*`) | 0134 |
| — | Sobrestock, inventario muerto y liquidación, merma del conteo al EERR, punto de reorden con la caja proyectada, presupuesto de compras en la proyección, cuentas por pagar y anticipos a proveedores, costo puesto en bodega y variación de costo | **Rentabilidad › Inventario, Reorden y Compras y costos** (`fin_compras_gastos`, `fin_compras_presupuesto`, `fin_anticipos_proveedores_al`, `fin_merma_conteo`) | 0148 |
| — | Entidades Panamá (USD) y Costa Rica (CRC), tipos de cambio por mes, reparto por entidad | **Estado de resultados › Tipos de cambio** (`fin_entidades`, `fin_tipos_cambio_mes`) | 0136 |
| — | EERR por año anterior, 12 meses móviles, por tienda y por canal, en moneda local y USD; base de reparto elegible; desglose de cifras; consolidado sin intercompañía; notas por mes; flujo indirecto | **Estado de resultados**, **Flujo de caja** (`fin_eerr_partes`, `fin_notas_mes`, `fin_unidades.canal`, `*.intercompania`, `fin_config.base_reparto`) | 0142 |
| — | Activo, pasivo y patrimonio por mes de corte con la diferencia por cuadrar | **Balance general** (`fin_balance_partidas`, `fin_inventario_cortes`) | 0143 |
| — | Posición de caja, saldos bancarios diarios, calendario, prioridad y aprobación de pagos, efectivo de repartidores, costos de cobro, saldo de Dropi | **Tesorería** (`fin_saldos_bancarios`, `fin_pagos_programados`, `fin_pago_prioridades`, `fin_config.tesoreria`) | 0144 |
| — | Líneas de crédito y préstamos (amortización francesa); deuda a una fecha para el balance (`fin_deuda_al(fecha)`, vista `fin_prestamos_saldos`) | **Tesorería › Deuda** (`fin_lineas_credito`, `fin_prestamos`) | 0145 |
| — | Financiamientos por ciclo (giros: costo por ciclo de N días), penalidades de prepago, ofertas de refinanciamiento y covenants; `fin_deuda_al` suma los giros | **Tesorería › Deuda, Optimizar deuda, Refinanciamiento, Covenants, Capital para crecer** (`fin_financiamientos_ciclo`, `fin_ofertas_refinanciamiento`, `fin_covenants`, `*.penalidad_prepago`, `*.comision_prepago`; alerta `tesoreria_covenant`) | 0159–0160 |
| — | Informe mensual por correo (día 5), resumen semanal por WhatsApp, versiones de cada informe, explicación con IA, comentarios en cifras, tiendas permitidas por persona, Shopify directo y respaldo semanal | **Panel › Hoy, Envíos, Versiones, Respaldos** (`fin_informes_*`, `fin_comentarios`, `fin_shopify_estado`, `fin_respaldos`, `perfiles.tiendas_permitidas`) | 0150 |
| — | Pedidos entregados, ganancias liquidadas y retiros de Dropi por mes, y el saldo de la billetera en Cuentas por cobrar | **Tarea «dropi-finanzas»** (`fin_dropi_mensual`, `fin_sincronizar_dropi()`) | 0151 |
| — | Clasificación asistida con confianza, reglas que aprenden, duplicados, montos atípicos, salud de datos, catálogo de proveedores con alias y RUC/DV, comprobantes, lectura de facturas con IA, bitácora de importaciones con «Deshacer», comparar antes de importar y plantillas | **Libro de movimientos › Por clasificar, Revisar, Proveedores, Salud de datos**, **Importar › Historial** (`fin_proveedores`, `fin_proveedor_alias`, `fin_calidad_revisados`, `fin_importaciones`, `fin_movimiento_adjuntos`, bucket `fin-comprobantes`) | 0138 |
| — | Un solo importador que reconoce los Excel y la tienda elegida en la barra de arriba | **Crear › Importar Excel** (`/importar`) | — |
| — | Checklist de cierre, bloqueo de meses cerrados y fotografía | **Cierre de mes** (`fin_cierres`, disparador `fin_bloqueo_cierre`) | 0127 |
| — | Fecha objetivo y semáforo por tarea, responsables con avisos, aprobación en dos pasos, registro de reaperturas, variaciones explicadas, cuadres de inventario y de Dropi, asientos de ajuste (provisiones de la planilla, devengos de prepagados, reclasificaciones) y paquete imprimible | **Cierre de mes** (`fin_ajustes_cierre`, `fin_prepagos`, `fin_cierre_cuadres`, `fin_cierre_variaciones`, `fin_cierre_reaperturas`, `fin_config.cierre`, `fin_cuadre_dropi_al`) | 0140 |
| — | Calendario fiscal de Panamá con avisos y marca de presentado | **Cierre de mes › Calendario fiscal** (`fin_obligaciones_fiscales`, `fin_obligaciones_presentadas`) | 0141 |
| — | Cascada de margen, economía unitaria, capital de trabajo, palancas | **Rentabilidad por tienda** (`fin_rentabilidad_libro`, `fin_capital_trabajo_al`) | 0128 |
| CSV de Meta Ads Manager | Margen real por producto, pedido, zona, repartidor y campaña; precio mínimo, simulador, equilibrio por tienda | **Rentabilidad › Productos, Pedidos, Zonas y repartidores, Marketing, Equilibrio** (`fin_ue_*`, `mkt_meta_campanas`, `mkt_meta_reglas`, `fin_config.unidad_economica`) | 0146–0147 |
| — | Integración de los lotes: balance con deuda, anticipos y gastos de importación; paquete del cierre con el balance; cuadre de inventario con la foto del balance; impuestos del calendario fiscal en el calendario de pagos; alertas de Tesorería guardadas por la tarea diaria; comentarios en todas las vistas del EERR; «Hoy» con la posición de caja; tiendas limitadas en todo Finanzas | **Balance general**, **Cierre de mes**, **Tesorería**, **Estado de resultados**, **Panel › Hoy** (`fin_alertas` con los tipos `tesoreria_*`) | 0152 |
| — | Pronóstico por tienda, motores, plan anual integrado con versión aprobada, pronóstico continuo de 18 meses, escenarios por decisión y metas por tienda | **Planificación** (`fin_plan_motores`, `fin_plan_versiones`, `fin_plan_fotos`, `fin_plan_escenarios`, `fin_config.planificacion`, `fin_plan_historia()`, `fin_plan_dias_semana()`) | 0157–0158 |
| — | Precio de transferencia de la importadora a las tiendas propias: política (margen por defecto, por producto o categoría, costo vigente o promedio), diferencia por tienda y mes contra el libro, EERR por tienda con ventas intercompañía y eliminaciones | **Estado de resultados › Precio de transferencia** y vista «Precio de transferencia» (`fin_config.precio_transferencia`, `fin_precio_transferencia_reglas`, `fin_tp_unidades()`) | 0165 |
| — | «Deshacer» y «Comparar con lo cargado» en todos los importadores, nuevas vs actualizadas en la bitácora | **Importar › Historial** y la página «Importar» de cada módulo (`importacion_id` en cartera, bienes, costos, nómina, ventas, deliverys y conciliación) | 0166 |
| — | Plan de compras desde el pronóstico de Planificación (mezcla de productos por tienda en 90 días) y Estado del sistema que revisa todas las migraciones en el catálogo | **Rentabilidad › Plan de compras**, **Panel › Estado del sistema** (`fin_plan_mezcla_productos()`, `fin_estado_migraciones()`) | 0954 |
| — | Presupuesto con tres escenarios | **Presupuesto** (`fin_presupuestos`) | 0126 (Postgres 15+) |

## Reglas de negocio

- **Libro.** Una fila por movimiento: mes de imputación, tienda (`fin_unidades`), tipo (`fin_tipos` → sección del EERR),
  monto, si entra al EERR y al flujo, fechas y forma de pago. El monto es positivo y el signo lo da la sección; **un
  negativo es un reverso** (devolución de un ingreso o de un retiro) y se guarda con su signo para que reste. Lo que no
  trae tienda entra como «SIN ASIGNAR» y lo que no trae tipo queda sin tipo: no entran al EERR hasta clasificarlos.
- **EERR.** Suma los movimientos con EERR = SI por mes, tienda y tipo. Lo cargado a **A DISTRIBUIR** se reparte entre las
  tiendas en proporción a sus envíos del mes (base de reparto); CORPORATIVO no recibe reparto. EBITDA = margen bruto −
  administración − marketing. Valor de empresa = EBITDA anualizado × 4.
- **Base de reparto.** `fin_config.base_reparto` (envíos, ventas o margen bruto del mes, cargados directo a cada tienda)
  decide cómo se reparte A DISTRIBUIR en `fin_eerr_mensual`. El EERR deja ver otra base sin guardarla (`src/lib/finanzas/reparto.ts`).
- **Consolidado.** Un movimiento es intercompañía si lo es él o su tipo; entra al EERR de su entidad pero no al consolidado.
- **Balance.** Caja = saldos del flujo; tarjetas = pasivo; patrimonio = partidas iniciales + aportes + resultado acumulado
  (sin restar dividendos) − retiros. Lo que no cuadra queda en «Diferencia por cuadrar», nunca se fuerza.
- **Flujo.** Lo marcado FLUJO = SI, en el mes de su fecha de pago, separado en operativo, inversión y financiamiento;
  «PAGO TDC» es un traspaso, no una salida.
- **Tesorería.** Los saldos bancarios salen de los extractos de Conciliación (último saldo de cada día) o de la carga a mano
  (manda la manual). Un pago programado pasa por solicitado → aprobado → pagado y lo aprueba otra persona; al pagarlo se puede
  crear su movimiento (origen `tesoreria`, clave `tes-pago:<id>`) y el abono de la cuenta por pagar. Los pedidos de Dropi en
  tránsito entran a la proyección como monto × tasa de entrega × neto acreditado (historia de 90 días que terminó hace 15).
  La deuda supone cada cuota pagada en su fecha.
- **Balance sin contar dos veces.** Préstamos y líneas de crédito salen de `fin_deuda_al(fin de mes)`; un préstamo cargado como
  partida manual con el mismo nombre se descarta. Anticipos a proveedores = `fin_anticipos_proveedores_al`. Gastos de
  importación por pagar = los de compras ya llegadas al corte y sin pagar a esa fecha. Los pagos programados no entran
  (ya son cuentas por pagar, cuotas de deuda o gastos que todavía no se devengaron).
- **Impuestos en el calendario de pagos.** Las obligaciones del calendario fiscal sin presentar con vencimiento en las 4
  semanas (o vencidas en el último mes) van en su fecha; monto estimado = la última presentación con monto o, en las
  mensuales con tipo del libro conocido (ITBMS, retenciones), el pago mensual del libro. Esos tipos ya no se repiten desde
  la proyección.
- **Tiendas limitadas.** Quien ve solo algunas tiendas no ve Balance general, Tesorería, Cierre de mes, Salud de datos ni
  Inventario, Reorden, Compras y costos y Capital de trabajo de Rentabilidad (son de toda la empresa); en Rentabilidad
  «Todas» son las suyas y el desglose del EERR exige una de sus tiendas.
- **Utilidades.** Utilidad de cada tienda antes de retiros × porcentaje de cada socio; los retiros se restan al socio.
- **Asientos de ajuste del cierre.** Viven en `fin_ajustes_cierre` y escriben sus líneas en `fin_movimientos` con
  `origen = 'ajuste_cierre'` (EERR = SI, flujo = NO): entran al EERR del mes por las vistas de siempre, el bloqueo del
  cierre los protege y el Libro de movimientos no los muestra. Provisiones de la planilla formal (bruto de
  `nom_costo_mensual`): XIII 1/12, vacaciones 1/11, prima de antigüedad 1/52; el pago posterior va al libro con EERR = NO.
  Un prepago se reparte en cuotas iguales y, si su pago ya está en el EERR, el mes del pago lleva un ajuste negativo.
- **Control del cierre.** Fecha objetivo = día hábil N del mes siguiente (feriados de Panamá). Quien envía a revisión no
  aprueba (disparador `fin_cierre_aprobacion`, código FC002). Una línea del EERR consolidado que varía más que el umbral
  (% y monto a la vez) contra el mes anterior exige explicación para cerrar. Las alertas de tareas atrasadas y del
  calendario fiscal las generan las tareas diarias `cierre-mes` y `alertas` (sin cron nuevo).
- **Lo corregido a mano manda.** Reimportar un Excel nunca pisa una fila editada en el portal (`editado_a_mano`), y cada
  fila tiene su huella (`origen_clave`), así que importar dos veces no duplica.

- **Unidad económica.** Margen real de una orden = ventas entregadas − mercancía − envío (el real; sin él y enviada, el
  supuesto por pedido) − devolución (vuelta = envío × factor + % del costo perdido) − comisión de cobro (% por método de pago)
  − marketing asignado (el mayor entre el libro y las campañas de Meta de la tienda y el mes; lo asignado a un producto va a
  ese producto y el resto por el valor de cada orden). Las sumas las hace Postgres (`fin_ue_lineas`, `fin_ue_agrupado`); los
  supuestos viven en `fin_config.unidad_economica` y se ven en cada pestaña.
- **Datos y calidad (0138).** Una sugerencia de clasificación tiene confianza: regla 99 %, firma aprendida según cuántas
  veces acertó y «parecido» por vecinos (palabras + monto, `src/lib/finanzas/similitud.ts`). Duplicado posible = mismo monto
  al centavo, ±3 días y descripción o proveedor parecido (desde $5). Atípico = más de 3× la mediana de su tipo en los 6 meses
  anteriores y z robusto > 3,5. Anular un movimiento lo saca del EERR y del flujo (`anulado_*`, se puede restaurar). El
  proveedor canónico se resuelve al leer (RUC o alias como palabras completas de la descripción): no se escribe en el libro,
  así no choca con los meses cerrados. «Deshacer» una importación del libro borra lo que esa carga creó (`importacion_id`),
  nunca lo corregido a mano ni lo de meses cerrados.
- **Precio de transferencia (0165).** La importadora (por defecto la tienda ECOMFIVE; se elige en la política) vende a las
  tiendas propias lo que entregaron a costo puesto en bodega (`fin_costos_lotes.costo_total` del último lote o el promedio
  ponderado) × (1 + margen): margen del producto, si no el de su categoría (línea del lote), si no el de la política. Lo
  entregado sale de `fin_tp_unidades()` (las líneas y el costo de `fin_ue_lineas`). Es una **vista, no asientos**: el libro no se
  toca; la política recalcula toda la historia y no choca con los meses cerrados. Por tienda y mes: esperado E y registrado R (la
  mercancía del libro: tipos de mercancía de costo de ventas, los de `fin_rentabilidad_libro` por defecto). La tienda suma + E
  «Mercancía a precio de transferencia» y − R «Mercancía del libro reclasificada a la importadora»; la importadora + E «Ventas
  intercompañía a tiendas» y + R de esa mercancía; la columna Eliminaciones − E de venta y − E de costo. Cada línea suma cero
  entre columnas: el total es el consolidado sin intercompañía de siempre (`precio-transferencia.test.ts` lo verifica).
  Diferencia = E − R = costo no cargado (costo − R) + margen de la importadora (E − costo). Las unidades sin costo quedan fuera
  y se avisan. Solo en dólares, consolidado y para quien ve toda la empresa. Si se decide llevarlo al libro, son estas mismas
  líneas como asientos de ajuste del cierre.
- **Importaciones (0166).** Cada importador abre su fila de bitácora antes de escribir y la cierra al terminar (o al fallar a
  mitad); al cerrarla marca con `importacion_id` las filas con huella creadas desde que se abrió (el libro las marca al
  insertar) y con eso separa nuevas de actualizadas. «Deshacer» (`TABLAS_IMPORTADAS`, `src/lib/importar/deshacer.ts`) borra
  solo lo creado, nunca lo corregido a mano, lo de un mes cerrado, las entregas de una semana cerrada con el repartidor, las
  líneas de banco no pendientes, los cobros emparejados ni los documentos con abonos del portal. «Comparar con lo cargado»
  (`src/lib/importar/comparar.ts`) lee lo guardado con el mismo alcance que borra cada carga (archivo u hojas) y lo compara con
  `compararLibro`; ventas y conciliación (que no borran) se comparan por huella. Dos cargas simultáneas del mismo módulo
  pueden quedarse con las filas nuevas de la otra.
- **Tiendas permitidas en las acciones.** `src/lib/finanzas/acceso-tienda.ts`: toda acción financiera que recibe el id de un
  registro con tienda (movimiento del libro, comprobante, regla, orden de ventas, documento de cartera, bien de uso, regla de
  Meta) lee su tienda de la base y la rechaza si no es de las permitidas; también la tienda nueva que se le pone. Por
  clasificar trae solo los movimientos sin tipo de las tiendas de la persona y Reglas solo las que llevan a ellas; aplicar
  reglas a todo el libro y actualizar la base de reparto son de toda la empresa.
- **Leer facturas.** `ANTHROPIC_API_KEY` (y opcional `ANTHROPIC_MODEL`, por defecto `claude-sonnet-4-5`) en el servidor. Solo
  se manda el archivo de la factura; la respuesta se valida (fecha, montos, RUC/DV) y siempre se revisa antes de guardar.

- **Planificación (0157–0158).** Pronóstico mensual por tienda (`src/lib/finanzas/pronostico.ts`): Holt-Winters aditivo con
  24 meses o más, Holt con tendencia amortiguada (φ 0,9) de 6 a 23, recta de 4 a 5 y promedio con menos; constantes por rejilla
  con el menor error a un paso; efecto calendario (días del mes y peso del día de la semana si el mayor pasa al menor en 10 %);
  intervalo ±1,28 desvíos × √h; backtest a un mes de los últimos 3 (MAPE). Motores (`planificacion.ts`) de los últimos 3 meses
  hasta el último cierre: pedidos y su valor de `ven_ordenes` (no canceladas), lo entregado y los costos de `fin_ue_lineas`,
  fijos = administración del EERR de la tienda; crecimiento = el del pronóstico de pedidos (±5 %/mes). El plan integrado parte
  del balance del último cierre (`cargarBalance`): CxC, inventario y CxP por días de rotación, activo fijo + capex −
  depreciación, deuda de Tesorería (`fin_deuda_al` de cada fin de mes) + deuda de cobertura bajo la caja mínima, patrimonio +
  utilidad − retiros, impuesto sobre la utilidad acumulada del año; la diferencia de apertura se arrastra. Aprobar una versión
  crea un presupuesto aprobado por tienda (escenario base) en `fin_presupuestos`. Al cerrar un mes se guarda la foto del
  pronóstico de 18 meses (`fin_plan_fotos`). Plan anual, 18 meses y escenarios solo para quien ve toda la empresa; Pronóstico,
  Motores y Metas con las tiendas permitidas.

## Cómo se carga

1. Juntar las migraciones con `sh scripts/finanzas/armar-migraciones.sh` y pegar el archivo en el editor SQL de Supabase (necesita Postgres 15 o más; se puede correr dos veces).
2. Cargar los socios y porcentajes: `datos-privados/semilla-socios.sql` (privado) o a mano en Participaciones.
3. Cargar cada Excel desde la página «Importar Excel» de su módulo, o por línea de comandos (sin `--aplicar` solo informa):

```
npx tsx --env-file=.env.local scripts/finanzas/importar-libro.ts [--aplicar]         # libro y base de reparto
npx tsx --env-file=.env.local scripts/finanzas/importar-costos.ts [--aplicar]        # costos de mercancía
npx tsx --env-file=.env.local scripts/finanzas/importar-cartera.ts [--aplicar]       # cuentas por cobrar y por pagar
npx tsx --env-file=.env.local scripts/finanzas/importar-bienes-uso.ts [--aplicar]    # bienes de uso
npx tsx --env-file=.env.local scripts/finanzas/importar-nomina.ts [--aplicar]        # nómina formal y externa
npx tsx --env-file=.env.local scripts/finanzas/importar-ventas.ts [--aplicar]        # ventas por tienda
npx tsx --env-file=.env.local scripts/finanzas/importar-deliverys.ts [--aplicar]     # deliverys
npx tsx --env-file=.env.local scripts/finanzas/importar-conciliacion.ts [--libro=…] [--aplicar]  # conciliación
```

Regla de corte: cada Excel corre un cierre de mes en paralelo con el portal; si cuadra, se deja de usar ese Excel.

## Paquete bancario y estado del sistema (Fase 2)

- **Paquete bancario** (`/panel-financiero/paquete-bancario`, migración 0940, `fin_paquetes_bancarios`). Arma, a una fecha de
  corte y para el consolidado o una entidad, lo que pide un comité de crédito: carta, indicadores de 12 meses, EERR (12 meses y por
  año), balance al corte y 3/6/12 meses antes, flujo, cartera al corte por antigüedad, deuda (`fin_prestamos`, `fin_lineas_credito`;
  los giros de financiamiento privado no tienen tabla todavía: entran si se cargan como préstamo de clase «Financiamiento»),
  proyección de 13 semanas, concentración por tienda, notas y Limitaciones. Lógica pura en `src/lib/finanzas/paquete-bancario.ts`
  (indicadores, divisiones por cero, cartera al corte, limitaciones). Desde la 0159 los giros se cargan en Tesorería › Deuda como
  financiamientos por ciclo y entran a la sección de deuda con su tasa efectiva anual. Lectura en `cargar-paquete-bancario.ts` (una foto serializable que
  se imprime, se baja en Excel con `excel-paquete-bancario.ts` y se guarda como versión). Nombre y RUC: `RECIBO_EMPRESA_NOMBRE` /
  `RECIBO_EMPRESA_RUC` o `fin_config.empresa_nombre` / `empresa_ruc`.
- **Estado del sistema** (`/panel-financiero/estado-sistema`, `src/lib/finanzas/estado-sistema.ts`): tareas, importaciones, Shopify,
  Dropi, respaldos, variables (solo sí/no) y migraciones (existencia de una tabla por migración), con enlaces al manual
  «Operación y contingencia» del Centro de ayuda (`/ayuda/guias/operacion-contingencia`; también como manual borrador).

## Deuda: optimizar, refinanciar, covenants y capital para crecer (CFO en línea, mejoras 18–20 y 22)

- **Financiamiento por ciclo** (`fin_financiamientos_ciclo`, migración 0946): monto vigente, costo por ciclo (fracción), días del
  ciclo, primer giro y si se renueva (al vencer se paga solo el costo) o no (se paga todo). Tasa efectiva anual = (1 + t)^(365/días) − 1
  (`tasaEfectivaAnualCiclo`, `src/lib/finanzas/deuda.ts`). Sus vencimientos entran a la Proyección de caja y al calendario de Pagos
  (`pagosDeuda`, categoría «Cuotas de préstamos») y su saldo, todo corriente, al balance (`fin_deuda_al`) y al paquete bancario.
- **Optimizar deuda** (`/tesoreria/optimizar`, `src/lib/finanzas/optimizar-deuda.ts`): toda la deuda como instrumentos con su tasa
  efectiva anual y sus pagos; caja disponible = caja final mínima de las 13 semanas de la proyección base − caja mínima
  (`cajaDisponibleDeProyeccion`), o la que se escriba. Avalancha por tasa neta = tasa efectiva − penalidad − comisión ÷ saldo; ahorro
  de 12 meses = intereses de 12 meses × prepago ÷ saldo − costo del prepago (se supone cuota recalculada al mismo plazo). Calendario
  de 12 meses antes y después.
- **Refinanciamiento** (`/tesoreria/refinanciamiento`, `fin_ofertas_refinanciamiento`): tabla con gracia (solo intereses y luego
  francés, `tablaConGracia`), el neto de la comisión de apertura paga lo sustituido en orden de tasa, el excedente entra a caja; ahorro
  anual y del primer año, costo efectivo anual (TIR de lo recibido contra las cuotas), efecto en caja mes a mes, caja mínima de 13
  semanas con la oferta y covenants de la oferta y generales proyectados con su deuda.
- **Covenants** (`/tesoreria/covenants`, `fin_covenants`, `src/lib/finanzas/covenants.ts` y `escenarios-deuda.ts`): las fórmulas son
  las del paquete bancario (`indicadoresBancarios`, `posicionCorriente`, `interesesDeFinanzas`) sobre los últimos 6 cierres
  consolidados; proyección de 6 meses con EBITDA de 12 meses constante, deuda según su calendario, intereses ajustados por el
  calendario y patrimonio, activo corriente y pasivo corriente sin deuda según su tendencia. «En riesgo» a menos del 10 % del umbral.
  La tarea `alertas` deja `tesoreria_covenant` en `fin_alertas` (migración 0947): crítica si incumple hoy, aviso si incumpliría en 6
  meses, info si está en riesgo; los de ofertas no alertan.
- **Capital para crecer** (`/tesoreria/crecimiento`, `src/lib/finanzas/capital-crecimiento.ts`): capital de trabajo = ventas diarias ×
  DSO + costo diario × (DIO − DPO), con DSO/DIO/DPO del último cierre (editables) y ventas que crecen compuesto hasta el % elegido en el
  plazo; contra la caja generada (margen EBITDA × ventas − servicio de la deuda), la caja disponible y el cupo libre de las líneas.
- Todo es solo para quien ve toda la empresa (`limitadoATiendas`) y con el módulo `tesoreria` (escritura para cargar giros, ofertas y
  covenants, con auditoría).
## Plan de compras y Capital y riesgo (mejoras 15, 25, 39 y 42)

- **Plan de compras** (`/rentabilidad/plan-compras`, migración 0948: `fin_plan_compras_producto` con lote mínimo, múltiplo y
  exclusión por producto; ajustes en `fin_config.plan_compras`). Extiende el Punto de reorden: mismo plazo por producto
  (`armarReorden`), misma seguridad y cobertura (`fin_config.inventario_reorden`), lo que viene en camino con su fecha estimada
  (`llegadasEnCamino`) y una demanda por mes (`DemandaProyectada`). `armarPlan` simula el stock día a día y arma las órdenes con
  anticipo (al pedir) y saldo (al envío o a la llegada); `calendarioPagos` las suma por mes. «Llevar al presupuesto de compras»
  escribe en `fin_compras_presupuesto` lo comprometido + los pagos del plan (`presupuestoDesdePlan`): la Proyección de caja solo suma
  lo disponible, así que entran exactamente los pagos del plan. Lógica en `src/lib/finanzas/plan-compras.ts`, lectura en
  `cargar-plan-compras.ts`. **Demanda:** `cargarDemandaProyectada` (`src/lib/finanzas/demanda-plan.ts`) toma el pronóstico de pedidos
  de cada tienda (`cargarPronosticoPedidos`, el mismo de Planificación) y lo pasa a unidades con la mezcla de 90 días
  (`fin_plan_mezcla_productos`, 0167: unidades entregadas de cada producto ÷ pedidos no cancelados de la tienda;
  `demandaPorPronostico`). Lo que el pronóstico no cubre (Dropi, tiendas sin pronóstico) y todo sin la 0167 sale del ritmo de 90
  días con la tendencia de 30 (`demandaPorRitmo`). La página dice la fuente (indicador «Fuente de la demanda»).
- **Planificación: otros del libro.** Motor `ajusteLibro` por tienda = promedio de los últimos 3 meses de (EBITDA de la tienda en el
  EERR − EBITDA de sus órdenes, `ebitdaDeOrdenes`). El primer mes proyectado parte así del EBITDA real; el corporativo incluye todo lo
  que no es tienda (también «SIN ASIGNAR»). 18 meses muestra «Salto al pronóstico» y la fila «Otros del libro». Una tienda nueva de un
  escenario arranca sin ajuste.
- **Capital y riesgo** (`/capital-riesgo`, grupo Dirección, módulo `capital-riesgo` para los roles con `libro-movimientos`; solo quien ve
  toda la empresa):
  - **Riesgos** (0161: `fin_riesgos`, `fin_riesgos_historial`, set inicial de 12 riesgos; alerta `riesgo_sube`). Probabilidad × impacto
    (1–5), dueño, mitigación e indicador vivo con 4 umbrales (`DEF_INDICADORES` en `riesgos.ts`); los indicadores los calcula
    `cargarIndicadoresRiesgo` (`cargar-riesgos.ts`) con el comité, la unidad económica, compras, proyección, EERR por partes, deuda,
    tipos de cambio, inventario y calendario fiscal. `evaluarYGuardarRiesgos` corre en la tarea diaria «alertas» y con «Evaluar ahora»:
    historial de cambios de nivel y alerta mientras el último cambio de un riesgo sea una subida.
  - **Proyectos** (0162: `fin_proyectos`). VAN, TIR (sin cambio de signo → sin TIR; varias TIR → se informan todas y manda el VAN),
    payback simple y descontado, índice de rentabilidad, sensibilidad ±10/20 % en ingresos y costos, estados borrador → aprobado /
    rechazado con quién y cuándo, y real contra prometido (`evaluacion-proyectos.ts`). Tasa: la del proyecto, el WACC de
    `fin_config.capital_riesgo`, el costo financiero mezclado del comité o 15 %.
  - **Asignación de capital** (`asignacion-capital.ts`): curva de pedidos con rendimientos decrecientes anclada en lo de hoy
    (elasticidad 0,5), retorno del próximo dólar = contribución por pedido × pedidos marginales − 1, reparto codicioso con piso por tienda,
    techo de pauta (22 % o el de la tienda) y sin dar dólares de retorno negativo. Supuestos en `fin_config.capital_riesgo.asignacion`.

## Integraciones (variables de entorno de servidor)

Todas opcionales; sin ellas la función se ve apagada y nada falla. Ver `.env.example`.

- **Correo** (`RESEND_API_KEY`, `RESEND_FROM`; destinatarios en Estado de resultados › Ajustes, o `NOTIFICACIONES_EMAIL` si la lista
  está vacía; `PORTAL_URL` para el enlace). Tarea «informe-mensual», el día 5 a las 7:00 de Panamá; una sola vez por mes desde el cron.
- **WhatsApp** (`WHATSAPP_API_URL`, `WHATSAPP_API_TOKEN`, `WHATSAPP_INSTANCIA`; API compatible con Evolution API:
  `POST {URL}/message/sendText/{instancia}` con `{number, text}` y cabecera `apikey`). Sin ellas, «Abrir en WhatsApp» (wa.me).
- **Anthropic** (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, por defecto `claude-sonnet-4-5`): solo cifras agregadas del informe.
- **Shopify** (`SHOPIFY_TIENDAS`, JSON con tienda, dominio y token Admin API por tienda). La tarea lee desde el último `updated_at`
  leído (la primera vez, 60 días) y guarda con la misma huella del importador de Excel (`ventas|<unidad>|<número>`): una orden que ya vino
  del Excel solo actualiza su estado de pago y, si se canceló o reembolsó entera, su estado de entrega.
- **Dropi**: no necesita claves; usa lo que ya ingresan los scripts `scripts/dropi-ingerir-*`.
- **QuickBooks Online** (migración 0950; `QBO_CLIENT_ID`, `QBO_CLIENT_SECRET`, `QBO_REDIRECT_URI`, `QBO_ENTORNO`, `QBO_TOKEN_KEY`).
  Criterio de la Fase 2: en cada mes cerrado las ventas netas del portal y las de QuickBooks difieren menos de 1 %.
  **Crear la app:** en developer.intuit.com › Dashboard › Create an app › QuickBooks Online and Payments, alcance
  `com.intuit.quickbooks.accounting` (solo eso). En Keys & credentials (primero Development, luego Production) copiar Client ID y
  Client Secret y agregar el Redirect URI `https://<dominio>/api/quickbooks/retorno` (el mismo valor en `QBO_REDIRECT_URI`). Para
  producción Intuit pide completar el perfil de la app (URLs de privacidad y términos, y el cuestionario). `QBO_TOKEN_KEY`:
  `openssl rand -hex 32`. **Conectar:** quien puede modificar Usuarios y roles pulsa «Conectar QuickBooks» en Cierre de mes ›
  QuickBooks (`/api/quickbooks/conectar` → Intuit → `/api/quickbooks/retorno`): el `state` va firmado (HMAC con la clave, 10
  minutos, atado a la persona y a un número de una vez en una cookie httpOnly); los tokens se guardan cifrados (AES-256-GCM) en
  `qbo_conexion` y el access token se renueva solo con el refresh token (`src/lib/quickbooks/cliente.ts`). Tarea diaria
  «quickbooks» (4:50 de Panamá): plan de cuentas (`qbo_cuentas`), clases y ubicaciones (`qbo_clases`), ProfitAndLoss por mes de
  los últimos 13 meses y por clase de los últimos 3 (`qbo_pyg_mensual`) y ventas por mes de SalesReceipt, Invoice, RefundReceipt y
  CreditMemo (`qbo_ventas_mensual`, con impuestos). Nunca escribe en QuickBooks. La comparación (`src/lib/quickbooks/conciliacion.ts`)
  usa el EERR consolidado sin intercompañía de todas las entidades: si QuickBooks lleva una sola compañía, conviene que el portal
  tenga solo esa entidad o que las cuentas de la otra queden en «No comparar». El mapeo de cuentas (`qbo_mapeo`) se sugiere por el
  grupo del reporte y el nombre y se confirma en la página. El checklist del cierre suma «Ventas conciliadas con QuickBooks (< 1 %)»
  solo con QuickBooks conectado o con algo leído.
- **Monday.com** (migración 0951; `MONDAY_API_TOKEN`). **Token:** en Monday, avatar › Developers › My access tokens (token
  personal de una cuenta que vea el tablero de despachos; las acciones del token son las de esa persona, conviene una cuenta de
  servicio de solo lectura). **Tablero:** en Deliverys › Monday, quien puede modificar Usuarios y roles escribe el id del tablero
  (el número de su dirección), «Leer columnas» y elige la columna de cada dato (pedido, tienda, courier, estado, causa de rechazo,
  fecha de despacho, fecha de entrega, remisión; sugeridas por el título). Tarea «monday» a las 5:30 (con 5:40 y 5:50 para seguir lo
  que falte): lee el tablero completo con `items_page` y el cursor de `next_items_page` (500 por página, API `2024-10`) y guarda
  en `mon_despachos` solo los ítems actualizados desde la última lectura completa (con un día de margen), enlazados a
  `ven_ordenes` por número de pedido y tienda. Un ítem borrado en Monday queda en el portal. Los estados se agrupan por palabras
  (entregado, rechazado, cancelado, en ruta) y cada etiqueta se puede corregir; las causas de rechazo se codifican con el catálogo
  `mon_causas` (palabras clave) y `mon_causa_textos` (asignación a mano). El Comité toma de Monday la tasa de entrega y los pedidos
  sin estado en los meses con despachos.
- **Respaldos**: bucket privado `respaldos-finanzas`, una carpeta por fecha con un `.json.gz` por tabla; se conservan las últimas
  `fin_config.respaldos_conservar` (8).

## Pendiente

- Cargar en Deliverys el efectivo que cobra cada repartidor (desde las órdenes reales) para que sus depósitos encuentren el cierre semanal.
- Depreciación en el EERR y nómina al libro: construidas (migración 0917) y **apagadas** hasta que se decida; se encienden en Estado de resultados › Ajustes.
