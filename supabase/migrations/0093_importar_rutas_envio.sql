-- Compras › Envíos: las 27 rutas de la lista «Envíos desde China» de ClickUp (generado con
-- scripts/importar-rutas-envio.ts --sql). Ya corregidas: España y México tenían el tiempo del marítimo y el del aéreo
-- cambiados, y Costa Rica va con Chin. Además, las compras de Costa Rica quedan con agente de envío «Chin».
-- Se puede repetir sin duplicar. Va después de la 0092.

do $$
declare
  nueva uuid;
begin
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgz3w1$q$ and agente is not distinct from $q$Chin$q$ and via = $q$aire$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgz3w1$q$, $q$Chin$q$, $q$CR$q$, $q$Costa Rica$q$, $q$aire$q$, $q$DDP$q$, null, null, null, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgz3ny$q$ and agente is not distinct from $q$Chin$q$ and via = $q$mar$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgz3ny$q$, $q$Chin$q$, $q$CR$q$, $q$Costa Rica$q$, $q$mar$q$, $q$DDP$q$, null, null, null, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgz2wc$q$ and agente is not distinct from $q$Avery$q$ and via = $q$mar$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgz2wc$q$, $q$Avery$q$, $q$PE$q$, $q$Perú$q$, $q$mar$q$, $q$DDP$q$, null, 75, 85, true, $q$Avery 
1CBM= $2850 (Cosméticos)
1 CBM= $950 (Productos General)$q$, null)
    returning id into nueva;
    insert into wms_rutas_envio_tarifas (ruta_id, tipo_producto, precio, unidad, vigente_desde, creado_por) values (nueva, $q$Cosméticos$q$, 2850, $q$cbm$q$, $q$2025-08-14$q$, 'Importado de ClickUp');
    insert into wms_rutas_envio_tarifas (ruta_id, tipo_producto, precio, unidad, vigente_desde, creado_por) values (nueva, $q$General$q$, 950, $q$cbm$q$, $q$2025-08-14$q$, 'Importado de ClickUp');
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgz2va$q$ and agente is not distinct from $q$Avery$q$ and via = $q$aire$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgz2va$q$, $q$Avery$q$, $q$PE$q$, $q$Perú$q$, $q$aire$q$, $q$DDP$q$, null, 12, 15, true, $q$Avery
(No puede enviar áereo Cosméticos)
Productos General: $16.5 por KG$q$, null)
    returning id into nueva;
    insert into wms_rutas_envio_tarifas (ruta_id, tipo_producto, precio, unidad, vigente_desde, creado_por) values (nueva, $q$General$q$, 16.5, $q$kg$q$, $q$2025-08-14$q$, 'Importado de ClickUp');
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgz2jd$q$ and agente is not distinct from null and via = $q$mar$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgz2jd$q$, null, $q$PY$q$, $q$Paraguay$q$, $q$mar$q$, $q$DDP$q$, null, null, null, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgz2g7$q$ and agente is not distinct from null and via = $q$aire$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgz2g7$q$, null, $q$PY$q$, $q$Paraguay$q$, $q$aire$q$, $q$DDP$q$, null, null, null, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgz2c9$q$ and agente is not distinct from $q$Avery$q$ and via = $q$mar$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgz2c9$q$, $q$Avery$q$, $q$AR$q$, $q$Argentina$q$, $q$mar$q$, $q$DDP$q$, null, 75, 80, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgz2by$q$ and agente is not distinct from null and via = $q$aire$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgz2by$q$, null, $q$AR$q$, $q$Argentina$q$, $q$aire$q$, $q$DDP$q$, null, null, null, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgz0bz$q$ and agente is not distinct from $q$Avery$q$ and via = $q$mar$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgz0bz$q$, $q$Avery$q$, $q$GT$q$, $q$Guatemala$q$, $q$mar$q$, $q$DDP$q$, null, 75, 85, true, $q$Avery
1 CBM= $1080 (Cosméticos)
Hasta Oficina: $5/Kg
1 CBM= $980 (Productos General)
Hasta Oficina: $2/Kg$q$, null)
    returning id into nueva;
    insert into wms_rutas_envio_tarifas (ruta_id, tipo_producto, precio, unidad, vigente_desde, creado_por) values (nueva, $q$Cosméticos$q$, 1080, $q$cbm$q$, $q$2025-08-14$q$, 'Importado de ClickUp');
    insert into wms_rutas_envio_tarifas (ruta_id, tipo_producto, precio, unidad, vigente_desde, creado_por) values (nueva, $q$General$q$, 980, $q$cbm$q$, $q$2025-08-14$q$, 'Importado de ClickUp');
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgz02r$q$ and agente is not distinct from $q$Avery$q$ and via = $q$aire$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgz02r$q$, $q$Avery$q$, $q$GT$q$, $q$Guatemala$q$, $q$aire$q$, $q$DDP$q$, null, 13, 17, true, $q$Avery
(No puede enviar áereo Cosméticos)
Productos General: $17.5 por KG$q$, null)
    returning id into nueva;
    insert into wms_rutas_envio_tarifas (ruta_id, tipo_producto, precio, unidad, vigente_desde, creado_por) values (nueva, $q$General$q$, 17.5, $q$kg$q$, $q$2025-08-14$q$, 'Importado de ClickUp');
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgyzyp$q$ and agente is not distinct from $q$Chin$q$ and via = $q$mar$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgyzyp$q$, $q$Chin$q$, $q$EC$q$, $q$Ecuador$q$, $q$mar$q$, $q$DDP$q$, null, 75, 80, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgyzxh$q$ and agente is not distinct from $q$Avery$q$ and via = $q$mar$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgyzxh$q$, $q$Avery$q$, $q$ES$q$, $q$España$q$, $q$mar$q$, $q$DDP$q$, null, 55, 65, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgrzdz$q$ and agente is not distinct from $q$Avery$q$ and via = $q$aire$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgrzdz$q$, $q$Avery$q$, $q$ES$q$, $q$España$q$, $q$aire$q$, $q$DDP$q$, null, 10, 15, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgrzdz$q$ and agente is not distinct from $q$Chin$q$ and via = $q$mar$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgrzdz$q$, $q$Chin$q$, $q$ES$q$, $q$España$q$, $q$mar$q$, $q$DDP$q$, null, 60, 60, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgryur$q$ and agente is not distinct from $q$Avery$q$ and via = $q$aire$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgryur$q$, $q$Avery$q$, $q$EC$q$, $q$Ecuador$q$, $q$aire$q$, $q$DDP$q$, null, 17, 19, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgrytc$q$ and agente is not distinct from $q$Chin$q$ and via = $q$aire$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgrytc$q$, $q$Chin$q$, $q$VE$q$, $q$Venezuela$q$, $q$aire$q$, $q$DAP$q$, $q$UPS$q$, 15, 20, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgrypj$q$ and agente is not distinct from $q$Chin$q$ and via = $q$mar$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgrypj$q$, $q$Chin$q$, $q$VE$q$, $q$Venezuela$q$, $q$mar$q$, $q$DDP$q$, null, 90, 90, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgryj6$q$ and agente is not distinct from $q$Chin$q$ and via = $q$aire$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgryj6$q$, $q$Chin$q$, $q$VE$q$, $q$Venezuela$q$, $q$aire$q$, $q$DAP$q$, $q$DHL$q$, 8, 12, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgry46$q$ and agente is not distinct from $q$Chin$q$ and via = $q$aire$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgry46$q$, $q$Chin$q$, $q$CL$q$, $q$Chile$q$, $q$aire$q$, $q$DDP$q$, null, 20, 20, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgrxw0$q$ and agente is not distinct from $q$Chin$q$ and via = $q$mar$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgrxw0$q$, $q$Chin$q$, $q$CL$q$, $q$Chile$q$, $q$mar$q$, $q$DDP$q$, null, 65, 65, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgpb56$q$ and agente is not distinct from $q$Chin$q$ and via = $q$mar$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgpb56$q$, $q$Chin$q$, $q$CO$q$, $q$Colombia$q$, $q$mar$q$, $q$DDP$q$, null, 75, 90, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgpayw$q$ and agente is not distinct from $q$Chin$q$ and via = $q$aire$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgpayw$q$, $q$Chin$q$, $q$CO$q$, $q$Colombia$q$, $q$aire$q$, $q$DDP$q$, null, 28, 35, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgp827$q$ and agente is not distinct from $q$Chin$q$ and via = $q$aire$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgp827$q$, $q$Chin$q$, $q$MX$q$, $q$México$q$, $q$aire$q$, $q$DDP$q$, null, 15, 15, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgp7zw$q$ and agente is not distinct from $q$Chin$q$ and via = $q$mar$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgp7zw$q$, $q$Chin$q$, $q$MX$q$, $q$México$q$, $q$mar$q$, $q$DDP$q$, null, 60, 60, true, null, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgny2a$q$ and agente is not distinct from $q$Chin$q$ and via = $q$mar$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgny2a$q$, $q$Chin$q$, $q$PA$q$, $q$Panamá$q$, $q$mar$q$, $q$DDP$q$, null, 45, 55, true, $q$Avery: 
1CBM = $750$q$, null)
    returning id into nueva;
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgny2a$q$ and agente is not distinct from $q$Avery$q$ and via = $q$mar$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgny2a$q$, $q$Avery$q$, $q$PA$q$, $q$Panamá$q$, $q$mar$q$, $q$DDP$q$, null, 45, 55, true, $q$Avery: 
1CBM = $750$q$, null)
    returning id into nueva;
    insert into wms_rutas_envio_tarifas (ruta_id, tipo_producto, precio, unidad, vigente_desde, creado_por) values (nueva, $q$General$q$, 750, $q$cbm$q$, $q$2025-08-13$q$, 'Importado de ClickUp');
  end if;
  if not exists (select 1 from wms_rutas_envio where clickup_id = $q$86dxgnxky$q$ and agente is not distinct from $q$Chin$q$ and via = $q$aire$q$) then
    insert into wms_rutas_envio (clickup_id, agente, pais_codigo, pais_nombre, via, modalidad, courier, dias_min, dias_max, activo, nota, url)
    values ($q$86dxgnxky$q$, $q$Chin$q$, $q$PA$q$, $q$Panamá$q$, $q$aire$q$, $q$DAP$q$, null, 10, 10, true, null, null)
    returning id into nueva;
  end if;
end $$;

update wms_compras set agente_envio = 'Chin'
where agente_envio is null and tipo = 'pais' and pais_id = (select id from paises where codigo = 'CR');
