-- Confirmación con IA › pago por adelantado (17 nov 2026, aclarado por el equipo): hay direcciones de difícil acceso o fronterizas (Bocas del Toro, Puerto Armuelles…) que se pagan por adelantado. El bot de iComfly
-- las confirma igual («Confirmada»), pero la etiqueta verdadera (INTERIOR/SERVIENTREGA) solo se pone cuando el cliente paga y manda el comprobante; los asesores le avisan y esperan.
--   * `confirmacion_ia_adelanto_zonas`: las palabras (un lugar o varios juntos) que, si salen en la dirección, la vuelven de pago por adelantado. Vacía de entrada: el equipo pasa la lista.
--   * `confirmacion_ia_analisis.estado` admite «adelantado» («En espera de pago»): no se propone etiqueta y no se gastan las IA.
--   * `tiendas.pago_adelantado_instrucciones`: cómo paga el cliente en esa tienda (Yappy, cuenta…), que va en el mensaje que el asesor le manda; cada tienda tiene sus métodos.
--   * `mensaje_estado` ya admite «manual» (0308). Los avisos «pago_adelantado» a personas usan `compras_avisos_destinatarios` (sin nadie de entrada: por ahora no se le avisa a nadie) y el tipo de aviso «adelanto».
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0312_rollback.sql

create table if not exists confirmacion_ia_adelanto_zonas (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises (id) on delete cascade,
  texto text not null check (char_length(texto) between 2 and 80),
  clave text not null,
  creado_por uuid,
  creado_por_nombre text,
  creado_en timestamptz not null default now(),
  unique (pais_id, clave)
);
alter table confirmacion_ia_adelanto_zonas enable row level security;

do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'confirmacion_ia_analisis'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%estado%listo%'
  loop
    execute format('alter table confirmacion_ia_analisis drop constraint %I', r.conname);
  end loop;
end $$;
alter table confirmacion_ia_analisis add constraint confirmacion_ia_analisis_estado_check check (estado in ('listo', 'falta_dato', 'revisar', 'error', 'adelantado'));

alter table tiendas add column if not exists pago_adelantado_instrucciones text check (pago_adelantado_instrucciones is null or char_length(pago_adelantado_instrucciones) <= 1000);

-- A quién se le avisa de un pedido en espera de pago (nadie de entrada).
alter table compras_avisos_destinatarios drop constraint if exists compras_avisos_destinatarios_evento_check;
alter table compras_avisos_destinatarios add constraint compras_avisos_destinatarios_evento_check check (evento in ('llegada_puerto', 'llegada_bodega', 'pago_adelantado'));

alter table notificaciones_usuario drop constraint if exists notificaciones_usuario_tipo_check;
alter table notificaciones_usuario add constraint notificaciones_usuario_tipo_check
  check (tipo in ('mencion', 'proveedor', 'tarea', 'sin_stock', 'whatsapp', 'remision', 'cierre', 'llegada', 'adelanto'));

notify pgrst, 'reload schema';
