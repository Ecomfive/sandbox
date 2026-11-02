-- Reversa de 0210_whatsapp_numero_previsto.sql: un número nuevo vuelve a entrar siempre en Atención (los que ya entraron no cambian).

drop trigger if exists whatsapp_numero_previsto on whatsapp_numeros;
drop function if exists whatsapp_numero_previsto();
drop table if exists whatsapp_numeros_previstos;
