-- Movimientos recurrentes del libro (mejora 9, 16 nov 2026): plantillas de un gasto o ingreso que se repite cada mes
-- (alquiler, software, planilla fija, una cuota). La tarea diaria del cierre crea el movimiento de cada mes en
-- `fin_movimientos` cuando llega su día, con origen 'recurrente' y la clave `recurrente:<plantilla>:<AAAA-MM>`, así que
-- nunca se repite. `ultimo_periodo` es el último mes ya generado: si alguien borra el movimiento de un mes, no vuelve.
-- Un mes cerrado no se toca (lo frena `fin_bloqueo_cierre`); se salta. RLS sin políticas: solo el servidor.

create table if not exists fin_recurrentes (
  id uuid primary key default gen_random_uuid(),
  unidad_id uuid not null references fin_unidades(id),
  tipo_id uuid not null references fin_tipos(id),
  descripcion text not null check (char_length(descripcion) between 1 and 500),
  monto numeric(14, 2) not null check (monto > 0),
  -- Día del mes en que se registra (fecha de pago); en un mes más corto, su último día.
  dia smallint not null check (dia between 1 and 31),
  cuenta_id uuid references fin_cuentas(id),
  en_eerr boolean not null default true,
  en_flujo boolean not null default true,
  desde date not null check (extract(day from desde) = 1),
  hasta date check (hasta is null or (extract(day from hasta) = 1 and hasta >= desde)),
  ultimo_periodo date check (ultimo_periodo is null or extract(day from ultimo_periodo) = 1),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);

create index if not exists fin_recurrentes_activo on fin_recurrentes (activo, unidad_id);

alter table fin_recurrentes enable row level security;
