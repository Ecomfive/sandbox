-- Verificación de los respaldos (mejora 30, 16 nov 2026): después de respaldar (o con «Verificar» en Panel ›
-- Respaldos) cada archivo se descarga, se descomprime y se cuentan sus filas contra lo anotado y contra la tabla viva.
-- Así se sabe que un respaldo de verdad se puede restaurar, no solo que existe.

alter table fin_respaldos add column if not exists verificacion jsonb;
alter table fin_respaldos add column if not exists verificado_en timestamptz;
