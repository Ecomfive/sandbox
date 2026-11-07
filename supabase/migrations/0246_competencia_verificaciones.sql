-- Análisis de competencia › lo que dijo la IA de cada par dudoso (7 nov 2026, pedido de Hernán: «también debes tomar en cuenta las fotos»). La regla de nombres
-- (`certezaIgual`) deja como dudoso lo que no es seguro; la IA con visión mira las dos fotos y los dos nombres y dice si es el mismo producto, uno parecido u otro
-- distinto. Se guarda una vez por par y plataforma (Dropi, Drop o Effi: sus tablas de productos son distintas, así que aquí no hay llaves foráneas).
-- * mismo: cuenta como igual (precios, posiciones, alertas). * parecido: sigue dudoso, con el motivo. * distinto: deja de mostrarse como parecido.
-- La llena la acción «Revisar con IA» de Análisis de competencia. RLS sin políticas. Se puede repetir.
-- Reversa: supabase/rollbacks/0246_rollback.sql

create table if not exists competencia_verificaciones (
  id uuid primary key default uuid_v7(),
  plataforma text not null check (plataforma in ('dropi', 'drop', 'effi')),
  producto_id uuid not null,
  nuestro_id uuid not null,
  veredicto text not null check (veredicto in ('mismo', 'parecido', 'distinto')),
  motivo text,
  creado_por uuid,
  creado_en timestamptz not null default now(),
  unique (plataforma, producto_id, nuestro_id)
);

alter table competencia_verificaciones enable row level security;
