-- Dropi al sistema, cada mañana (tarea programada «dropi-diario», 22 oct 2026): cada carga vuelve a guardar en bruto los pedidos
-- de los últimos 30 días en `staging_ordenes_dropi` para que los estados queden al día. `crm_sincronizar_ordenes()` ya usa solo
-- la copia más reciente de cada pedido; esta función borra las anteriores para que la tabla no crezca ~15.000 filas por día.
-- Devuelve cuántas borró. La corre `scripts/dropi-diario.ts cargar` después de cargar.

create index if not exists staging_ordenes_dropi_pedido_idx
  on staging_ordenes_dropi (cuenta_extraccion_id, (payload ->> 'id'), creado_en desc);

create or replace function dropi_staging_ordenes_limpiar() returns integer
language plpgsql as $$
declare
  borradas integer;
begin
  delete from staging_ordenes_dropi s
  using (
    select id, row_number() over (partition by cuenta_extraccion_id, payload ->> 'id' order by creado_en desc, id) as n
    from staging_ordenes_dropi
  ) x
  where s.id = x.id and x.n > 1;
  get diagnostics borradas = row_count;
  return borradas;
end;
$$;

-- Solo el servidor (service role) la corre.
revoke execute on function dropi_staging_ordenes_limpiar() from public, anon, authenticated;
grant execute on function dropi_staging_ordenes_limpiar() to service_role;
