-- Portal AF4 360° — Conexión con QuickBooks Online (Fase 2: ventas del portal y de QuickBooks con desviación < 1 % en cada
-- mes cerrado). Ver FINANZAS-360.md › «QuickBooks Online».
--
-- 1. `qbo_conexion`: una sola fila (id = 1) con la compañía conectada (`realm_id`), el entorno y los tokens de OAuth 2.0
--    **cifrados** con AES-256-GCM (clave de servidor `QBO_TOKEN_KEY`; nunca en texto plano ni en el navegador), cuándo vence
--    cada uno, quién conectó, la última lectura y el último error.
-- 2. Lo leído por la API (solo lectura, nunca se escribe en QuickBooks), con la fecha de lectura:
--    `qbo_cuentas` (plan de cuentas, Account), `qbo_clases` (Class y Department: tienda o país), `qbo_pyg_mensual`
--    (reporte ProfitAndLoss por mes, total y por clase) y `qbo_ventas_mensual` (SalesReceipt, Invoice, RefundReceipt y
--    CreditMemo sumados por mes).
-- 3. `qbo_mapeo`: a qué sección del Estado de resultados del portal va cada cuenta de QuickBooks (o «ignorar»). Sin fila, el
--    portal sugiere una por el tipo y el nombre de la cuenta.
--
-- RLS activado y sin políticas (SEGURIDAD.md): solo el servidor, con la clave de servicio. Se puede correr dos veces.

create table if not exists qbo_conexion (
  id smallint primary key default 1 check (id = 1),
  realm_id text not null check (realm_id ~ '^[0-9]{1,30}$'),
  entorno text not null default 'sandbox' check (entorno in ('sandbox', 'production')),
  access_token_cifrado text not null,
  refresh_token_cifrado text not null,
  access_expira timestamptz not null,
  refresh_expira timestamptz,
  nombre_compania text check (nombre_compania is null or length(nombre_compania) <= 200),
  conectado_por uuid references auth.users(id),
  conectado_en timestamptz not null default now(),
  ultima_lectura timestamptz,
  ultimo_error text check (ultimo_error is null or length(ultimo_error) <= 1000),
  actualizado_en timestamptz not null default now()
);
alter table qbo_conexion enable row level security;
comment on table qbo_conexion is 'Portal AF4 360°: la compañía de QuickBooks Online conectada y sus tokens OAuth cifrados (AES-GCM, QBO_TOKEN_KEY).';

create table if not exists qbo_cuentas (
  id text primary key check (length(id) between 1 and 40),
  nombre text not null,
  nombre_completo text,
  tipo text,
  subtipo text,
  clasificacion text,
  activa boolean not null default true,
  leido_en timestamptz not null default now()
);
alter table qbo_cuentas enable row level security;

create table if not exists qbo_clases (
  clase text not null check (clase in ('class', 'department')),
  id text not null check (length(id) between 1 and 40),
  nombre text not null,
  activa boolean not null default true,
  leido_en timestamptz not null default now(),
  primary key (clase, id)
);
alter table qbo_clases enable row level security;

create table if not exists qbo_pyg_mensual (
  periodo date not null check (extract(day from periodo) = 1),
  -- '' = la compañía entera; si no, el id de la clase (Class) del reporte por clase.
  clase_id text not null default '',
  -- El id de la cuenta en QuickBooks (o el nombre de la fila si el reporte no trae id).
  cuenta_id text not null check (length(cuenta_id) between 1 and 200),
  cuenta_nombre text not null,
  -- Income, COGS, Expense, OtherIncome u OtherExpense (el grupo del reporte).
  grupo text not null,
  monto numeric(16, 2) not null default 0,
  leido_en timestamptz not null default now(),
  primary key (periodo, clase_id, cuenta_id)
);
create index if not exists qbo_pyg_mensual_periodo on qbo_pyg_mensual (periodo);
alter table qbo_pyg_mensual enable row level security;

create table if not exists qbo_ventas_mensual (
  periodo date not null check (extract(day from periodo) = 1),
  tipo text not null check (tipo in ('SalesReceipt', 'Invoice', 'RefundReceipt', 'CreditMemo')),
  documentos integer not null default 0 check (documentos >= 0),
  total numeric(16, 2) not null default 0,
  leido_en timestamptz not null default now(),
  primary key (periodo, tipo)
);
alter table qbo_ventas_mensual enable row level security;

create table if not exists qbo_mapeo (
  cuenta_id text primary key check (length(cuenta_id) between 1 and 200),
  destino text not null check (destino in ('ingresos', 'costo_ventas', 'administracion', 'marketing', 'depreciacion', 'finanzas', 'otros', 'impuesto_ganancias', 'ignorar')),
  actualizado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now()
);
alter table qbo_mapeo enable row level security;
comment on table qbo_mapeo is 'Portal AF4 360°: sección del Estado de resultados del portal de cada cuenta de QuickBooks (sin fila, se sugiere por tipo y nombre).';
