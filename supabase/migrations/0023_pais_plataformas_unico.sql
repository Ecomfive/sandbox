-- Evita duplicados al vincular una plataforma a un pais, necesario para
-- poder hacer upsert al crear una plataforma nueva desde Configuracion.
alter table pais_plataformas
  add constraint pais_plataformas_pais_plataforma_key unique (pais_id, plataforma_id);
