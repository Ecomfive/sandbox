import { test } from "node:test";
import assert from "node:assert/strict";
import { dineroPorDia, dineroPorMes, lineasDeProducto, margen, repartir, utilidad, type OrdenDinero } from "./dinero";

test("líneas de producto y reparto en centavos", () => {
  assert.deepEqual(lineasDeProducto("1x TONICO TRULY GLAZED DONUT (B280) | 2x TONICO TRULY SOFT SERVE (B280)"), [
    { unidades: 1, nombre: "TONICO TRULY GLAZED DONUT (B280)" },
    { unidades: 2, nombre: "TONICO TRULY SOFT SERVE (B280)" },
  ]);
  assert.deepEqual(lineasDeProducto("Producto sin cantidad"), [{ unidades: 1, nombre: "Producto sin cantidad" }]);
  assert.deepEqual(repartir(10, [1, 1, 1]), [3.33, 3.33, 3.34]);
  assert.deepEqual(repartir(18.28, [0, 0]), [9.14, 9.14]);
  assert.equal(repartir(5, [2, 3]).reduce((a, b) => a + b, 0), 5);
});

test("la plata se reparte entre los productos de la orden y se suma por día y por mes", () => {
  const base: Omit<OrdenDinero, "productos" | "unidades" | "nombres"> = { dia: "2026-03-31", estatus: "ENTREGADO", ganancia: 18.28, comision: 1.5, coste: 5.36, descuentos: 0 };
  const ordenes: OrdenDinero[] = [
    { ...base, productos: [7854, 7652], unidades: [1, 1], nombres: ["A (B280)", "B (B280)"] },
    { ...base, dia: "2026-03-31", ganancia: 9.99, comision: 0, coste: 3.86, descuentos: 1, productos: [7854], unidades: [1], nombres: ["A (B280)"] },
    { ...base, dia: "2026-04-02", estatus: "DEVOLUCION", ganancia: 0, comision: 1.5, coste: 0, descuentos: 0, productos: [7854], unidades: [1], nombres: ["A (B280)"] },
  ];
  const precio = (id: number) => (id === 7854 ? 9 : 3);
  const costo = (_mes: string, nombre: string) => (nombre.startsWith("A") ? 4 : 1.36);
  const d = dineroPorDia(ordenes, precio, costo);
  const a = d.find((x) => x.producto === 7854 && x.dia === "2026-03-31")!;
  const b = d.find((x) => x.producto === 7652)!;
  // Ganancia 18.28 por precio 9:3 → 13.71 y 4.57; coste 5.36 por costo 4:1.36 → 4 y 1.36.
  assert.deepEqual([a.ganancia, b.ganancia], [23.7, 4.57]);
  assert.deepEqual([a.coste, b.coste], [7.86, 1.36]);
  assert.deepEqual([a.entregadas, a.unidades, a.descuentos], [2, 2, 1]);
  const dev = d.find((x) => x.dia === "2026-04-02")!;
  assert.deepEqual([dev.entregadas, dev.ganancia, dev.comision], [0, 0, 1.5]);
  const mes = dineroPorMes(d).get("2026-03")!;
  assert.equal(mes.ganancia, 28.27);
  assert.equal(mes.utilidad, Math.round(utilidad(mes) * 100) / 100);
  assert.equal(dineroPorMes(d, 7652).get("2026-03")!.coste, 1.36);
  assert.equal(margen({ ganancia: 0, comision: 0, coste: 0, descuentos: 0 }), null);
});
