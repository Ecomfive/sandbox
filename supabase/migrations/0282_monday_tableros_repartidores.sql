-- Monday: los tableros de cada repartidor (12 nov 2026, pedido de Hernán: «identificar con Monday cuáles pedidos ya se entregaron en la ciudad»).
-- La lectura de Monday (migración 0951) lee un solo tablero, el consolidado «DELIVERY REPORTES DIARIOS», que llega hasta el 31/10: lo de noviembre (y
-- parte de octubre) está en el tablero de cada repartidor, con las mismas columnas. Aquí van esos tableros: la tarea `monday` los lee después del
-- consolidado y guarda sus ítems en `mon_despachos` como los del consolidado. Sus columnas se reconocen por el título (las del consolidado) y quedan en
-- `columnas`; cada tablero lleva su propio avance. Se puede correr más de una vez.
-- Reversa: supabase/rollbacks/0282_rollback.sql

create table if not exists mon_tableros_extra (
  tablero_id text primary key check (tablero_id ~ '^[0-9]{1,20}$'),
  nombre text not null,
  activo boolean not null default true,
  columnas jsonb,
  cursor_actualizado timestamptz,
  items integer not null default 0,
  ultima_lectura timestamptz,
  ultimo_error text check (ultimo_error is null or length(ultimo_error) <= 1000),
  creado_en timestamptz not null default now()
);
alter table mon_tableros_extra enable row level security;
comment on table mon_tableros_extra is 'Tableros de Monday de cada repartidor que se leen además del consolidado (mon_config): entregas de ciudad de las tiendas.';

insert into mon_tableros_extra (tablero_id, nombre) values
  ('7170811997', 'July Calle'),
  ('7170918438', 'Aníbal Pérez'),
  ('9474433747', 'Andrés Álvarez'),
  ('18415516440', 'Yoselyn Viaña'),
  ('18403580941', 'Deimibel Ciudad'),
  ('18416773511', 'Deimibel Zona 5')
on conflict (tablero_id) do nothing;

notify pgrst, 'reload schema';
