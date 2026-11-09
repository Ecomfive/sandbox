-- Portal AF4 360°: paquete bancario (Fase 2, mejora 4) y estado del sistema (mejora 8).
--
-- 1. `fin_paquetes_bancarios`: cada paquete para un comité de crédito que se guarda queda como versión: el corte, la
--    entidad (consolidado, PA, CR), las secciones incluidas, la carta (formato simple de los manuales, nunca HTML) y la
--    foto completa de las cifras (`contenido`, jsonb), con quién y cuándo. Se abre tal como era ese día aunque después
--    cambien los datos.
-- 2. El nombre comercial y el RUC del paquete salen de las variables del servidor (`RECIBO_EMPRESA_NOMBRE`,
--    `RECIBO_EMPRESA_RUC`) o, si faltan, de `fin_config` (`empresa_nombre`, `empresa_ruc`): esta migración no los escribe.
--
-- RLS activado y sin políticas (SEGURIDAD.md): solo el servidor toca la tabla. Se puede correr dos veces.

create table if not exists fin_paquetes_bancarios (
  id uuid primary key default gen_random_uuid(),
  -- Primer día del mes de corte.
  corte date not null check (extract(day from corte) = 1),
  entidad text not null default 'consolidado' check (entidad ~ '^[A-Za-z0-9_-]{1,20}$'),
  secciones text[] not null default '{}',
  carta text check (carta is null or length(carta) <= 8000),
  contenido jsonb not null,
  creado_por uuid references auth.users(id),
  creado_por_nombre text,
  creado_en timestamptz not null default now()
);
create index if not exists fin_paquetes_bancarios_fecha on fin_paquetes_bancarios (creado_en desc);
create index if not exists fin_paquetes_bancarios_corte on fin_paquetes_bancarios (corte desc, entidad);
alter table fin_paquetes_bancarios enable row level security;
