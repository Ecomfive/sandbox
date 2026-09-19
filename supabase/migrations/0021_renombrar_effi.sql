-- Corrige el nombre de la plataforma "EFI" a "EFFI" (con doble F).
update plataformas set nombre = 'EFFI' where nombre = 'EFI';
