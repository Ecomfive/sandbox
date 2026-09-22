-- El trigger de 0040 solo marca `primer_ingreso_en` cuando `last_sign_in_at` cambia de null a un valor: una
-- cuenta que ya había entrado antes de que existiera esa columna se queda sin este dato para siempre, aunque
-- ya tenga un `último ingreso` real. Esto la rellena una sola vez con el primer valor que ya tiene guardado
-- `auth.users.last_sign_in_at`, para las cuentas que entraron antes de la migración 0040.
update perfiles
set primer_ingreso_en = auth.users.last_sign_in_at
from auth.users
where perfiles.id = auth.users.id
  and perfiles.primer_ingreso_en is null
  and auth.users.last_sign_in_at is not null;
