-- Reversa de 0344_anular_remision_directo.sql: quita el módulo «Anular remisión sin autorización» a quien lo tenga. La columna `directa` y la función se dejan:
-- sin el módulo nadie crea una petición directa, y las ya anuladas conservan su historia.
delete from permisos_persona where modulo = 'anular-remision';
