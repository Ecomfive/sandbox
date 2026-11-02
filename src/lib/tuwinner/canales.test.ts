import assert from "node:assert/strict";
import { test } from "node:test";
import { agruparGanadores, contarMenciones } from "./canales";

test("el mismo producto en Panamá y México se junta por su SKU o por el nombre", () => {
  const g = agruparGanadores([
    { pais: "PA", dropiId: "11253", nombre: "DRENAJE LINFÁTICO", ventas7: 1621, skuId: "sku-drenaje" },
    { pais: "MX", dropiId: "58447", nombre: "Drenaje Linfático Gota D Apoyo Linfático", ventas7: 2468, skuId: "sku-drenaje" },
    { pais: "MX", dropiId: "60001", nombre: "Tobillera Recargable Masajeador", ventas7: 597, skuId: null },
    { pais: "PA", dropiId: "70001", nombre: "Tobillera recargable masajeador térmica", ventas7: 40, skuId: null },
    { pais: "PA", dropiId: "10593", nombre: "Antena de TV para Smart TV", ventas7: 218, skuId: "sku-antena" },
  ]);
  assert.equal(g.length, 3);
  const drenaje = g.find((x) => x.skuId === "sku-drenaje")!;
  assert.deepEqual(drenaje.ventas, { PA: 1621, MX: 2468 });
  // El nombre del grupo es el del que más vende.
  assert.equal(drenaje.nombre, "Drenaje Linfático Gota D Apoyo Linfático");
  const tobillera = g.find((x) => x.nombre.startsWith("Tobillera"))!;
  assert.deepEqual(tobillera.ventas, { PA: 40, MX: 597 });
  assert.equal(tobillera.miembros.length, 2);
});

test("cuántas veces nombra cada fuente un producto (una vez por texto)", () => {
  const c = contarMenciones(
    [
      { clave: "a", nombre: "Tobillera Recargable Masajeador" },
      { clave: "b", nombre: "Colágeno NeoCell" },
      { clave: "c", nombre: "Antena" },
    ],
    [
      "TOBILLERA MASAJEADOR RECARGABLE PARA DOLOR",
      "¿Te duele el tobillo? Nuestra tobillera recargable masajeador alivia en minutos. Tobillera recargable masajeador.",
      "Colageno NeoCell Bio Peptides",
      "Antena digital",
      "Masajeador de pies",
    ],
  );
  assert.equal(c.get("a"), 2);
  assert.equal(c.get("b"), 1);
  // Una sola palabra no dice qué producto es.
  assert.equal(c.get("c"), undefined);
});
