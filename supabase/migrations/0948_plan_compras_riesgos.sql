-- Portal AF4 360° — Plan de compras a China (mejora 15) y matriz de riesgos financieros viva (mejora 25).
--
-- 1. `fin_plan_compras_producto`: lote mínimo, múltiplo (cajas) y exclusión por producto para el Plan de compras
--    (Rentabilidad › Plan de compras). Los ajustes generales del plan van en `fin_config` (clave `plan_compras`).
-- 2. `fin_riesgos`: la matriz de riesgos (probabilidad e impacto 1–5, dueño, mitigación, indicador vivo y sus umbrales) y
--    lo último que guardó la evaluación diaria (`nivel_actual`). Se precarga un set inicial razonable para el negocio.
-- 3. `fin_riesgos_historial`: un renglón por cambio de nivel (lo escribe la tarea diaria «alertas» o una edición).
-- 4. Tipo de alerta nuevo `riesgo_sube` en el `check` de `fin_alertas` (misma lista que `TIPOS_ALERTA`), conservando los
--    de las migraciones 0921, 0928, 0939 y 0943. `not valid`: no revisa las filas que ya estaban.
-- 5. Módulo `capital-riesgo` (página «Capital y riesgo») para los roles que ya tienen el Libro de movimientos.
-- Todo con RLS y sin políticas: solo el servidor (clave de servicio) toca los datos. Se puede correr dos veces.

create table if not exists fin_plan_compras_producto (
  sku_maestro_id uuid primary key references skus_maestros(id) on delete cascade,
  lote_minimo integer not null default 0 check (lote_minimo >= 0 and lote_minimo <= 1000000),
  multiplo integer not null default 1 check (multiplo >= 1 and multiplo <= 100000),
  excluir boolean not null default false,
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);
alter table fin_plan_compras_producto enable row level security;

create table if not exists fin_riesgos (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (clave ~ '^[a-z0-9_]{1,60}$'),
  nombre text not null check (length(nombre) between 1 and 120),
  categoria text not null default 'otro' check (categoria in ('concentracion', 'liquidez', 'financiero', 'cambiario', 'comercial', 'operativo', 'inventario', 'intercompania', 'fiscal', 'otro')),
  descripcion text check (descripcion is null or length(descripcion) <= 1000),
  probabilidad smallint not null default 3 check (probabilidad between 1 and 5),
  impacto smallint not null default 3 check (impacto between 1 and 5),
  dueno text check (dueno is null or length(dueno) <= 120),
  mitigacion text check (mitigacion is null or length(mitigacion) <= 2000),
  indicador text check (indicador is null or indicador in ('concentracion_dropi', 'concentracion_courier', 'concentracion_proveedor',
    'liquidez_semanas', 'costo_financiero', 'tipo_cambio_crc', 'pauta_ventas', 'tasa_entrega', 'inventario_lento', 'intercompania',
    'fiscal_vencidas')),
  -- Cuatro umbrales propios (null = los predeterminados del indicador, `DEF_INDICADORES` en src/lib/finanzas/riesgos.ts).
  umbrales numeric[] check (umbrales is null or array_length(umbrales, 1) = 4),
  activo boolean not null default true,
  orden integer not null default 0,
  nivel_actual text check (nivel_actual is null or nivel_actual in ('bajo', 'medio', 'alto', 'critico')),
  probabilidad_actual smallint check (probabilidad_actual is null or probabilidad_actual between 1 and 5),
  valor_indicador numeric,
  evaluado_en timestamptz,
  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
alter table fin_riesgos enable row level security;

create table if not exists fin_riesgos_historial (
  id uuid primary key default gen_random_uuid(),
  riesgo_id uuid not null references fin_riesgos(id) on delete cascade,
  nivel_antes text check (nivel_antes is null or nivel_antes in ('bajo', 'medio', 'alto', 'critico')),
  nivel_despues text not null check (nivel_despues in ('bajo', 'medio', 'alto', 'critico')),
  probabilidad smallint not null check (probabilidad between 1 and 5),
  impacto smallint not null check (impacto between 1 and 5),
  valor_indicador numeric,
  origen text not null default 'auto' check (origen in ('auto', 'manual')),
  usuario_id uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
alter table fin_riesgos_historial enable row level security;
create index if not exists fin_riesgos_historial_riesgo on fin_riesgos_historial (riesgo_id, creado_en desc);

-- Set inicial (sin datos privados; los dueños son áreas). Se puede editar todo desde la página.
insert into fin_riesgos (clave, nombre, categoria, descripcion, probabilidad, impacto, dueno, mitigacion, indicador, orden) values
  ('concentracion_dropi', 'Concentración en Dropi', 'concentracion', 'Una parte grande de las ventas depende de una sola plataforma: un cambio de reglas, de comisiones o una suspensión golpea de frente.', 3, 5, 'Dirección comercial', 'Hacer crecer las tiendas propias; tener el catálogo listo en otra plataforma; retirar la wallet seguido.', 'concentracion_dropi', 10),
  ('concentracion_courier', 'Dependencia de un courier o repartidor', 'concentracion', 'Si el repartidor o courier principal falla o sube su tarifa, se frenan las entregas y el cobro contra entrega.', 3, 4, 'Operaciones', 'Mantener al menos dos alternativas activas con volumen; acordar tarifas por escrito.', 'concentracion_courier', 20),
  ('concentracion_proveedor', 'Dependencia de un proveedor', 'concentracion', 'Las compras se concentran en pocos proveedores en China: un atraso o un problema de calidad deja sin stock.', 3, 4, 'Compras', 'Homologar un segundo proveedor por producto clave; pedir muestras de control de calidad.', 'concentracion_proveedor', 30),
  ('liquidez', 'Liquidez', 'liquidez', 'Caja insuficiente para cubrir compras, nómina e impuestos de las próximas semanas.', 2, 5, 'Gerencia financiera', 'Caja mínima en la proyección; escalonar compras; línea de crédito disponible.', 'liquidez_semanas', 40),
  ('costo_financiero', 'Costo financiero alto', 'financiero', 'Intereses que se comen el margen o deuda cara.', 2, 3, 'Gerencia financiera', 'Refinanciar la deuda más cara; prepagar con excedentes; negociar plazos con proveedores.', 'costo_financiero', 50),
  ('tipo_cambio_crc', 'Tipo de cambio del colón', 'cambiario', 'Las ventas de Costa Rica son en colones y las compras en dólares: un movimiento fuerte del colón cambia el margen.', 2, 3, 'Gerencia financiera', 'Convertir a dólares seguido; ajustar precios en colones cuando el tipo de cambio se mueve.', 'tipo_cambio_crc', 60),
  ('dependencia_pauta', 'Dependencia de la pauta', 'comercial', 'Ventas que solo se sostienen con pauta creciente; una subida del costo por compra o un bloqueo de la cuenta publicitaria.', 3, 4, 'Marketing', 'Respetar el techo de pauta; cuentas publicitarias de respaldo; recompra y canales orgánicos.', 'pauta_ventas', 70),
  ('tasa_entrega', 'Tasa de entrega baja', 'operativo', 'Pedidos contra entrega devueltos: se paga envío de ida y vuelta y se pierde producto.', 3, 4, 'Operaciones', 'Confirmar pedidos antes de enviar; bloquear clientes con devoluciones; incentivar el prepago.', 'tasa_entrega', 80),
  ('inventario_lento', 'Inventario lento u obsoleto', 'inventario', 'Capital atrapado en productos que no rotan y pueden terminar liquidados bajo costo.', 3, 3, 'Compras', 'Plan de compras atado a la demanda; liquidar lo que pasa de 90 días sin salida.', 'inventario_lento', 90),
  ('intercompania', 'Saldos intercompañía', 'intercompania', 'Movimientos entre entidades sin documentar ni conciliar: riesgo fiscal y de lectura de los números.', 2, 3, 'Contabilidad', 'Documentar y conciliar cada mes; contrato de servicios entre entidades.', 'intercompania', 100),
  ('fiscal', 'Incumplimiento fiscal', 'fiscal', 'Obligaciones que vencen sin presentar: multas, recargos y bloqueos.', 2, 4, 'Contabilidad', 'Calendario fiscal con avisos; responsable por obligación; cierre de mes a tiempo.', 'fiscal_vencidas', 110),
  ('efectivo_repartidores', 'Efectivo en manos de repartidores', 'operativo', 'El cobro contra entrega queda en efectivo con los repartidores hasta que lo depositan.', 3, 3, 'Tesorería', 'Depósitos semanales conciliados; tope de efectivo por repartidor; alertas de efectivo viejo.', null, 120)
on conflict (clave) do nothing;

-- Alerta nueva `riesgo_sube` (src/lib/tareas/alertas.ts → TIPOS_ALERTA).
do $$
declare
  r record;
begin
  for r in
    select c.conname from pg_constraint c
    where c.conrelid = 'fin_alertas'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ilike '%tipo%'
  loop
    execute format('alter table fin_alertas drop constraint %I', r.conname);
  end loop;
  alter table fin_alertas add constraint fin_alertas_tipo_check check (tipo in (
    'caja_minima', 'cxp_vence', 'cxc_vencido', 'cierre_pendiente', 'costo_ventas', 'inventario_sin_costo',
    'cierre_tarea_atrasada', 'fiscal_vence',
    'tesoreria_dropi', 'tesoreria_efectivo', 'tesoreria_depositos', 'tesoreria_linea_vencida', 'tesoreria_linea_renovar',
    'tesoreria_linea_uso', 'tesoreria_saldos', 'tesoreria_pagos',
    'pauta_techo',
    'tesoreria_covenant',
    'riesgo_sube'
  )) not valid;
end $$;

-- Permiso: lo recibe quien ya tiene el Libro de movimientos, con su mismo solo lectura.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'capital-riesgo', solo_lectura
from permisos_rol
where modulo = 'libro-movimientos'
on conflict (rol_id, modulo) do nothing;
