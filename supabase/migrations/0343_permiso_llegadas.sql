-- «Llegadas a puerto» como entrada del menú de Operaciones › Fulfillment (20 nov 2026, pedido de Logística: «solo me aparecen en avisos y las perdería de vista»).
-- La lista ya existía (/llegadas, la que abre «Ver lista» del aviso de Llegada a Puerto); ahora tiene su permiso `llegadas` para salir en el menú.
-- Quién lo recibe, para que nadie pierda lo que ya veía:
--   * los roles que tienen Compras (Admin, CEO, Compras, Líder comercial y los de consulta), con el mismo «solo lectura»;
--   * las personas con Compras como permiso propio, con el mismo nivel (también «ninguno», para no abrirles por el rol lo que se les quitó);
--   * quienes reciben el aviso de Llegada a Puerto (Dinora), en lectura.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0343_rollback.sql

insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, 'llegadas', solo_lectura from permisos_rol where modulo = 'compras'
on conflict (rol_id, modulo) do nothing;

insert into permisos_persona (perfil_id, modulo, nivel)
select perfil_id, 'llegadas', nivel from permisos_persona where modulo = 'compras'
on conflict (perfil_id, modulo) do nothing;

insert into permisos_persona (perfil_id, modulo, nivel)
select d.perfil_id, 'llegadas', 'lectura' from compras_avisos_destinatarios d where d.evento = 'llegada_puerto'
on conflict (perfil_id, modulo) do update set nivel = 'lectura' where permisos_persona.nivel = 'ninguno';
