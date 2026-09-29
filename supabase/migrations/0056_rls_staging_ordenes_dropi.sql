-- Auditoría de seguridad: `staging_ordenes_dropi` (payloads crudos de pedidos de Dropi, con datos de
-- clientes) se quedó sin RLS desde la migración inicial — a diferencia de cada otra tabla del proyecto.
-- Como Supabase expone por PostgREST cualquier tabla del esquema público a quien tenga la anon key (que
-- vive en el bundle del navegador) salvo que RLS lo impida, esto la dejaba alcanzable desde afuera. Solo
-- la toca scripts/dropi-ingerir-ordenes.ts con la service role key (que igual se salta RLS), así que se
-- habilita sin ninguna política: nadie entra por la API pública, y el script sigue funcionando igual.

alter table staging_ordenes_dropi enable row level security;
