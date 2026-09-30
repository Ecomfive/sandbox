-- Sistema WMS: «Productos Test» — el paso previo a Filtros, calcado de la hoja de cálculo "Control de
-- Testing en Países": productos candidatos que se prueban con anuncios en Meta antes de decidir si se
-- envían a cotizar (Filtros) y comprar. Por ahora solo se usa para Panamá.

create table if not exists wms_productos_test (
  id uuid primary key default gen_random_uuid(),
  pais_id uuid not null references paises(id),
  nombre text not null,

  fecha_creacion date,
  fuente text,
  pagina_producto_url text,
  video_url text,
  categoria text,
  angulo_venta text,
  -- País de origen del anuncio ganador que se copió (no tiene relación con `pais_id`, que es el país
  -- donde se está probando el producto).
  worldwide text,

  ad_library text,
  fecha_test date,
  estado text not null default 'sin_definir'
    check (estado in ('sin_definir', 'enviado_a_compras', 'fallido', 'descartado')),
  clickup boolean not null default false,
  test_numero text check (test_numero in ('test_1', 'test_2', 'test_3')),
  calculadora_url text,
  campana_url text,

  -- Las métricas del test en Meta Ads, siempre en dólares — igual que en Filtros.
  metrica_oferta numeric(12, 2),
  metrica_cpm numeric(12, 2),
  metrica_efectividad numeric(5, 2),
  metrica_hook_rate numeric(5, 2),
  metrica_ctr numeric(5, 2),
  metrica_cpa numeric(12, 2),
  metrica_gasto numeric(12, 2),
  metrica_compras integer,
  metrica_cvr numeric(5, 2),

  revisado boolean not null default false,
  ultima_revision date,
  observacion text,
  explotacion text check (explotacion in ('baja', 'media', 'alta', 'no_aplica')),

  creado_por uuid references auth.users(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists wms_productos_test_pais_idx on wms_productos_test (pais_id, creado_en desc);

alter table wms_productos_test enable row level security;
create policy "authenticated read/write" on wms_productos_test for all using (auth.role() = 'authenticated');

insert into permisos_rol (rol_id, modulo)
select id, 'productos-test' from roles where nombre = 'Admin'
on conflict do nothing;
