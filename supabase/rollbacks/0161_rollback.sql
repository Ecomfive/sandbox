-- Reversa de 0161: vuelve a poner 1.5 por defecto en el fulfillment (como lo dejó la 0160).
alter table dropi_publicaciones alter column fulfillment set default 1.5;
