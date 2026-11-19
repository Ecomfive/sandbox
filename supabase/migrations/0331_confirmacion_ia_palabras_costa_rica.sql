-- Confirmación con IA › Costa Rica: palabras de zona de arranque (19 nov 2026, pedido de Jhokser: dejar el módulo armado aunque todavía no haya ninguna tienda). Salen del Excel «Codificación - Cantón - Provincia - Distrito - Barrio» del equipo
-- (lo verde es ciudad; lo azul y lo blanco, interior; ver `src/lib/confirmacion-ia/zonas-costa-rica.ts`). Solo van los nombres que NO se repiten en otro cantón con otra zona: los cantones del centro de San José son ciudad; las provincias de
-- Cartago, Heredia, Guanacaste, Puntarenas y Limón, y los cantones lejanos de San José y de Alajuela, son interior. «San José», «Alajuela», «San Rafael», «San Antonio», «San Isidro», «Desamparados», «Santa Ana»… no van: dependen del cantón
-- y del distrito, así que los decide la IA con la geografía y los ejemplos (el equipo puede agregar más desde «Palabras de zona»). Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0331_rollback.sql.

insert into confirmacion_ia_zonas (pais_id, texto, clave, resultado, creado_por_nombre)
select p.id, v.texto, v.clave, v.resultado, 'Sistema'
from paises p
cross join (values
  ('Escazú', 'escazu', 'ciudad'),
  ('Goicoechea', 'goicoechea', 'ciudad'),
  ('Tibás', 'tibas', 'ciudad'),
  ('Moravia', 'moravia', 'ciudad'),
  ('Curridabat', 'curridabat', 'ciudad'),
  ('Alajuelita', 'alajuelita', 'ciudad'),
  ('Montes de Oca', 'montes de oca', 'ciudad'),
  ('Vásquez de Coronado', 'vasquez de coronado', 'ciudad'),
  ('Coronado', 'coronado', 'ciudad'),
  ('Cartago', 'cartago', 'interior'),
  ('Limón', 'limon', 'interior'),
  ('Puntarenas', 'puntarenas', 'interior'),
  ('Guanacaste', 'guanacaste', 'interior'),
  ('Heredia', 'heredia', 'interior'),
  ('Liberia', 'liberia', 'interior'),
  ('Nicoya', 'nicoya', 'interior'),
  ('Turrialba', 'turrialba', 'interior'),
  ('Pérez Zeledón', 'perez zeledon', 'interior'),
  ('Puriscal', 'puriscal', 'interior'),
  ('Tarrazú', 'tarrazu', 'interior'),
  ('Aserrí', 'aserri', 'interior'),
  ('Acosta', 'acosta', 'interior'),
  ('Turrubares', 'turrubares', 'interior'),
  ('Dota', 'dota', 'interior'),
  ('Grecia', 'grecia', 'interior'),
  ('Naranjo', 'naranjo', 'interior'),
  ('Palmares', 'palmares', 'interior'),
  ('Atenas', 'atenas', 'interior'),
  ('Orotina', 'orotina', 'interior'),
  ('Zarcero', 'zarcero', 'interior'),
  ('Upala', 'upala', 'interior'),
  ('San Ramón', 'san ramon', 'interior'),
  ('Ciudad Quesada', 'ciudad quesada', 'interior'),
  ('Pococí', 'pococi', 'interior'),
  ('Guápiles', 'guapiles', 'interior'),
  ('Siquirres', 'siquirres', 'interior'),
  ('Guácimo', 'guacimo', 'interior'),
  ('Talamanca', 'talamanca', 'interior'),
  ('Matina', 'matina', 'interior'),
  ('La Unión', 'la union', 'interior'),
  ('Tres Ríos', 'tres rios', 'interior'),
  ('Oreamuno', 'oreamuno', 'interior'),
  ('El Guarco', 'el guarco', 'interior'),
  ('Barva', 'barva', 'interior'),
  ('Belén', 'belen', 'interior'),
  ('Esparza', 'esparza', 'interior'),
  ('Quepos', 'quepos', 'interior'),
  ('Golfito', 'golfito', 'interior'),
  ('Jacó', 'jaco', 'interior'),
  ('Cañas', 'canas', 'interior'),
  ('Tilarán', 'tilaran', 'interior'),
  ('Bagaces', 'bagaces', 'interior'),
  ('Abangares', 'abangares', 'interior'),
  ('Monteverde', 'monteverde', 'interior'),
  ('Sarapiquí', 'sarapiqui', 'interior'),
  ('Los Chiles', 'los chiles', 'interior'),
  ('Guatuso', 'guatuso', 'interior'),
  ('Río Cuarto', 'rio cuarto', 'interior'),
  ('Corredores', 'corredores', 'interior'),
  ('Parrita', 'parrita', 'interior'),
  ('Coto Brus', 'coto brus', 'interior'),
  ('Hojancha', 'hojancha', 'interior'),
  ('Nandayure', 'nandayure', 'interior')
) as v (texto, clave, resultado)
where p.codigo = 'CR'
on conflict (pais_id, clave) do nothing;

notify pgrst, 'reload schema';
