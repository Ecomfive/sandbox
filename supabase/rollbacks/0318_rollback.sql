-- Deshace 0318: quita la función que cierra las sesiones de una cuenta. Las sesiones ya borradas no vuelven (cada quien vuelve a entrar).
-- El bloqueo de ingreso de las cuentas suspendidas se deja: quitarlo dejaría entrar de nuevo a quien se suspendió. Si hiciera falta, para
-- una cuenta en particular: update auth.users set banned_until = null where id = '<id>';
-- Con la función quitada, la app sigue suspendiendo y avisa que faltó cerrar las sesiones.

drop function if exists public.cerrar_sesiones_usuario(uuid);
