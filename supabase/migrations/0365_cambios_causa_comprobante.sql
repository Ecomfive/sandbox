-- Cambios y reembolsos (25 nov 2026, pedido de Hernán):
--   * «Responsable» pasa a decir quién causó la solicitud: el cliente (fue su decisión) o la tienda (envió mal el producto).
--     La persona del equipo que la lleva sigue en responsable_id (ahora «Encargado», en el panel).
--   * «Adjunto» de la tabla sube el comprobante del pago que hace Finanzas; «Notificar al cliente» se lo manda por WhatsApp.
alter table public.mon_postventa
  add column if not exists causa text check (causa in ('Cliente', 'Tienda')),
  add column if not exists comprobante text;

comment on column public.mon_postventa.causa is 'Quién causó la solicitud: Cliente (su decisión) o Tienda (la tienda se equivocó).';
comment on column public.mon_postventa.comprobante is 'El comprobante del pago (storage:ruta en postventa-adjuntos) que se le manda al cliente.';

-- Revisión: debe decir «quedó».
select case when count(*) = 2 then 'quedó' else 'falta' end as resultado
from information_schema.columns
where table_schema = 'public' and table_name = 'mon_postventa' and column_name in ('causa', 'comprobante');
