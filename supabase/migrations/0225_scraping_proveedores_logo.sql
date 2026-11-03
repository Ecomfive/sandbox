-- Scraping de proveedores › Proveedores referentes con el logo de cada proveedor (3 nov 2026, pedido de Hernán: «que se vea bonito con el
-- logo del proveedor»). El logo y la categoría («VERIFICADO») son los que muestra Dropi en la página del proveedor; los trae cada búsqueda
-- (`scripts/scraping-proveedores-navegador.js` → receptor). Sin logo, la página dibuja sus iniciales.
alter table scraping_proveedores add column if not exists logo_url text;
alter table scraping_proveedores add column if not exists categoria text;
