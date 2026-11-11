import assert from "node:assert/strict";
import test from "node:test";
import { agrupar, cuadreConLibro, sumar, type FilaResumen } from "./resumen";

const fila = (o: Partial<FilaResumen>): FilaResumen => ({
  periodo: "2026-04-01",
  unidad_id: "u1",
  tienda: "TIENDA UNO",
  ordenes: 0,
  enviadas: 0,
  entregadas: 0,
  devueltas: 0,
  en_transito: 0,
  pendientes: 0,
  canceladas: 0,
  no_gestionadas: 0,
  ventas_brutas: 0,
  ventas_entregadas: 0,
  costo_mercancia: 0,
  costo_envio: 0,
  lineas_producto: 0,
  lineas_costo_vigente: 0,
  lineas_costo_excel: 0,
  ...o,
});

test("suma tiendas y recalcula tasas, ticket, margen y cobertura sin promediar porcentajes", () => {
  const a = fila({ ordenes: 100, enviadas: 80, entregadas: 60, ventas_entregadas: 2000, costo_mercancia: 300, costo_envio: 400, lineas_producto: 70, lineas_costo_vigente: 35, lineas_costo_excel: 30 });
  const b = fila({ unidad_id: "u2", tienda: "TIENDA DOS", ordenes: 10, enviadas: 10, entregadas: 2, ventas_entregadas: 50.5, costo_envio: 20, lineas_producto: 2 });
  const t = sumar([a, b]);
  assert.equal(t.ordenes, 110);
  assert.equal(t.entregadas, 62);
  assert.equal(t.ventas_entregadas, 2050.5);
  assert.equal(t.margen_bruto, 1330.5);
  assert.equal(t.ticket_promedio, 33.07);
  assert.equal(t.tasa_entrega, 62 / 90);
  assert.equal(t.tasa_sobre_ordenes, 62 / 110);
  assert.equal(t.cobertura_costo, 65 / 72);
  assert.equal(t.cobertura_vigente, 35 / 72);
  assert.equal(sumar([]).tasa_entrega, null);
  assert.equal(sumar([]).ticket_promedio, null);

  const porTienda = agrupar([a, b, fila({ periodo: "2026-05-01", ordenes: 5 })], (f) => f.tienda);
  assert.equal(porTienda.get("TIENDA UNO")?.ordenes, 105);
  assert.equal(porTienda.get("TIENDA DOS")?.ordenes, 10);
});

test("cuadre con el libro: diferencia por tienda y mes, y sin libro queda vacío", () => {
  const ventas = [
    fila({ ventas_entregadas: 1000, entregadas: 30 }),
    fila({ unidad_id: "u2", tienda: "TIENDA DOS", ventas_entregadas: 500, entregadas: 10 }),
  ];
  const cuadre = cuadreConLibro(ventas, [{ periodo: "2026-04-01", unidad_id: "u1", bruto: 1050, devoluciones: 20 }]);
  assert.deepEqual(cuadre[0], {
    periodo: "2026-04-01",
    unidad_id: "u2",
    tienda: "TIENDA DOS",
    ventas_entregadas: 500,
    entregadas: 10,
    ingresos_libro: null,
    devoluciones_libro: 0,
    diferencia: null,
    diferencia_pct: null,
  });
  assert.equal(cuadre[1].diferencia, -50);
  assert.equal(cuadre[1].devoluciones_libro, 20);
  assert.ok(Math.abs((cuadre[1].diferencia_pct ?? 0) - (-50 / 1050) * 100) < 1e-9);
});
