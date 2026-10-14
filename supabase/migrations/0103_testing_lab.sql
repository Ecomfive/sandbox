-- Testing Lab (pedido de Alcides, 13 oct 2026): un área nueva del menú, solo de Proveeduría, con el recorrido del producto
-- en secciones. «Fuente de datos» (0102) se reparte en módulos propios: Drop Killer, Tu Winner y Scraping de proveedores
-- (Fuentes), Selección de productos (Selección) y uno nuevo, Creación de ofertas (Producción). Test productos y Filtro de
-- productos solo cambian de lugar en el menú (Resultados) y conservan su permiso. Quien tenía Fuente de datos recibe los
-- cinco con su mismo solo lectura; después se ajustan por rol en Usuarios y roles. Se puede repetir.
insert into permisos_rol (rol_id, modulo, solo_lectura)
select p.rol_id, m.modulo, p.solo_lectura
from permisos_rol p
cross join (values ('drop-killer'), ('tu-winner'), ('scraping-proveedores'), ('seleccion-productos'), ('creacion-ofertas')) as m(modulo)
where p.modulo = 'fuente-datos'
on conflict (rol_id, modulo) do nothing;

delete from permisos_rol where modulo = 'fuente-datos';
