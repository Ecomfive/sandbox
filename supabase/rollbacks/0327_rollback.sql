-- Reversa de 0327 (Anuncios Meta: gasto por anuncio de todo el historial). El análisis de videos vuelve a mirar solo los últimos 30 días.
drop function if exists meta_gasto_por_anuncio(uuid[]);
notify pgrst, 'reload schema';
