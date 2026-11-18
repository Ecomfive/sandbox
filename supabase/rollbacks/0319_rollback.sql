-- Reversa de 0319: vuelve a dejar ejecutar las funciones del esquema public con la clave pública, como antes.
-- Ojo: también se lo da a las que ya lo tenían quitado a mano (0310 ven_reporteria_aplicar, 0914/0953 fin_mes_cerrado y
-- fin_bloqueo_cierre); después de correr esta reversa, vuelve a quitárselo a esas con las líneas `revoke` de esas migraciones.
grant execute on all functions in schema public to public, anon, authenticated;
alter default privileges for role postgres in schema public grant execute on functions to public, anon, authenticated;
