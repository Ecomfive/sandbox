-- Reversa de 0195_crm_tipo_cliente.sql: vuelve a nuevo / regular / vip (Black pasa a VIP; Rookie queda como «Regular»).
alter table dropshippers drop constraint if exists dropshippers_nivel_check;
update dropshippers set nivel = 'vip' where nivel = 'black';
alter table dropshippers alter column nivel set default 'nuevo';
alter table dropshippers add constraint dropshippers_nivel_check check (nivel in ('nuevo', 'regular', 'vip'));
