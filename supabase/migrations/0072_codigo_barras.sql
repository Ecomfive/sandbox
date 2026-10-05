-- Código de barras del producto (WMS: lectura en recepción y picking).
--
-- * codigo_barras: el EAN/UPC/GTIN del fabricante, o uno INTERNO que genera el sistema cuando el producto no trae. Es opcional
--   (un combo virtual normalmente no tiene), único entre productos, y se puede corregir.
-- * codigo_barras_origen: 'fabricante' o 'interno', para saber de dónde salió.
-- * Los internos son EAN-13 con prefijo 20: el estándar GS1 reserva los prefijos 20 a 29 para uso interno de una empresa, así
--   que no chocan con ningún código de fabricante y cualquier escáner o impresora de etiquetas los lee. Se forman con el prefijo,
--   un número consecutivo de 10 cifras y el dígito de control.
-- La tabla ya lleva RLS sin políticas; no se crea ninguna nueva.

alter table skus_maestros
  add column if not exists codigo_barras text,
  add column if not exists codigo_barras_origen text check (codigo_barras_origen in ('fabricante', 'interno'));

-- O hay código y origen, o no hay ninguno.
alter table skus_maestros drop constraint if exists skus_maestros_barras_coherente;
alter table skus_maestros add constraint skus_maestros_barras_coherente check ((codigo_barras is null) = (codigo_barras_origen is null));

create unique index if not exists skus_maestros_codigo_barras_unico on skus_maestros (btrim(codigo_barras)) where codigo_barras is not null;

create sequence if not exists wms_codigo_barras_seq;

-- Dígito de control GS1 de una base numérica (sin el dígito de control): los de posición impar valen 1 y los pares 3, empezando
-- desde la derecha de la base.
create or replace function wms_digito_control_gs1(p_base text) returns integer
language plpgsql immutable as $$
declare
  v_suma integer := 0;
  v_largo integer := length(p_base);
  i integer;
begin
  if p_base !~ '^[0-9]+$' then
    raise exception 'La base del código debe ser solo números.';
  end if;
  for i in 1..v_largo loop
    v_suma := v_suma + substr(p_base, i, 1)::integer * case when (v_largo - i) % 2 = 0 then 3 else 1 end;
  end loop;
  return (10 - v_suma % 10) % 10;
end;
$$;

-- El siguiente código de barras interno (EAN-13 con prefijo 20), sin asignarlo a ningún producto.
create or replace function wms_generar_codigo_barras() returns text
language plpgsql as $$
declare
  v_base text;
begin
  v_base := '20' || lpad(nextval('wms_codigo_barras_seq')::text, 10, '0');
  return v_base || wms_digito_control_gs1(v_base)::text;
end;
$$;

-- Le asigna un código interno a un producto que no tiene ninguno, sin que dos personas a la vez se pisen: solo el que llega
-- primero lo consigue. Devuelve el código; si el producto ya tenía uno, falla.
create or replace function wms_asignar_codigo_barras_interno(p_sku uuid) returns text
language plpgsql as $$
declare
  v_codigo text;
  v_intentos integer := 0;
begin
  if not exists (select 1 from skus_maestros where id = p_sku) then
    raise exception 'El producto no existe.';
  end if;
  loop
    v_codigo := wms_generar_codigo_barras();
    begin
      update skus_maestros set codigo_barras = v_codigo, codigo_barras_origen = 'interno'
      where id = p_sku and codigo_barras is null;
      if not found then
        raise exception 'El producto ya tiene un código de barras.';
      end if;
      return v_codigo;
    exception when unique_violation then
      v_intentos := v_intentos + 1;
      if v_intentos > 5 then
        raise exception 'No se pudo generar un código de barras único.';
      end if;
    end;
  end loop;
end;
$$;
