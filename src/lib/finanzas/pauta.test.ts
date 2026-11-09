import assert from "node:assert/strict";
import { test } from "node:test";
import {
  alertasPauta,
  factorProyeccion,
  filaTiendaMes,
  leerTecho,
  pautaDe,
  pautaPorTienda,
  sobreTecho,
  tasasResolucion,
  techoDe,
  tiendasPropias,
  tiendasPropiasPredeterminadas,
  validarTecho,
  ventasEsperadas,
  type FilaTiendaMes,
} from "./pauta";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

const fila = (p: Partial<FilaTiendaMes>): FilaTiendaMes => ({
  periodo: "2026-09-01",
  unidadId: A,
  ordenes: 0,
  enviadas: 0,
  entregadas: 0,
  devueltas: 0,
  enTransito: 0,
  ventasEntregadas: 0,
  ventasTransito: 0,
  elegiblesEstado: 0,
  sinEstado: 0,
  marketingLibro: 0,
  gastoMeta: 0,
  ...p,
});

test("filaTiendaMes lee la fila de la función y pautaDe toma el mayor", () => {
  const f = filaTiendaMes({ periodo: "2026-09-01T00:00:00", unidad_id: A, marketing_libro: "120.5", gasto_meta: 90, ventas_entregadas: "1000" });
  assert.equal(f.periodo, "2026-09-01");
  assert.equal(f.ventasEntregadas, 1000);
  assert.equal(pautaDe(f), 120.5);
  assert.equal(pautaDe({ marketingLibro: 10, gastoMeta: 40 }), 40);
});

test("ventas esperadas suman lo que sigue en tránsito por la tasa de resolución", () => {
  const filas = [fila({ entregadas: 6, devueltas: 4 }), fila({ unidadId: B, entregadas: 0, devueltas: 0 })];
  const t = tasasResolucion(filas);
  assert.equal(t.get(A), 0.6);
  assert.equal(t.has(B), false);
  assert.equal(ventasEsperadas({ ventasEntregadas: 100, ventasTransito: 50 }, 0.6), 130);
  assert.equal(ventasEsperadas({ ventasEntregadas: 100, ventasTransito: 50 }, undefined), 100);
});

test("tiendas propias por defecto dejan fuera la proveeduría de Dropi y Clicksi", () => {
  const u = [
    { id: A, nombre: "KENKU", clase: "tienda", canal: "shopify" },
    { id: B, nombre: "ECOMFIVE", clase: "tienda", canal: null },
    { id: "c", nombre: "CLICKSI", clase: "tienda" },
    { id: "d", nombre: "CORPORATIVO", clase: "gestion" },
    { id: "e", nombre: "NUVO", clase: "tienda", canal: "dropi" },
  ];
  assert.deepEqual(tiendasPropiasPredeterminadas(u), [A]);
  assert.deepEqual(tiendasPropias(u, [B, "d", "zz"]), [B]);
  assert.deepEqual(tiendasPropias(u, null), [A]);
});

test("techo: lectura, validación y techo propio por tienda", () => {
  assert.deepEqual(leerTecho(null), { general: 22, porTienda: {} });
  const c = leerTecho({ general: "25", por_tienda: { [A]: 30, malo: 10, [B]: 500 } });
  assert.equal(c.general, 25);
  assert.deepEqual(c.porTienda, { [A]: 30 });
  assert.equal(techoDe(c, A), 30);
  assert.equal(techoDe(c, B), 25);
  const datos: Record<string, string> = { general: "22", [`tienda:${A}`]: "18", [`tienda:${B}`]: "22" };
  const v = validarTecho((k) => datos[k], [A, B]);
  assert.ok("techo" in v);
  if ("techo" in v) assert.deepEqual(v.techo, { general: 22, porTienda: { [A]: 18 } });
  assert.ok("error" in validarTecho((k) => (k === "general" ? "0" : ""), [A]));
  assert.ok("error" in validarTecho((k) => (k === "general" ? "22" : "abc"), [A]));
});

test("factor de proyección: el mes en curso se lleva a fin de mes", () => {
  assert.equal(factorProyeccion("2026-09-01", "2026-09-15"), 2);
  assert.equal(factorProyeccion("2026-08-01", "2026-09-15"), 1);
});

test("pauta por tienda: % sobre ventas, excedente y anualizado", () => {
  const filas = [
    fila({ periodo: "2026-08-01", marketingLibro: 300, gastoMeta: 250, ventasEntregadas: 1000, entregadas: 10, devueltas: 0 }),
    fila({ periodo: "2026-09-01", marketingLibro: 100, ventasEntregadas: 1000, entregadas: 10 }),
    fila({ periodo: "2026-09-01", unidadId: B, gastoMeta: 50, ventasEntregadas: 0 }),
  ];
  const techo = { general: 22, porTienda: {} };
  const [a] = pautaPorTienda(filas, ["2026-08-01"], [A, B], techo, "2026-10-20");
  assert.equal(a.unidadId, A);
  assert.equal(a.pct, 30);
  assert.equal(a.excedente, 80);
  assert.equal(a.excedenteAnual, 960);
  assert.equal(sobreTecho(a), true);
  const dos = pautaPorTienda(filas, ["2026-08-01", "2026-09-01"], [A], techo, "2026-10-20");
  assert.equal(dos[0].pct, 20);
  assert.equal(dos[0].excedente, 0);
  assert.equal(dos[0].meses, 2);
  const sinVentas = pautaPorTienda(filas, ["2026-09-01"], [B], techo, "2026-10-20")[0];
  assert.equal(sinVentas.pct, null);
  assert.equal(sinVentas.excedente, 50);
  assert.equal(sobreTecho(sinVentas), true);
});

test("alertas: último cerrado y mes en curso proyectado, con lo que vale bajar al techo", () => {
  const filas = [
    fila({ periodo: "2026-09-01", marketingLibro: 300, ventasEntregadas: 1000, entregadas: 10 }),
    fila({ periodo: "2026-10-01", gastoMeta: 100, ventasEntregadas: 500, entregadas: 5 }),
    fila({ periodo: "2026-09-01", unidadId: B, marketingLibro: 100, ventasEntregadas: 1000, entregadas: 10 }),
  ];
  const al = alertasPauta(filas, [A, B], { general: 22, porTienda: {} }, "2026-10-10", (id) => (id === A ? "KENKU" : "NUVO"));
  assert.deepEqual(al.map((a) => a.clave), [`pauta:${A}:2026-09`]);
  assert.equal(al[0].monto, 80);
  assert.equal(al[0].severidad, "aviso");
  assert.match(al[0].mensaje, /KENKU · sep 2026: pauta 30\.0 %/);
  assert.match(al[0].mensaje, /US\$80 en el mes, US\$960 al año/);
  // El día 20 ya se proyecta octubre: 100 / 500 = 20 %, dentro del techo; con techo propio de 15 % sí alerta.
  const al2 = alertasPauta(filas, [A], { general: 22, porTienda: { [A]: 15 } }, "2026-10-20", () => "KENKU");
  const oct = al2.find((a) => a.periodo === "2026-10-01");
  assert.ok(oct);
  assert.match(oct!.mensaje, /\(proyectado\)/);
  // Proyectado a 31 días: pauta 155, ventas 775, techo 15 % → excedente 38.75.
  assert.equal(oct!.monto, 38.75);
  // Antes del día 7 no se proyecta el mes en curso.
  assert.equal(alertasPauta(filas, [A], { general: 15, porTienda: {} }, "2026-10-03", () => "K").some((a) => a.periodo === "2026-10-01"), false);
});
