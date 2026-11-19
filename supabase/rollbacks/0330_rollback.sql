-- Deshace 0330: quita el límite de peticiones (las funciones y la tabla de contadores). La app sigue funcionando: sin las funciones deja
-- pasar todo, como antes, y lo anota una vez en los registros del servidor.
-- El tipo «seguridad» se deja en la regla de `notificaciones_usuario`: solo amplía lo que se acepta y quitarlo fallaría si ya hay avisos
-- de ese tipo. Si hiciera falta, primero: delete from notificaciones_usuario where tipo = 'seguridad'; y después volver a armar la regla.

drop function if exists public.limite_peticiones(text, integer, integer);
drop function if exists public.limite_sumar(text, integer, integer);
drop function if exists public.limite_reiniciar(text);
drop table if exists public.limite_contadores;

notify pgrst, 'reload schema';
