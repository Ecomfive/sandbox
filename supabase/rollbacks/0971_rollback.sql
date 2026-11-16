-- Reversa de 0971 (archivar en Despacho ciudad). Las filas archivadas vuelven a verse en el tablero (sin pedido enlazado).
drop index if exists mon_despachos_archivados;
alter table mon_despachos drop column if exists archivado_por, drop column if exists archivado_en;
notify pgrst, 'reload schema';
