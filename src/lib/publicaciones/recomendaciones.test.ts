import assert from "node:assert/strict";
import { test } from "node:test";
import { REGLAS_DEFECTO, leerValorRegla, nivelMargen, reglasDesde, revisarReglas } from "./reglas";
import { estadoTarea, margenA, pendientes, tareaCumplida, precioAbajo, precioArriba, recomendar, vigenteHasta, type EntradaRecomendacion } from "./recomendaciones";

// El cinturón lumbar ciática (21 oct 2026): $4.99, costo $2.26, fulfillment $1.50 → margen 24,6 %.
const cinturon: EntradaRecomendacion = {
  archivada: false,
  esPack: false,
  precio: 4.99,
  costo: 2.26,
  fulfillment: 1.5,
  margen: 0.2465,
  netas30: 40,
  sku: { tipo: "simple" },
  combo: null,
  competidorMasBarato: null,
  competidorMinimo: null,
};

test("redondeo de precios a terminación en 9", () => {
  assert.equal(precioArriba(5.37), 5.39);
  assert.equal(precioArriba(5.39), 5.39);
  assert.equal(precioArriba(8.982), 8.99);
  assert.equal(precioAbajo(4.5), 4.49);
  assert.equal(precioAbajo(4.49), 4.49);
  assert.equal(precioAbajo(4.6), 4.59);
});

test("el cinturón lumbar recibe el combo x2 y subir precio", () => {
  const recs = recomendar(cinturon, REGLAS_DEFECTO);
  const combo = recs.find((r) => r.tipo === "combo_x2")!;
  assert.equal(combo.datos.precioCombo, 8.99);
  assert.ok(Math.abs(margenA(8.99, 4.52, 1.5) - 0.3304) < 0.001);
  assert.match(combo.titulo, /Crear combo x2 a \$8\.99/);
  const subir = recs.find((r) => r.tipo === "subir_precio")!;
  assert.equal(subir.datos.precioSugerido, 5.39);
  assert.equal(subir.titulo, "Subir el precio de $4.99 a $5.39 (+$0.40)");
});

test("con margen sano, archivado o sin costo no recomienda nada", () => {
  assert.deepEqual(recomendar({ ...cinturon, margen: 0.45 }, REGLAS_DEFECTO), []);
  assert.deepEqual(recomendar({ ...cinturon, archivada: true }, REGLAS_DEFECTO), []);
  assert.deepEqual(recomendar({ ...cinturon, costo: null }, REGLAS_DEFECTO), []);
});

test("el combo pide producto simple, ventas y que no sea ya un pack ni esté publicado", () => {
  const tipos = (e: Partial<EntradaRecomendacion>) => recomendar({ ...cinturon, ...e }, REGLAS_DEFECTO).map((r) => r.tipo);
  assert.ok(!tipos({ sku: null }).includes("combo_x2"));
  assert.ok(!tipos({ sku: { tipo: "compuesto" } }).includes("combo_x2"));
  assert.ok(!tipos({ netas30: 2 }).includes("combo_x2"));
  assert.ok(!tipos({ esPack: true }).includes("combo_x2"));
  assert.ok(!tipos({ combo: { codigo: "X2", publicado: true } }).includes("combo_x2"));
  const existente = recomendar({ ...cinturon, combo: { codigo: "CINT/X2", publicado: false } }, REGLAS_DEFECTO).find((r) => r.tipo === "combo_x2")!;
  assert.match(existente.titulo, /Publicar el combo x2/);
});

test("el umbral sale de las reglas: con mínimo de 20 % el cinturón ya no tiene margen bajo", () => {
  assert.deepEqual(recomendar(cinturon, { ...REGLAS_DEFECTO, margen_minimo: 0.2, margen_critico: 0.1 }), []);
});

test("subir precio no pasa al competidor más barato y no se sugiere si alguien ya está más barato", () => {
  const tope = recomendar({ ...cinturon, competidorMinimo: { proveedor: "OTRO", precio: 5.2 } }, REGLAS_DEFECTO).find((r) => r.tipo === "subir_precio")!;
  assert.equal(tope.datos.precioSugerido, 5.19);
  const barato = recomendar({ ...cinturon, competidorMasBarato: { proveedor: "OTRO", precio: 4.5 } }, REGLAS_DEFECTO).map((r) => r.tipo);
  assert.ok(!barato.includes("subir_precio"));
});

test("bajar frente a la competencia solo si el margen no queda crítico", () => {
  const sano = { ...cinturon, precio: 9.99, margen: margenA(9.99, 2.26, 1.5) };
  const r = recomendar({ ...sano, competidorMasBarato: { proveedor: "OTRO", precio: 8.5 } }, REGLAS_DEFECTO).find((x) => x.tipo === "igualar_precio")!;
  assert.equal(r.datos.precioSugerido, 8.49);
  assert.equal(r.titulo, "Bajar el precio de $9.99 a $8.49 (−$1.50)");
  assert.equal(recomendar({ ...sano, competidorMasBarato: { proveedor: "OTRO", precio: 4.2 } }, REGLAS_DEFECTO).length, 0);
});

test("una decisión vigente la oculta; vencida, vuelve", () => {
  const recs = [{ tipo: "combo_x2" }, { tipo: "subir_precio" }];
  assert.equal(vigenteHasta("rechazada", "2026-10-21"), "2027-01-19");
  assert.equal(vigenteHasta("pospuesta", "2026-10-21", 14), "2026-11-04");
  assert.deepEqual(pendientes(recs, [{ tipo: "combo_x2", vigenteHasta: "2026-11-01" }], "2026-10-21"), [{ tipo: "subir_precio" }]);
  assert.equal(pendientes(recs, [{ tipo: "combo_x2", vigenteHasta: "2026-10-20" }], "2026-10-21").length, 2);
});

test("reglas: valores guardados, lectura de la pantalla y coherencia", () => {
  const r = reglasDesde([{ clave: "margen_minimo", valor: "0.25" }, { clave: "margen_critico", valor: 5 }, { clave: "inventada", valor: 1 }]);
  assert.equal(r.margen_minimo, 0.25);
  assert.equal(r.margen_critico, 0.2);
  assert.deepEqual(leerValorRegla("margen_minimo", "25,5"), { valor: 0.255 });
  assert.ok("error" in leerValorRegla("min_ventas_antes", "2.5"));
  assert.ok("error" in leerValorRegla("margen_minimo", "95"));
  assert.ok(revisarReglas({ ...REGLAS_DEFECTO, margen_critico: 0.35 }));
  assert.equal(revisarReglas(REGLAS_DEFECTO), null);
  assert.equal(nivelMargen(0.25, REGLAS_DEFECTO), "bajo");
  assert.equal(nivelMargen(0.45, REGLAS_DEFECTO), "sano");
});

test("una tarea abierta no deja que se vuelva a sugerir, aunque su decisión ya haya vencido", () => {
  const recs = [{ tipo: "subir_precio" }];
  assert.equal(pendientes(recs, [{ tipo: "subir_precio", vigenteHasta: "2026-01-01", decision: "aceptada", hechaEn: null }], "2026-10-21").length, 0);
  assert.equal(pendientes(recs, [{ tipo: "subir_precio", vigenteHasta: "2026-01-01", decision: "aceptada", hechaEn: "2026-02-01" }], "2026-10-21").length, 1);
});

test("estado de una tarea: por hacer, atrasada y hecha", () => {
  assert.equal(estadoTarea({ hechaEn: null, plazo: "2026-10-28" }, "2026-10-21"), "por_hacer");
  assert.equal(estadoTarea({ hechaEn: null, plazo: "2026-10-20" }, "2026-10-21"), "atrasada");
  assert.equal(estadoTarea({ hechaEn: "2026-10-22T10:00:00Z", plazo: "2026-10-20" }, "2026-10-23"), "hecha");
});

test("el sistema detecta que se hizo: precio en Dropi hacia donde se pidió, o el combo publicado", () => {
  const subir = { tipo: "subir_precio", fecha: "2026-10-21T15:00:00Z", precioAntes: 4.99 };
  assert.equal(tareaCumplida(subir, { cambioPrecio: { fecha: "2026-10-24", antes: 4.99, despues: 5.49 }, comboPublicado: false })?.como, "dropi");
  assert.equal(tareaCumplida(subir, { cambioPrecio: { fecha: "2026-10-10", antes: 4.5, despues: 4.99 }, comboPublicado: false }), null);
  assert.equal(tareaCumplida(subir, { cambioPrecio: { fecha: "2026-10-24", antes: 4.99, despues: 4.49 }, comboPublicado: false }), null);
  assert.equal(tareaCumplida({ ...subir, tipo: "igualar_precio" }, { cambioPrecio: { fecha: "2026-10-24", antes: 4.99, despues: 4.49 }, comboPublicado: false })?.como, "dropi");
  assert.equal(tareaCumplida({ ...subir, tipo: "combo_x2" }, { cambioPrecio: null, comboPublicado: true })?.como, "producto");
});

test("subir o bajar el precio lleva a los competidores (precio, stock y lo vendido en 30 días), hasta 5, del más barato al más caro", () => {
  const competidores = Array.from({ length: 7 }, (_, i) => ({ proveedor: `P${i}`, nombre: "Aceite", precio: 4 + i, stock: 100 - i, vendido30: 10 * i }));
  const recs = recomendar(
    { archivada: false, esPack: false, precio: 9.9, costo: 1, fulfillment: 0.5, margen: 0.85, netas30: 10, sku: null, combo: null, competidorMasBarato: { proveedor: "P0", precio: 4 }, competidorMinimo: { proveedor: "P0", precio: 4 }, competidores },
    REGLAS_DEFECTO,
  );
  const bajar = recs.find((r) => r.tipo === "igualar_precio");
  assert.ok(bajar);
  assert.equal(bajar!.competidores?.length, 5);
  assert.deepEqual(bajar!.competidores?.[0], competidores[0]);
  const sin = recomendar({ archivada: false, esPack: false, precio: 9.9, costo: 1, fulfillment: 0.5, margen: 0.85, netas30: 10, sku: null, combo: null, competidorMasBarato: { proveedor: "P0", precio: 4 }, competidorMinimo: null }, REGLAS_DEFECTO);
  assert.equal(sin.find((r) => r.tipo === "igualar_precio")?.competidores, undefined);
});
