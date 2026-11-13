-- Monday › el tablero «GESTION DEVOLUCION KENKU» (13 nov 2026, pedido de Hernán). Tiene las mismas columnas que los tableros de los repartidores y dos más
-- que llenan los asesores: «ESTADO ASESORES» (PENDIENTE / DESINTEGRADO) y «OBSERVACIONES ASESORES» (el motivo: «no quiere el pedido», «3er msj sin respuesta»).
-- Respuestas de Hernán: un pedido FALLIDO o POSPUESTO **todavía se puede volver a entregar** (no es una devolución); DESINTEGRADO es que el pedido se cerró y
-- el producto vuelve al inventario (eso sí es devuelto). Por eso:
--   * `mon_despachos` guarda lo de los asesores;
--   * el tablero de devoluciones de Kenku se lee con los de los repartidores (`mon_tableros_extra`; por ahora solo Kenku);
--   * un FALLIDO deja de contar como rechazado (vuelve a «en ruta») y los 3 pedidos de Kenku que la lectura del 12-13 nov había pasado a devueltos solo por
--     un FALLIDO vuelven a despachados (con su cobro contra entrega de vuelta), dejando el evento en su historial.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0287_rollback.sql

alter table mon_despachos add column if not exists estado_asesores text check (estado_asesores is null or length(estado_asesores) <= 120);
alter table mon_despachos add column if not exists observaciones_asesores text check (observaciones_asesores is null or length(observaciones_asesores) <= 500);

insert into mon_tableros_extra (tablero_id, nombre) values ('18429046458', 'Devoluciones Kenku')
on conflict (tablero_id) do nothing;

-- FALLIDO ya no es rechazado (sin DESINTEGRADO de los asesores).
update mon_despachos set estado_grupo = 'en_ruta'
where estado_grupo = 'rechazado' and upper(coalesce(estado, '')) like '%FALLID%' and upper(coalesce(estado_asesores, '')) not like '%DESINTEGRAD%';

-- Los pedidos que pasaron a devueltos solo por un FALLIDO de Monday vuelven a despachados.
with revertidas as (
  update ven_ordenes
  set fase = 'despachada',
      estado_entrega = 'en_transito',
      motivo_cancelacion = null,
      fecha_devolucion = null,
      cod_esperado = case when cod_esperado is null and metodo_pago = 'efectivo' then total else cod_esperado end
  where fase = 'devuelta' and motivo_cancelacion like 'Monday: FALLIDO%'
  returning id
)
insert into ven_orden_eventos (orden_id, tipo, fase_antes, fase_despues, detalle, usuario)
select id, 'fase', 'devuelta', 'despachada', 'Vuelve a despachada: un FALLIDO de Monday todavía se puede volver a entregar (Hernán, 13 nov 2026)', 'Sistema'
from revertidas;

notify pgrst, 'reload schema';
