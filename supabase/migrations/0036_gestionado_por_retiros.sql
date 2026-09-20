-- Por dónde se está gestionando el retiro: por la plataforma (Dropi, etc.) o por correo.
alter table retiros
  add column if not exists gestionado_por text not null default 'plataforma'
    check (gestionado_por in ('plataforma', 'correo'));
