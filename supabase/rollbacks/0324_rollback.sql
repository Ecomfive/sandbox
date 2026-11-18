-- Reversa de 0324 (Anuncios Meta: datos del nombre de la campaña). Se vuelven a calcular con la siguiente lectura si se corre otra vez la migración.
alter table meta_campanas drop column if exists persona_nombre;
alter table meta_campanas drop column if exists videos;
alter table meta_campanas drop column if exists mercado;
notify pgrst, 'reload schema';
