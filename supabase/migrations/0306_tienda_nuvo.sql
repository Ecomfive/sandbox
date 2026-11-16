-- Gestión de tienda › Nuvo (16 nov 2026, pedido de Hernán: «quiero integrar Nuvo, que es otra tienda, mismo proceso que con las otras 2»). La tercera
-- tienda, después de Kenku y Oferfy: queda «por conectar». Con la fila, Pedidos, Dashboard, Logística y la ficha ya muestran sus órdenes del Excel de
-- Finanzas (unidad «NUVO PAN», 10.794 órdenes del 1 abr al 13 oct 2026; la tienda se une a su unidad por el alias de la Matriz: NUVO → NUVO PAN). Su
-- tablero de Monday «GESTION DEVOLUCION NUVO» ya se lee (Devoluciones Nuvo, 18429025062). Lo nuevo entra al conectar su app de Shopify (solo lectura):
-- SHOPIFY_NUVO_CLIENT_ID, SHOPIFY_NUVO_CLIENT_SECRET y SHOPIFY_NUVO_DOMINIO en Vercel, y «Conectar» en Tiendas.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0306_rollback.sql
insert into tiendas (nombre, pais_id, moneda, orden)
select 'Nuvo', p.id, 'USD', 3 from paises p where p.codigo = 'PA'
on conflict (pais_id, nombre) do nothing;

notify pgrst, 'reload schema';
