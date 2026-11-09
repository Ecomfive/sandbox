-- Portal AF4 360° fase 3: Flujo de caja y Distribución de utilidades (ver FINANZAS-360.md).
--
-- 1. FLUJO DE CAJA (reemplaza la hoja «EFE» de GASTOS_PANAMA_2026.xlsx).
--    La hoja EFE es una copia del EERR que suma los movimientos con «FLUJO? = SI» en vez de «EERR? = SI». Aquí se arma
--    igual desde el libro (`fin_movimientos`, en_flujo = true), con tres cambios:
--    · El mes es el de la FECHA DE PAGO (si falta, el mes del libro). En el libro 2026 coinciden en 5.279 de 5.281 filas.
--    · Cada movimiento cae en un BLOQUE: operativo, inversión o financiamiento (`fin_tipos.bloque_flujo`, editable;
--      un movimiento marcado «bien de uso» siempre es inversión). La regla inicial está más abajo.
--    · Se ve POR CUENTA (forma de pago, `fin_cuentas`) con su saldo inicial (`fin_saldos_iniciales`).
--    «PAGO TDC» es un traspaso del banco a la tarjeta: no es una salida de caja (el gasto ya se contó al cargarlo a la
--    tarjeta, que en el libro tiene FLUJO = SI). Por eso entra solo como TRASPASO (bloque «traspaso»), aunque venga con
--    FLUJO = NO, para que el saldo del banco baje y la deuda de la tarjeta se pague; nunca suma al flujo neto.
--    INFORMACIÓN no entra nunca.
--
-- 2. DISTRIBUCIÓN DE UTILIDADES (filas «DISTRIBUCIÓN UTILIDADES» de la hoja EERR).
--    La utilidad de cada tienda se reparte entre los socios con un porcentaje por tienda (`fin_participaciones`, con
--    historia: un cambio de porcentaje es una fila nueva con su fecha). Los retiros de dividendos del libro se le
--    atribuyen a un socio (`fin_retiros_socio` a mano, o por el nombre del socio en la descripción, `fin_socios.alias`).
--
-- Permisos: estos dos módulos muestran la utilidad y los retiros de cada socio. NO se dan a quien tiene «gastos»: solo
-- a los roles que ya tienen «usuarios» (administradores), con su mismo solo lectura.
--
-- RLS activado y sin políticas (ver SEGURIDAD.md). Las vistas llevan `security_invoker = true`.

-- ---------------------------------------------------------------------------------------------
-- Flujo de caja
-- ---------------------------------------------------------------------------------------------
alter table fin_tipos add column if not exists bloque_flujo text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fin_tipos_bloque_flujo_check') then
    alter table fin_tipos add constraint fin_tipos_bloque_flujo_check
      check (bloque_flujo is null or bloque_flujo in ('operativo', 'inversion', 'financiamiento'));
  end if;
end $$;

-- Regla inicial (solo donde todavía no se eligió un bloque; lo demás es operativo):
--  · Financiamiento: lo que entra o sale por deuda o por los socios. Retiros de dividendos y dividendos, aportes de
--    capital, préstamos y compensaciones entre tiendas, la cuota de capital de un financiamiento, sus intereses y FECI
--    (servicio de la deuda) y el pago del préstamo con que se compró mercancía («Importación … PAGO PRESTAMO»: la
--    mercancía ya se contó cuando se compró con el préstamo).
--  · Inversión: bienes de uso y lo que se le presta o se paga por cuenta de empresas relacionadas fuera de Panamá
--    (INTERCOMPANY CR, VZLA…, OTROS CRÉDITOS): es plata que la empresa coloca y espera recuperar.
update fin_tipos set bloque_flujo = 'financiamiento'
where bloque_flujo is null and nombre in (
  'Retiro de dividendos', 'DIVIDENDOS', 'Aporte Capital', 'Prestamos Intertiendas', 'Compensación Deuda Intertiendas',
  'Amortización de Financiamiento', 'Gastos Financieros - Intereses', 'Gastos Financieros - FECI',
  'Importación - Compra de mercancia PAGO PRESTAMO'
);
update fin_tipos set bloque_flujo = 'inversion'
where bloque_flujo is null and (nombre in ('Alta Bien de Uso', 'BIENES DE USO', 'OTROS CRÉDITOS') or nombre like 'INTERCOMPANY%');
update fin_tipos set bloque_flujo = 'operativo'
where bloque_flujo is null and seccion in ('ingresos', 'costo_ventas', 'administracion', 'finanzas', 'marketing', 'otros', 'impuesto_ganancias');

-- Saldo de cada cuenta al comenzar un mes (el del extracto al cierre del mes anterior). Una tarjeta lleva su deuda en
-- negativo. El saldo de los meses siguientes sale de sumarle el flujo de esa cuenta.
create table if not exists fin_saldos_iniciales (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references fin_cuentas(id),
  fecha date not null check (extract(day from fecha) = 1),
  monto numeric(14, 2) not null,
  nota text,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  actualizado_en timestamptz not null default now(),
  unique (cuenta_id, fecha)
);

alter table fin_saldos_iniciales enable row level security;

-- Flujo por mes, cuenta, tienda, tipo y bloque. `monto` es positivo; `sentido` dice si entra o sale de la cuenta.
create or replace view fin_flujo_mensual
with (security_invoker = true) as
with movs as (
  select
    date_trunc('month', coalesce(m.fecha_pago, m.periodo))::date as mes,
    m.cuenta_id,
    m.unidad_id,
    m.tipo_id,
    case
      when t.seccion = 'pago_tdc' then 'traspaso'
      when t.id is null then 'sin_clasificar'
      when m.es_bien_de_uso then 'inversion'
      else coalesce(t.bloque_flujo, 'operativo')
    end as bloque,
    -- Sin tipo no se sabe el signo: casi todo lo que llega sin tipo es un gasto.
    case when coalesce(t.signo, -1) = 1 then 'entrada' else 'salida' end as sentido,
    m.monto
  from fin_movimientos m
  left join fin_tipos t on t.id = m.tipo_id
  where (m.en_flujo and coalesce(t.seccion, '') not in ('informacion', 'pago_tdc'))
     or t.seccion = 'pago_tdc'
)
select mes, cuenta_id, unidad_id, tipo_id, bloque, sentido, count(*)::integer as movimientos, round(sum(monto), 2) as monto
from movs
group by mes, cuenta_id, unidad_id, tipo_id, bloque, sentido;

comment on view fin_flujo_mensual is 'Portal AF4 360°: flujo de caja por mes de pago, cuenta, tienda, tipo y bloque (FLUJO = SI; PAGO TDC como traspaso).';
comment on table fin_saldos_iniciales is 'Portal AF4 360°: saldo de cada cuenta al comenzar un mes (base del saldo final del flujo).';

-- ---------------------------------------------------------------------------------------------
-- Distribución de utilidades
-- ---------------------------------------------------------------------------------------------
create table if not exists fin_socios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  -- Textos que, si aparecen en la descripción de un retiro de dividendos, lo atribuyen a este socio (sin mayúsculas ni
  -- acentos). Gana el que aparece primero en la descripción.
  alias text[] not null default '{}',
  activo boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now()
);

create table if not exists fin_participaciones (
  id uuid primary key default gen_random_uuid(),
  socio_id uuid not null references fin_socios(id),
  unidad_id uuid not null references fin_unidades(id),
  -- 0 a 100. Una fila nueva con otra fecha cambia el porcentaje desde ese mes; las anteriores quedan como historia.
  porcentaje numeric(7, 4) not null check (porcentaje >= 0 and porcentaje <= 100),
  vigente_desde date not null check (extract(day from vigente_desde) = 1),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id),
  unique (socio_id, unidad_id, vigente_desde)
);

create index if not exists fin_participaciones_unidad on fin_participaciones (unidad_id, vigente_desde);

-- Atribución a mano de un retiro de dividendos a un socio (manda sobre los alias).
create table if not exists fin_retiros_socio (
  movimiento_id uuid primary key references fin_movimientos(id) on delete cascade,
  socio_id uuid not null references fin_socios(id),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users(id)
);

alter table fin_socios enable row level security;
alter table fin_participaciones enable row level security;
alter table fin_retiros_socio enable row level security;

-- Los socios y sus porcentajes NO van en el repositorio (son datos privados de la empresa): se cargan aparte con
-- `datos-privados/semilla-socios.sql` o a mano en Distribución de utilidades › Participaciones.

comment on table fin_participaciones is 'Portal AF4 360°: porcentaje de la utilidad de cada tienda que le toca a cada socio, con historia.';

-- ---------------------------------------------------------------------------------------------
-- Permisos: solo los roles que ya administran Usuarios y roles.
-- ---------------------------------------------------------------------------------------------
insert into permisos_rol (rol_id, modulo, solo_lectura)
select rol_id, m.modulo, solo_lectura
from permisos_rol
cross join (values ('flujo-caja'), ('utilidades')) as m(modulo)
where permisos_rol.modulo = 'usuarios'
on conflict (rol_id, modulo) do nothing;
