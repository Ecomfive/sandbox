-- Perfiles de acceso por área (20 oct 2026).
--
-- Crea 6 roles nuevos y completa 4 de los que ya existen, con los módulos que hay hoy (propuesta «Perfiles de acceso»):
--   nuevos:     Investigación de producto, Contenido y ofertas, Compras, Producto / Catálogo, Talento humano, Consulta.
--   existentes: Administrativo (Finanzas), Atención al cliente, Líder comercial y Operaciones (Bodega).
--   Admin (Dirección) no se toca: ya lo tiene todo.
--
--   * Solo agrega: un permiso que el rol ya tiene queda como está (no cambia su «solo lectura») y nunca se quita ninguno.
--   * No cambia a nadie de rol ni le da acceso a Nómina y gastos: Administrativo solo suma Compras, Producto e Inventario
--     en solo lectura.
--   * Se puede correr más de una vez: lo que ya existe se salta.
--   * Para deshacerlo: supabase/rollbacks/0115_rollback.sql.

begin;

insert into roles (nombre, descripcion) values
  ('Investigación de producto', 'Testing Lab: fuentes, selección, test y filtro de productos, y análisis de la competencia.'),
  ('Contenido y ofertas', 'Creación de ofertas, landings y fichas de producto de Shopify y Dropi.'),
  ('Compras', 'Abastecimiento: compras y filtro de productos.'),
  ('Producto / Catálogo', 'Catálogo de productos y sus fichas de Shopify y Dropi.'),
  ('Talento humano', 'Puestos y organigrama.'),
  ('Consulta', 'Solo lectura de lo no sensible: Hoy, Inventario, Compras, Producto, Pedidos Dropi y Test productos.') 
on conflict (nombre) do nothing;

create temporary table _perm (rol text not null, modulo text not null, solo_lectura boolean not null, primary key (rol, modulo)) on commit drop;
insert into _perm (rol, modulo, solo_lectura) values
  ('Administrativo', 'compras', true),
  ('Administrativo', 'producto', true),
  ('Administrativo', 'inventario', true),
  ('Administrativo', 'dashboard', true),
  ('Administrativo', 'notificaciones', true),
  ('Atención al cliente', 'crm-dropshippers', false),
  ('Atención al cliente', 'sugerencias-clientes', false),
  ('Atención al cliente', 'pedidos-dropi', true),
  ('Atención al cliente', 'alertas', true),
  ('Atención al cliente', 'producto', true),
  ('Atención al cliente', 'dashboard', true),
  ('Atención al cliente', 'notificaciones', true),
  ('Líder comercial', 'crm-dropshippers', false),
  ('Líder comercial', 'crm-comercial', false),
  ('Líder comercial', 'pedidos-dropi', true),
  ('Líder comercial', 'producto', true),
  ('Líder comercial', 'inteligencia-competitiva', true),
  ('Líder comercial', 'analisis-competencia', true),
  ('Líder comercial', 'dashboard', true),
  ('Líder comercial', 'notificaciones', true),
  ('Operaciones', 'inventario', false),
  ('Operaciones', 'alertas', false),
  ('Operaciones', 'wms-bodegas', false),
  ('Operaciones', 'wms-ubicaciones', false),
  ('Operaciones', 'producto', true),
  ('Operaciones', 'compras', true),
  ('Operaciones', 'pedidos-dropi', true),
  ('Operaciones', 'dashboard', true),
  ('Operaciones', 'notificaciones', true),
  ('Investigación de producto', 'drop-killer', false),
  ('Investigación de producto', 'tu-winner', false),
  ('Investigación de producto', 'scraping-proveedores', false),
  ('Investigación de producto', 'instagram', false),
  ('Investigación de producto', 'sugerencias-clientes', false),
  ('Investigación de producto', 'seleccion-productos', false),
  ('Investigación de producto', 'productos-test', false),
  ('Investigación de producto', 'filtro-productos', false),
  ('Investigación de producto', 'inteligencia-competitiva', false),
  ('Investigación de producto', 'analisis-competencia', false),
  ('Investigación de producto', 'producto', true),
  ('Investigación de producto', 'compras', true),
  ('Investigación de producto', 'dashboard', true),
  ('Investigación de producto', 'notificaciones', true),
  ('Contenido y ofertas', 'creacion-ofertas', false),
  ('Contenido y ofertas', 'generador-landings', false),
  ('Contenido y ofertas', 'wms-productos', false),
  ('Contenido y ofertas', 'wms-productos-dropi', false),
  ('Contenido y ofertas', 'seleccion-productos', true),
  ('Contenido y ofertas', 'producto', true),
  ('Contenido y ofertas', 'dashboard', true),
  ('Contenido y ofertas', 'notificaciones', true),
  ('Compras', 'compras', false),
  ('Compras', 'filtro-productos', false),
  ('Compras', 'producto', true),
  ('Compras', 'productos-test', true),
  ('Compras', 'inventario', true),
  ('Compras', 'analisis-competencia', true),
  ('Compras', 'dashboard', true),
  ('Compras', 'notificaciones', true),
  ('Producto / Catálogo', 'producto', false),
  ('Producto / Catálogo', 'wms-productos', false),
  ('Producto / Catálogo', 'wms-productos-dropi', false),
  ('Producto / Catálogo', 'inventario', true),
  ('Producto / Catálogo', 'compras', true),
  ('Producto / Catálogo', 'productos-test', true),
  ('Producto / Catálogo', 'dashboard', true),
  ('Producto / Catálogo', 'notificaciones', true),
  ('Talento humano', 'puestos', false),
  ('Talento humano', 'dashboard', true),
  ('Talento humano', 'notificaciones', true),
  ('Consulta', 'dashboard', true),
  ('Consulta', 'inventario', true),
  ('Consulta', 'compras', true),
  ('Consulta', 'producto', true),
  ('Consulta', 'pedidos-dropi', true),
  ('Consulta', 'productos-test', true),
  ('Consulta', 'notificaciones', true);

insert into permisos_rol (rol_id, modulo, solo_lectura)
select r.id, p.modulo, p.solo_lectura
from _perm p
join roles r on r.nombre = p.rol
on conflict (rol_id, modulo) do nothing;

do $$
declare faltan text;
begin
  select string_agg(distinct p.rol, ', ') into faltan from _perm p where not exists (select 1 from roles r where r.nombre = p.rol);
  if faltan is not null then
    raise notice 'No existe el rol (cambió de nombre?): %', faltan;
  end if;
end $$;

commit;
