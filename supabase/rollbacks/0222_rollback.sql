-- Reversa de 0222_plataforma_drop.sql: la plataforma vuelve a llamarse «Drog» (Gestión de IDs Drop deja de encontrar su fulfillment).

update plataformas set nombre = 'Drog'
where nombre = 'Drop' and not exists (select 1 from plataformas where nombre = 'Drog');
