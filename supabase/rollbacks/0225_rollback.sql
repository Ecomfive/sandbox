-- Reversa de 0225: quita el logo y la categoría de los proveedores referentes (la página vuelve a las iniciales).
alter table scraping_proveedores drop column if exists logo_url;
alter table scraping_proveedores drop column if exists categoria;
