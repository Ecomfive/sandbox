import assert from "node:assert/strict";
import { test } from "node:test";
import { esNuevo, recomendar, ventasEstimadas, type DatosRecomendacion } from "./recomendar";

const AHORA = "2026-10-26T12:00:00Z";
const base: DatosRecomendacion = { estado: "activo", motivo: null, ventas30: 0, repetidoEn: [], yaVisto: null, enSeleccion: false, nuevoHaceDias: null };

test("nuevo: apareció hace menos de 14 días y después de la primera búsqueda del proveedor", () => {
  const inicio = "2026-10-15T05:00:00Z";
  assert.equal(esNuevo("2026-10-15T05:03:00Z", inicio, AHORA), null); // ya estaba cuando se empezó a seguir
  assert.equal(esNuevo("2026-10-20T05:00:00Z", inicio, AHORA), 6);
  assert.equal(esNuevo("2026-10-26T05:00:00Z", inicio, AHORA), 0);
  assert.equal(esNuevo("2026-10-01T05:00:00Z", "2026-09-01T00:00:00Z", AHORA), null); // hace más de 14 días
});

test("ventas estimadas: suma lo que baja el stock entre búsquedas; la reposición y lo de antes no cuentan", () => {
  const ev = [
    { fecha: "2026-09-20T10:00:00Z", stock: 100, stockAntes: 150 }, // antes de los 30 días
    { fecha: "2026-10-01T10:00:00Z", stock: 900, stockAntes: 1000 },
    { fecha: "2026-10-02T10:00:00Z", stock: 1500, stockAntes: 900 }, // reposición
    { fecha: "2026-10-03T10:00:00Z", stock: 1460, stockAntes: 1500 },
    { fecha: "2026-10-04T10:00:00Z", stock: 1400, stockAntes: null }, // primera vez
  ];
  assert.equal(ventasEstimadas(ev, "2026-09-26T12:00:00Z"), 140);
  assert.equal(ventasEstimadas([], "2026-09-26T12:00:00Z"), 0);
});

test("testear: se vende fuerte, o se vende y lo tiene otro proveedor, y no lo tenemos", () => {
  const a = recomendar({ ...base, ventas30: 120 });
  assert.equal(a.tipo, "testear");
  assert.equal(a.porQue, "Bajó ~120 u. de stock en 30 días. No está en Test productos ni en Producto.");
  const b = recomendar({ ...base, ventas30: 25, repetidoEn: ["Hyper Moda", "Atma"], nuevoHaceDias: 9 });
  assert.equal(b.tipo, "testear");
  assert.equal(b.porQue, "Bajó ~25 u. de stock en 30 días, también lo tienen Hyper Moda y Atma, apareció hace 9 días. No está en Test productos ni en Producto.");
});

test("mirar de cerca: se mueve algo, está en otro proveedor o es nuevo y ya bajó", () => {
  assert.equal(recomendar({ ...base, ventas30: 15 }).tipo, "mirar");
  assert.equal(recomendar({ ...base, repetidoEn: ["Atma"] }).tipo, "mirar");
  assert.equal(recomendar({ ...base, ventas30: 3, nuevoHaceDias: 2 }).tipo, "mirar");
  assert.equal(recomendar({ ...base, estado: "desaparecido", motivo: "agotado", ventas30: 80 }).tipo, "mirar");
});

test("ya lo tenemos: testeado, en Producto o enviado a Selección, aunque se venda", () => {
  const r = recomendar({ ...base, ventas30: 300, yaVisto: { tipo: "test", nombre: "Test #12" } });
  assert.equal(r.tipo, "tenemos");
  assert.match(r.porQue, /Ya se testeó: Test #12\.$/);
  assert.equal(recomendar({ ...base, enSeleccion: true }).tipo, "tenemos");
  assert.match(recomendar({ ...base, yaVisto: { tipo: "producto", nombre: "SKU ABC" } }).porQue, /^Ya está en Producto: SKU ABC\.$/);
});

test("sin señales: no se movió", () => {
  const r = recomendar(base);
  assert.equal(r.tipo, "sin_senales");
  assert.equal(r.porQue, "No se movió en 30 días.");
  assert.equal(recomendar({ ...base, ventas30: 4 }).tipo, "sin_senales");
});
