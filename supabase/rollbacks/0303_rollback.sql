-- Reversa de 0303: quita el registro de notas del bot y el interruptor por tienda.
drop table if exists tienda_notas_bot;
alter table tiendas drop column if exists quitar_nota_bot;

notify pgrst, 'reload schema';
