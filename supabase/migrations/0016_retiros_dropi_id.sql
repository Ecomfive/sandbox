-- Permite identificar los retiros que vienen de la extraccion automatica de
-- Dropi (endpoint api/withdrawal), para no duplicarlos si se vuelve a correr
-- la extraccion, y guarda el banco/cuenta que Dropi uso para procesarlo.
-- dropi_id queda nulo en los retiros cargados a mano de otras plataformas.

alter table retiros add column dropi_id bigint;
alter table retiros add column banco text;
alter table retiros add constraint retiros_dropi_id_unico unique (pais_id, plataforma_id, dropi_id);
