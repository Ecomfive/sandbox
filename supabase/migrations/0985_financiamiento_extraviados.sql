-- 0985 · Pedido de María José (Oceans, 19 nov 2026). Reversa: supabase/rollbacks/0985_rollback.sql.
--
-- 1. Tasa de cada financista (Préstamos del grupo). Con ella, Compras y costos estima el costo de financiamiento de las
--    OC que un préstamo fondeó y todavía no tienen el cargo del financista: monto × tasa del ciclo × días ÷ días del
--    ciclo. `dias_ciclo` vacío = el ciclo es el plazo de cada préstamo (cobra una vez la tasa). Ortoped&Co: 20 % por ciclo.
-- 2. Dos tipos del libro para un paquete extraviado: la mercadería perdida (costo de ventas) y lo que paga el repartidor
--    (otros ingresos). Se registran juntos desde el Libro de movimientos.

alter table fin_grupo_partes add column if not exists tasa_ciclo numeric(6, 4) check (tasa_ciclo is null or (tasa_ciclo >= 0 and tasa_ciclo <= 5));
alter table fin_grupo_partes add column if not exists dias_ciclo integer check (dias_ciclo is null or (dias_ciclo between 1 and 730));

update fin_grupo_partes set tasa_ciclo = 0.20 where lower(btrim(nombre)) = lower('Ortoped&Co SPA') and tasa_ciclo is null;

insert into fin_tipos (nombre, seccion, signo, orden) values
  ('Mercadería extraviada', 'costo_ventas', -1, 122),
  ('Indemnización por paquete extraviado', 'otros', 1, 520)
on conflict (nombre) do nothing;
