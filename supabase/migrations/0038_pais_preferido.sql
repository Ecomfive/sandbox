-- El país con el que trabaja cada persona se recuerda en su cuenta, no solo en su navegador.
-- Hasta ahora vivía únicamente en una cookie: quien abría el sistema desde otro navegador u otro
-- equipo (o borraba las cookies) volvía a empezar en Costa Rica. Ahora, sin cookie, se usa el
-- último país que esa persona eligió. Guarda el código del país ('CR', 'PA'); null = sin elegir.
--
-- Si esta migración todavía no se corrió, todo sigue como antes (cookie o Costa Rica).

alter table perfiles add column if not exists pais_preferido text;
