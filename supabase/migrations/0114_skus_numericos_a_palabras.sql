-- SKU de los primeros productos: de número a palabras (20 oct 2026).
--
-- Los primeros 194 productos (N.º 1 a 194) tenían como SKU un número (1000 + su N.º correlativo: «1001», «1194»…). Los productos
-- nuevos llevan el SKU que sugiere el sistema (src/lib/wms/sugerir-sku.ts): las primeras 3 palabras útiles del nombre, en mayúsculas,
-- sin acentos y con barra («BALSAMO/PURPURA/MELAXIN»), y con /2, /3… si ya existe. Esta migración le pone ese SKU a los 193 que quedaban
-- con uno numérico (el N.º 60 ya tenía uno de palabras). El N.º correlativo no cambia: es el que identifica a cada producto.
--
--   * Se calculó con la misma función que usa la ficha, contra los SKU que existen hoy, y los repetidos llevan /2 y /3.
--   * Solo se cambia un producto si todavía tiene el SKU numérico (el N.º 1 ya se cambió a DAYS/CLEANSE desde el sistema: se salta).
--   * Si algún SKU nuevo ya lo usa otro producto, no cambia nada (la migración falla entera).
--   * Las fichas de Shopify y de Dropi enlazadas toman el SKU nuevo, como cuando se cambia desde la ficha del producto; en las
--     plataformas (Dropi, tiendas) el SKU hay que cambiarlo a mano si alguno estaba puesto allí.
--   * Cada cambio queda en la actividad del producto (cambiar_sku_producto), como si se hubiera hecho desde su ficha.
--   * Para deshacerlo: supabase/rollbacks/0114_rollback.sql.

begin;

create temporary table _cambio_sku (numero bigint primary key, nuevo text not null) on commit drop;
insert into _cambio_sku (numero, nuevo) values
  (1, 'DAYS/CLEANSE'),
  (2, 'ADEUS/TRATAMIENTO/INTENSIVO'),
  (3, 'ACEITE/CORPORAL/MAGIC'),
  (4, 'ACEITE/GOTAS/HONGOS'),
  (5, 'ACEITE/REMOVEDOR/VELLOS'),
  (6, 'ACEITE/VEGANIC/OIL'),
  (7, 'ACEITE/BATANA/ROMERO'),
  (8, 'ACEITE/OREGANO/CAPSULAS'),
  (9, 'ACEITE/OREGANO/CAPSULAS/2'),
  (10, 'ACEITE/SEMILLA/CALABAZA'),
  (11, 'AGED/GARLIC/EXTRACT'),
  (12, 'ALARMA/MAGNETICA/PUERTAS'),
  (13, 'ALMOHADA/ORTOPEDICA'),
  (14, 'ALMOHADA/VIAJE'),
  (15, 'ANTENA/TV/HD'),
  (16, 'ANTI/HPV'),
  (17, 'ANTI/MELASMA/CICA'),
  (18, 'ANUA/NIACINAMIDE/SERUM'),
  (19, 'ANUA/PEACH/SERUM'),
  (20, 'ASHWAGANDHA/CAPSULAS'),
  (21, 'ASTAXANTHIN'),
  (22, 'AUXILIAR/PARTIDA'),
  (23, 'BALSAMO/FACIAL/HIDRATANTE'),
  (24, 'BALSAMO/HIDRATANTE/DEROL'),
  (25, 'BANDA/MOLDEADORA/CINTURA'),
  (26, 'BANDA/EJERCICIO/PEDALES'),
  (27, 'BANDA/EJERCICIO/PEDALES/2'),
  (28, 'BANDA/EJERCICIO/PEDALES/3'),
  (29, 'BASE/MAQUILLAJE/ZEPHOCO/2'),
  (30, 'BASE/MAQUILLAJE/ZEPHOCO/3'),
  (31, 'BEE/VENOM/CREMA'),
  (32, 'BEEBREATHE/INHALADOR'),
  (33, 'BLANQUEADOR/DENTAL/SIIMUNANA'),
  (34, 'BODY/WISE/ROLL'),
  (35, 'BOLSAS/BURBUJAS'),
  (36, 'BOLSO/BANDOLERO/MULTICHIC/2'),
  (37, 'BOLSO/BANDOLERO/MULTICHIC/3'),
  (38, 'BOLSO/NAYLA/GRAN'),
  (39, 'BOLSO/NAYLA/GRAN/2'),
  (40, 'BOTOX/STOCK/SOLUTION'),
  (41, 'BRAZALETE'),
  (42, 'BALSAMO/ESTIMULADOR/BARBA'),
  (43, 'CABEZAL/DUCHA'),
  (44, 'CAMISA/STRETCH/CABALLERO'),
  (45, 'CANDIDA/CLEANSE'),
  (46, 'CARGADOR/INTELIGENTE/BATERIA'),
  (47, 'CARGADOR/TELEFONO'),
  (48, 'CARILLAS/DENTALES/SNAPON'),
  (49, 'CHAMPOO/ROMERO'),
  (50, 'CINTURON/LUMBAR'),
  (51, 'CLOROFILA/LIQUIDA'),
  (52, 'COLLAGEN/PEPTIDES/COLAGENO'),
  (53, 'COLLAGENO/BIO/PEPTIDES'),
  (54, 'CREMA/TERAPIA/ARTICULAR'),
  (55, 'COMPRESOR/AIRE'),
  (56, 'CORRECTOR/POSTURA'),
  (57, 'CREATINA/FOR/WOMEN'),
  (58, 'CREMA/HIDRATANTE/NIDA'),
  (59, 'CREMA/LIFTING/BOTOX'),
  (61, 'CREMA/REMOVEDOR/VERRUGAS'),
  (62, 'CREMA/REPARADORA/UNAS'),
  (63, 'CREMA/TERAPIA/ARTICULAR/2'),
  (64, 'CUADERNO/TRAZOS/NINOS'),
  (65, 'CUCHILLO/MULTIFUNCIONAL'),
  (66, 'CUTTING/MIX'),
  (67, 'DHT/BLOCKER'),
  (68, 'DISAAR/SHAMPOO/TINTE'),
  (69, 'DELINEADOR/PEEL/OFF'),
  (70, 'DEOS/DESODORANTE/INTERNO'),
  (71, 'DESTAPA/CANERIA/TORNADO'),
  (72, 'DISPOSITIVO/ANTIALERGIA/RINITIS'),
  (73, 'DISPOSITIVO/ANTIRRONQUIDOS'),
  (74, 'ALTHEA'),
  (75, 'EVIL/GOODS'),
  (76, 'EMMA/BIOACTIVES'),
  (77, 'ESCOBA'),
  (78, 'ESPUMA/DEPILACION/ELHOOE'),
  (79, 'ETHIOPIAN/BLACK/SEED'),
  (80, 'FAJA/BODY/ENTERIZO'),
  (81, 'FAJA/BODY/KIM'),
  (82, 'FAST/HYDRATION/ROSABELLA'),
  (83, 'FIBER/GUMMIES'),
  (84, 'FINO/HAIR/MASK'),
  (85, 'FORGE/SKIN/FOR'),
  (86, 'FRUITDYE/CREMA/TINTE'),
  (87, 'FUNGUS/NAILS/PATCHES'),
  (88, 'GEL/EXFOLIANTE/ORANGE'),
  (89, 'GEL/CICATRIZ'),
  (90, 'GLUCO/GONE/CLEAN'),
  (91, 'GOMITAS/CREATINA/MONOHIDRATO'),
  (92, 'GOMITAS/GABA'),
  (93, 'HAIR/GROWTH/CAPSULAS'),
  (94, 'HELPS/EYE/HEALTH'),
  (95, 'HISMILE/TIRAS/BLANQUEADORAS'),
  (96, 'HOMBRERAS/COMPRESION'),
  (97, 'HOME/STAIN/CLEANER'),
  (98, 'JJL/BRO/MENS'),
  (99, 'KING/MAKER'),
  (100, 'KREAIN/GEL/DOLOR'),
  (101, 'LAPIZ/REMOVEDOR/LUNARES'),
  (102, 'LEFUN/BODY/OIL'),
  (103, 'LEMME/BURN'),
  (104, 'LEMME/PURR'),
  (105, 'LENTES/ONE/READER'),
  (106, 'LENTES/SMART'),
  (107, 'LIBRO/MONTESSORI/AZUL'),
  (108, 'LIMPIADOR/ALTA/PRESION'),
  (109, 'LIPOSOMAL/VITAMINA/TOP'),
  (110, 'LIVER/APOYO/DESINTOXICACION'),
  (111, 'LYMPHATIC/DRAINOGE/NATURES'),
  (112, 'MAILER/BAG'),
  (113, 'MELANINA/REPARADORA/FACIAL'),
  (114, 'MAGNESIO/COMPLEX/CAPSULAS'),
  (115, 'MAGNESIUM/IN/COMPLEX/2'),
  (116, 'MEDIAS/COMPRESION/DEDOS'),
  (117, 'MEDIAS/SOPORTE/CALCETINES'),
  (118, 'MENOPAUSIA/PROBIOTICOS'),
  (119, 'MILK/THISTLE/OXYENERGY'),
  (120, 'MINI/CAMARA/ESPIA'),
  (121, 'MINI/CAMARA/LARGA'),
  (122, 'MINI/LINTERNA/TACTICA'),
  (123, 'MONOCULAR/TELESCOPIO/PORTATIL'),
  (124, 'MULTI/COLAGENO/COMPLEX'),
  (125, 'MULTI/COLAGENO/PEPTIDES'),
  (126, 'MAQUINA/AFEITAR'),
  (127, 'NAD/ADVANCE/CATA'),
  (128, 'NAD/RESVERATROL/REUS'),
  (129, 'NAD/NICOTINAMIDE'),
  (130, 'NMN/NAD/SUPPORT'),
  (131, 'ORGANIC/BEET/ROOT'),
  (132, 'OXIDO/NITRICO/CAPSULAS'),
  (133, 'OXIDO/NITRICO/TAPA'),
  (134, 'PETER/THOMAS/ROTH/2'),
  (135, 'PARCHE/KINOKI'),
  (136, 'PASTA/DENTAL/NIACINAMIDA'),
  (137, 'PERFUME/FEROMONAS/ALLURE'),
  (138, 'PERFUME/PHEROMONAS/HER'),
  (139, 'PLANTILLAS/AZULES'),
  (140, 'PLANTILLAS/COMODAS/MEMORY'),
  (141, 'POLVO/DENTAL/TEETH'),
  (142, 'POWER/FACTOR/SAVER'),
  (143, 'PROTECTOR/DENTAL/ORALHOE'),
  (144, 'PURIFYNG/GEL/EXFOLIANTE'),
  (145, 'RYZE/CAFE/POLVO'),
  (146, 'REMOLACHA/CAPSULAS'),
  (147, 'REPELENTE/MULTIFUNCION/ULTRASONICO'),
  (148, 'RHODIOLA/ROSEA'),
  (149, 'ROCIADOR/BIDE'),
  (150, 'RODILLERA/DEPORTIVA/VARILLAS'),
  (151, 'ROLLOS/IMPRESORA/BROTHER'),
  (152, 'ROLLOS/IMPRESORA/ZEBRA'),
  (153, 'SEAPURI/TRATAMIENTO/CAPILAR'),
  (154, 'SELERB/NAD/MENS'),
  (155, 'SELLADOR/IMPERMEABILIZANTE/INVISIBLE'),
  (156, 'SERUM/VITAMINA/CAPILAR'),
  (157, 'SERUM/ANTIEDAD/REVITAPEPTIDE'),
  (158, 'SET/BANDA/EJERCICIO'),
  (159, 'SET/PESTANAS/MAGNETICAS'),
  (160, 'SHAMPOO/ANTICASPA/HOEGOA'),
  (161, 'SHAMPOO/HAIR/DYE'),
  (162, 'SHE/LAJIT/HONEY'),
  (163, 'SHILAJIT/RESINA/PURA'),
  (164, 'SHILAJIT/GOLD/GOMITAS'),
  (165, 'SHILAJIT/ULTRA/VERDE'),
  (166, 'SHILAJIT/CAPSULA'),
  (167, 'SKIN/FIRMING/HOYGI'),
  (168, 'SPRAY/BEE/VENOM'),
  (169, 'SPRAY/MELAXIN/PEEL'),
  (170, 'SPRAY/CICATRICES/SOUTH'),
  (171, 'SUPER/CALM/CALMING'),
  (172, 'TABLA/TITANIO'),
  (173, 'TALLOW/HONEY/BALM'),
  (174, 'TINNIDROP/SPRAY/OIDO'),
  (175, 'TOBILLERA/COMPRESION/BLANCO'),
  (176, 'TONICO/DEPILACION/TRULY'),
  (177, 'TRUE/FEM/BALANCE'),
  (178, 'TRULY/BUNS/OF'),
  (179, 'TRULY/CREMA/COCO'),
  (180, 'TRULY/JELLY/BOOSTER'),
  (181, 'TRULY/SMOOTH/LEGEND'),
  (182, 'TURKESTERONE'),
  (183, 'TURMERIC/CURCUMIN'),
  (184, 'TONICO/HOJA/CORAZON'),
  (185, 'TONICO/DEPILACION/TRULY/2'),
  (186, 'TONICO/DEPILACION/TRULY/3'),
  (187, 'URO/PROBIOTIC'),
  (188, 'VARICOX/VEIN/BEE'),
  (189, 'VINAGRE/MANZANA/CAPSULAS'),
  (190, 'VITAMINA/LIQUIDA/B12'),
  (191, 'WALL/MOLD/REMOVER'),
  (192, 'YERBA/MAGICA'),
  (193, 'TOPLUX/BLOOD/SUGAR'),
  (194, 'HAIR/BUILDING/FIBERS');

-- Solo los que todavía tienen el SKU numérico de siempre (1000 + N.º).
create temporary table _aplicar on commit drop as
select s.id, s.numero, s.codigo as viejo, c.nuevo
from _cambio_sku c
join skus_maestros s on s.numero = c.numero
where btrim(s.codigo) = (1000 + c.numero)::text;

do $$
begin
  if exists (
    select 1 from _aplicar a join skus_maestros s on s.id <> a.id and lower(btrim(s.codigo)) = lower(btrim(a.nuevo))
  ) then
    raise exception 'Un SKU nuevo ya lo usa otro producto: no se cambió nada';
  end if;
  if (select count(*) from _aplicar) <> (select count(distinct lower(a.nuevo)) from _aplicar a) then
    raise exception 'Hay SKU nuevos repetidos dentro de la lista: no se cambió nada';
  end if;
  raise notice 'Se cambian % de % productos de la lista', (select count(*) from _aplicar), (select count(*) from _cambio_sku);
end $$;

update skus_maestros s set codigo = a.nuevo from _aplicar a where s.id = a.id;

-- Las fichas de canal enlazadas guardan una copia del SKU.
update wms_producto_variantes v set sku = a.nuevo from _aplicar a where v.sku_maestro_id = a.id;
update wms_dropi_productos d set sku = a.nuevo from _aplicar a where d.sku_maestro_id = a.id;

insert into historial_auditoria (usuario_nombre, accion, entidad, entidad_id, detalle, antes, despues)
select 'Migración 0114', 'cambiar_sku_producto', 'skus_maestros', a.id::text, null, jsonb_build_object('SKU', a.viejo), jsonb_build_object('SKU', a.nuevo)
from _aplicar a;

commit;
