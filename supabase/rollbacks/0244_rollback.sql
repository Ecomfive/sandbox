-- Reversa de 0244_ventas_plataforma.sql. Las ventas se vuelven a leer de Effi, así que no se pierde nada que no se pueda recuperar.

drop table if exists plataforma_ventas_diarias;

notify pgrst, 'reload schema';
