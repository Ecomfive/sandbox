-- Reversa de 0190_whatsapp_motivos_actividad.sql: se pierden los motivos que la IA creó (los días ya analizados conservan sus ids; sin su etiqueta se muestran con el id).
drop table if exists whatsapp_actividad_motivos;
