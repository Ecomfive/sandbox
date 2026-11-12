-- CRM: unir dos fichas del mismo dropshipper (11 nov 2026, pedido de Jhokser).
--
-- Un dropshipper puede vender en varios países y en varias plataformas (Dropi Panamá, Dropi Costa Rica, EFFI…), y a veces tiene una ficha por país porque se creó una vez en
-- cada uno. `crm_unir_dropshippers(conservar, eliminar, usuario, aplicar)` deja **una sola ficha** (la que se conserva: la más antigua) con la información de las dos:
--
--   * Todo lo que apunta a la ficha sobrante pasa a la que se conserva —cuentas de plataforma, países donde vende, «dónde vende», chats de WhatsApp, casos, tareas,
--     interacciones, comentarios, sugerencias, alertas…—. Se encuentra por las llaves foráneas reales (`pg_constraint`), así que no se queda nada sin mover aunque se
--     agreguen tablas después. En las tablas que son un conjunto (países, dónde vende, correos, teléfonos, alertas atendidas) lo que ya tenía la ficha que se conserva no se
--     repite: la fila sobrante se descarta. En cualquier otra, si dos filas chocarían, se niega y no cambia nada.
--   * Los datos de contacto no se pierden: el WhatsApp y el correo del sobrante pasan a «otros números» / «otros correos» de la que se conserva (o la completan si le faltaba).
--     Tiendas, productos, etiquetas y los IDs de ClickUp se juntan; ciudad, tienda, país de origen y responsable la completan si le faltaban; la fecha de ingreso y de captación
--     son las más antiguas; el tipo de cliente es el más alto; las notas se unen.
--   * Todo ocurre en una sola transacción y queda en la auditoría (`unir_dropshippers`). `p_aplicar = false` (por defecto) **simula**: hace los cambios, los deshace y devuelve
--     el informe de lo que movería.
--
-- Uso: select crm_unir_dropshippers('<id que se conserva>', '<id que se elimina>', 'Nombre', false);   -- simular
--      select crm_unir_dropshippers('<id que se conserva>', '<id que se elimina>', 'Nombre', true);    -- aplicar
-- Reversa de la función: supabase/rollbacks/0272_rollback.sql (lo que ya se unió no se puede separar).

create or replace function _crm_unir_dropshippers(p_conservar uuid, p_eliminar uuid, p_usuario text)
returns jsonb
language plpgsql
as $$
declare
  k dropshippers%rowtype;
  d dropshippers%rowtype;
  fk record;
  fila record;
  total bigint;
  movido jsonb := '{}'::jsonb;
  -- Tablas que son un conjunto: si la ficha que se conserva ya tiene la fila, la del sobrante se descarta.
  conjuntos text[] := array['dropshipper_paises', 'dropshipper_vende_en', 'dropshipper_correos', 'dropshipper_telefonos', 'crm_alertas_atendidas', 'crm_alta_pasos', 'dropshippers_etiquetas_respaldo'];
  tel_d text;
  correo_d text;
  rango_k int;
  rango_d int;
begin
  if p_conservar is null or p_eliminar is null or p_conservar = p_eliminar then
    raise exception 'Elige dos dropshippers distintos.';
  end if;
  select * into k from dropshippers where id = p_conservar;
  if not found then raise exception 'La ficha que se conserva no existe.'; end if;
  select * into d from dropshippers where id = p_eliminar;
  if not found then raise exception 'La ficha que se elimina no existe (%).', p_eliminar; end if;

  -- Los contactos del sobrante: el WhatsApp es único entre fichas, así que se suelta antes de pasarlo.
  tel_d := d.contacto_telefono;
  correo_d := lower(nullif(trim(d.contacto_email), ''));
  update dropshippers set contacto_telefono = null where id = p_eliminar;

  -- Todo lo demás que apunta al sobrante pasa a la ficha que se conserva.
  for fk in
    select con.conrelid::regclass::text as tabla, a.attname::text as columna
    from pg_constraint con
    join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
    where con.contype = 'f'
      and con.confrelid = 'dropshippers'::regclass
      and array_length(con.conkey, 1) = 1
      and con.conrelid::regclass::text <> 'dropshippers'
  loop
    total := 0;
    for fila in execute format('select ctid as cid from %s where %I = $1', fk.tabla, fk.columna) using p_eliminar loop
      begin
        execute format('update %s set %I = $1 where ctid = $2', fk.tabla, fk.columna) using p_conservar, fila.cid;
        total := total + 1;
      exception when unique_violation then
        if fk.tabla = any (conjuntos) then
          execute format('delete from %s where ctid = $1', fk.tabla) using fila.cid;
        else
          raise exception 'No se unen % y %: en % hay una fila de cada uno que chocaría al juntarlas. Júntalas a mano.', k.codigo, d.codigo, fk.tabla;
        end if;
      end;
    end loop;
    if total > 0 then movido := movido || jsonb_build_object(fk.tabla || '.' || fk.columna, total); end if;
  end loop;

  -- WhatsApp y correo del sobrante: completan a la ficha que se conserva o pasan a «otros».
  if tel_d is not null and tel_d is distinct from k.contacto_telefono then
    if k.contacto_telefono is null then
      update dropshippers set contacto_telefono = tel_d where id = p_conservar;
    else
      insert into dropshipper_telefonos (dropshipper_id, telefono, creado_por) values (p_conservar, tel_d, p_usuario) on conflict do nothing;
    end if;
    movido := movido || jsonb_build_object('contacto_telefono', true);
  end if;
  if correo_d is not null and correo_d like '%@%' and correo_d is distinct from lower(k.contacto_email) then
    if k.contacto_email is null or trim(k.contacto_email) = '' then
      update dropshippers set contacto_email = correo_d where id = p_conservar;
    else
      insert into dropshipper_correos (dropshipper_id, correo, creado_por) values (p_conservar, correo_d, p_usuario) on conflict do nothing;
    end if;
    movido := movido || jsonb_build_object('contacto_email', true);
  end if;

  -- El país principal del sobrante también es uno de los países donde vende.
  insert into dropshipper_paises (dropshipper_id, pais_id) values (p_conservar, d.pais_id) on conflict do nothing;

  -- Tipo de cliente: el más alto de los dos (si alguno lo fijó a mano, queda fijado).
  rango_k := case k.nivel when 'black' then 3 when 'vip' then 2 else 1 end;
  rango_d := case d.nivel when 'black' then 3 when 'vip' then 2 else 1 end;

  update dropshippers set
    tiendas = array(select distinct x from unnest(coalesce(k.tiendas, '{}') || coalesce(d.tiendas, '{}')) x where x is not null and x <> ''),
    productos = array(select distinct x from unnest(coalesce(k.productos, '{}') || coalesce(d.productos, '{}')) x where x is not null and x <> ''),
    etiquetas = array(select distinct x from unnest(coalesce(k.etiquetas, '{}') || coalesce(d.etiquetas, '{}')) x where x is not null and x <> ''),
    clickup_ids = array(select distinct x from unnest(coalesce(k.clickup_ids, '{}') || coalesce(d.clickup_ids, '{}')) x where x is not null and x <> ''),
    tienda = coalesce(k.tienda, d.tienda),
    ciudad = coalesce(k.ciudad, d.ciudad),
    pais_origen = coalesce(k.pais_origen, d.pais_origen),
    responsable_id = coalesce(k.responsable_id, d.responsable_id),
    telefono_alterno = coalesce(k.telefono_alterno, d.telefono_alterno),
    fecha_ingreso = case when k.fecha_ingreso is null then d.fecha_ingreso when d.fecha_ingreso is null then k.fecha_ingreso else least(k.fecha_ingreso, d.fecha_ingreso) end,
    captado_en = case when k.captado_en is null then d.captado_en when d.captado_en is null then k.captado_en else least(k.captado_en, d.captado_en) end,
    nivel = case when rango_d > rango_k then d.nivel else k.nivel end,
    nivel_manual = coalesce(k.nivel_manual, false) or coalesce(d.nivel_manual, false),
    notas = case
      when nullif(trim(d.notas), '') is null or d.notas = k.notas then k.notas
      when nullif(trim(k.notas), '') is null then d.notas
      else k.notas || E'\n\n' || d.notas
    end
  where id = p_conservar;

  delete from dropshippers where id = p_eliminar;

  insert into historial_auditoria (usuario_nombre, accion, entidad, entidad_id, detalle, antes, despues)
  values (
    coalesce(nullif(trim(p_usuario), ''), 'Unir dropshippers'),
    'unir_dropshippers',
    'dropshippers',
    p_conservar::text,
    'Se unió ' || d.codigo || ' (' || d.nombre || ') con ' || k.codigo || ' (' || k.nombre || ')',
    jsonb_build_object('Eliminado', d.codigo || ' ' || d.nombre),
    jsonb_build_object('Conservado', k.codigo || ' ' || k.nombre)
  );

  return jsonb_build_object('conservado', k.codigo, 'eliminado', d.codigo, 'movido', movido);
end;
$$;

create or replace function crm_unir_dropshippers(p_conservar uuid, p_eliminar uuid, p_usuario text default null, p_aplicar boolean default false)
returns jsonb
language plpgsql
as $$
declare
  informe jsonb;
begin
  begin
    informe := _crm_unir_dropshippers(p_conservar, p_eliminar, p_usuario);
    if not p_aplicar then
      -- Simulación: se deshace todo lo hecho dentro de este bloque y solo queda el informe.
      raise exception 'simulacion' using errcode = 'XS001';
    end if;
  exception when sqlstate 'XS001' then
    return informe || jsonb_build_object('simulacion', true);
  end;
  return informe || jsonb_build_object('simulacion', false);
end;
$$;

-- Solo el servidor (clave de servicio) y quien corre SQL en Supabase pueden llamarlas.
revoke all on function _crm_unir_dropshippers(uuid, uuid, text) from public, anon, authenticated;
revoke all on function crm_unir_dropshippers(uuid, uuid, text, boolean) from public, anon, authenticated;
