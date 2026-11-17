-- Rol «Tienda cliente» (17 nov 2026, pedido de Hernán: la gente de Nuvo —y luego de Kenku y Oferfy— entra al sistema y solo ve lo de su tienda).
-- Solo las pantallas de Gestión de tienda que usa la tienda: Pedidos (con su chat y notas) y Confirmación para trabajar; Dashboard y Logística para ver;
-- Despacho ciudad y Devoluciones solo para ver (el despacho lo hace el equipo de Ecomfive); Cambios y reembolsos para pedir y seguir sus casos.
-- Nada de Proveeduría, Compras ni Finanzas. La tienda se elige en la ficha de cada persona › «Tiendas» › «Solo estas» (PR #692): sin eso vería todas.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0311_rollback.sql
insert into roles (nombre, descripcion)
values ('Tienda cliente', 'Gente de una tienda cliente (Nuvo, Kenku, Oferfy): pedidos, confirmación, dashboard, logística, despacho, devoluciones y cambios de su tienda. Marcar su tienda en la ficha › Tiendas › «Solo estas».')
on conflict (nombre) do nothing;

insert into permisos_rol (rol_id, modulo, solo_lectura)
select r.id, p.modulo, p.solo_lectura
from roles r
cross join (values
  ('tienda-pedidos', false),
  ('tienda-confirmacion', false),
  ('tienda-dashboard', true),
  ('tienda-logistica', true),
  ('despacho-ciudad', true),
  ('despacho-devoluciones', true),
  ('despacho-cambios', false)
) as p(modulo, solo_lectura)
where r.nombre = 'Tienda cliente'
on conflict (rol_id, modulo) do nothing;

notify pgrst, 'reload schema';
