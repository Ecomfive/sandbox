-- Reversa de 0252_vende_poco_esperar.sql: las publicaciones que esperaban vuelven a salir en «Vende poco».
alter table dropi_publicaciones drop column if exists vende_poco_espera_hasta;
alter table dropi_publicaciones drop column if exists vende_poco_espera_nota;
alter table dropi_publicaciones drop column if exists vende_poco_espera_por;
