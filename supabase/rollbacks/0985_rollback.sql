-- Reversa de 0985. Los tipos solo se quitan si ningún movimiento los usa.
delete from fin_tipos t
where t.nombre in ('Mercadería extraviada', 'Indemnización por paquete extraviado')
  and not exists (select 1 from fin_movimientos m where m.tipo_id = t.id);
alter table fin_grupo_partes drop column if exists dias_ciclo;
alter table fin_grupo_partes drop column if exists tasa_ciclo;
