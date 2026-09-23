-- Flujo Etapa / Estado / Consolidación de Retiros.
-- Resolver una novedad ya no crea un estado aparte: el retiro queda «Cerrado» y su Consolidación
-- dice «Novedad resuelta», que se guarda con esta bandera (`consolidado` sigue en true).
alter table retiros add column if not exists novedad_resuelta boolean not null default false;

-- Los retiros que ya estaban en el estado antiguo «novedad_resuelta» pasan al modelo nuevo.
update retiros
   set estado = 'cerrado',
       novedad_resuelta = true,
       consolidado = true
 where estado = 'novedad_resuelta';
