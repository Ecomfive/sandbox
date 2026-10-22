-- Portal del proveedor en mandarín (pedido de Hernán, 22 oct 2026): Chin ve su portal en chino simplificado y Ecomfive ve su tablero en
-- español. Los textos de la pantalla están en el código; lo escrito por personas (nombres de productos, notas, comentarios) se traduce con
-- Gemini una sola vez y se guarda aquí.
-- RLS sin políticas (solo el servidor).

-- El idioma de cada cuenta del portal (la de Chin arranca en chino).
alter table proveedor_usuarios add column if not exists idioma text not null default 'zh' check (idioma in ('zh', 'es'));

-- Las traducciones ya hechas: por el texto original (su huella) y el idioma al que se tradujo.
create table if not exists traducciones (
  id uuid primary key default uuid_v7(),
  huella text not null,
  destino text not null check (destino in ('zh', 'es')),
  texto text not null,
  traduccion text not null,
  modelo text,
  creado_en timestamptz not null default now(),
  unique (huella, destino)
);
alter table traducciones enable row level security;
