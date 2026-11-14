-- Monday › «CAMBIOS Y REEMBOLSOS PANAMA» (14 nov 2026, pedido de Hernán: «todo lo que son etiquetas, devoluciones, cambios, reembolsos debe salir
-- actualizado en el sistema para que todo esté alineado»). Un solo tablero para todas las tiendas: cada ítem es un caso de postventa («KENKU: Realizar
-- cambio #24391») con su detalle en el primer comentario (RETIRAR, ENVIAR, REEMBOLSAR, MOTIVO). La tarea `monday` lo lee después de los tableros de
-- repartidores (src/lib/monday/postventa.ts) y guarda cada caso aquí, enlazado a su pedido por tienda y número. Se muestra en la ficha del pedido, en
-- Pedidos (filtro «Cambios y reembolsos») y, si no encuentra el pedido, en Logística › «A verificar».
-- Del comentario solo se guardan los datos del caso: nunca el nombre, la cuenta, el banco, el correo, la dirección ni el teléfono del cliente.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0290_rollback.sql

alter table mon_tableros_extra add column if not exists clase text not null default 'despachos';
alter table mon_tableros_extra drop constraint if exists mon_tableros_extra_clase_check;
alter table mon_tableros_extra add constraint mon_tableros_extra_clase_check check (clase in ('despachos', 'postventa'));

create table if not exists mon_postventa (
  item_id text primary key check (item_id ~ '^[0-9]{1,20}$'),
  tablero_id text not null,
  nombre text not null check (length(nombre) <= 200),
  tienda_texto text check (tienda_texto is null or length(tienda_texto) <= 40),
  numero_pedido text check (numero_pedido is null or length(numero_pedido) <= 40),
  unidad_id uuid references fin_unidades(id) on delete set null,
  orden_id uuid references ven_ordenes(id) on delete set null,
  -- cambio, reembolso, retiro, complemento, faltante, garantia, envio.
  tipos text[] not null default '{}',
  estado text check (estado is null or length(estado) <= 80),
  grupo text check (grupo is null or length(grupo) <= 120),
  retirar text check (retirar is null or length(retirar) <= 300),
  enviar text check (enviar is null or length(enviar) <= 300),
  reembolso numeric(12, 2) check (reembolso is null or reembolso >= 0),
  reembolso_texto text check (reembolso_texto is null or length(reembolso_texto) <= 300),
  penalizacion text check (penalizacion is null or length(penalizacion) <= 300),
  costo_envio text check (costo_envio is null or length(costo_envio) <= 610),
  motivo text check (motivo is null or length(motivo) <= 300),
  observacion text check (observacion is null or length(observacion) <= 300),
  ultima_nota text check (ultima_nota is null or length(ultima_nota) <= 300),
  notas integer not null default 0,
  creado_monday timestamptz,
  actualizado_monday timestamptz,
  leido_en timestamptz not null default now()
);
create index if not exists mon_postventa_orden on mon_postventa (orden_id);
create index if not exists mon_postventa_unidad on mon_postventa (unidad_id, creado_monday);
alter table mon_postventa enable row level security;
comment on table mon_postventa is 'Casos de cambios, reembolsos, retiros y complementos leídos del tablero «CAMBIOS Y REEMBOLSOS» de Monday, enlazados a ven_ordenes.';

insert into mon_tableros_extra (tablero_id, nombre, clase) values ('2693664405', 'Cambios y reembolsos', 'postventa')
on conflict (tablero_id) do update set clase = 'postventa';

notify pgrst, 'reload schema';
