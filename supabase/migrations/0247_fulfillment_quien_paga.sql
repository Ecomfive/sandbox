-- Quién paga el fulfillment de cada plataforma (pedido de Hernán, 7 nov 2026): en algunas plataformas lo paga el mismo dropshipper y entonces no cuenta en el margen. Se elige en
-- Configuración › Plataformas del país (`pais_plataformas.fulfillment_paga`: «nosotros», lo de siempre, o «dropshipper»). Arrancan con «dropshipper» Drop y Effi (en Costa Rica, el único país
-- donde existen) y Dunamixfy (si ya está como plataforma). Dropi sigue en «nosotros»: su fulfillment va escrito en cada publicación.
-- Se puede correr de nuevo sin efecto. Reversa: supabase/rollbacks/0247_rollback.sql

alter table pais_plataformas add column if not exists fulfillment_paga text not null default 'nosotros';
alter table pais_plataformas drop constraint if exists pais_plataformas_fulfillment_paga_check;
alter table pais_plataformas add constraint pais_plataformas_fulfillment_paga_check check (fulfillment_paga in ('nosotros', 'dropshipper'));

update pais_plataformas pp set fulfillment_paga = 'dropshipper'
from plataformas pl, paises x
where pp.plataforma_id = pl.id and pp.pais_id = x.id
  and pp.fulfillment_paga = 'nosotros'
  and (
    (x.codigo = 'CR' and lower(btrim(pl.nombre)) in ('drop', 'drog', 'effi', 'efi'))
    or lower(btrim(pl.nombre)) in ('dunamixfy', 'dynamify', 'dunamyfy')
  );
