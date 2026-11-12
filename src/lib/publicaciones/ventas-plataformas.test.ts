import assert from "node:assert/strict";
import test from "node:test";
import { armarVentasPlataforma, resumenVentasPlataforma, textoEtiquetas, type PublicacionPlataforma } from "./ventas-plataformas";
import { agruparProductos, netas, resumirProductos } from "./ventas";

const sku = { codigo: "ACEITE/BATANA", nombre: "Aceite de batana", numero: 7, barras: null };
const pub = (x: Partial<PublicacionPlataforma>): PublicacionPlataforma => ({ idPlataforma: "a1", nombre: "Batana", etiqueta: "BAT-1", stock: 40, activa: true, sku, ...x });

test("cada artículo de Drop recibe su propio número y su etiqueta", () => {
  const r = armarVentasPlataforma("drop", [pub({}), pub({ idPlataforma: "b2", etiqueta: "OTRO", sku: null })], [{ producto: "a1", dia: "2026-11-01", salidas: 5, devueltas: 1 }]);
  assert.equal(r.productos.length, 2);
  const [a, b] = r.productos;
  assert.ok(a.id > 1_000_000 && b.id !== a.id);
  assert.equal(r.etiquetaDe.get(a.id), "Drop · BAT-1");
  assert.equal(r.skuDe.get(a.id)?.codigo, "ACEITE/BATANA");
  assert.equal(r.skuDe.has(b.id), false);
  assert.deepEqual(r.dias, [{ producto: a.id, dia: "2026-11-01", pedidas: 5, ordenes: 5, canceladas: 0, rechazadas: 0, devueltas: 1 }]);
  assert.equal(netas(r.dias[0]), 4);
  assert.equal(a.primeraVenta, "2026-11-01");
  assert.equal(r.ultimoDia, "2026-11-01");
});

test("un artículo que vendió sin publicación sale igual, con su id", () => {
  const r = armarVentasPlataforma("effi", [], [{ producto: "34", dia: "2026-11-02", salidas: 3, devueltas: 0 }]);
  assert.equal(r.productos[0].nombre, "Artículo 34");
  assert.equal(r.productos[0].lista, "archivado");
  assert.equal(r.etiquetaDe.get(r.productos[0].id), "Effi · 34");
});

test("Drop y Effi no chocan entre sí ni con los IDs de Dropi", () => {
  const d = armarVentasPlataforma("drop", [pub({})], []);
  const e = armarVentasPlataforma("effi", [pub({})], []);
  assert.notEqual(d.productos[0].id, e.productos[0].id);
  assert.ok(d.productos[0].id > 999_999);
});

test("en «Todas», el mismo producto del sistema junta Dropi, Drop y Effi", () => {
  const d = armarVentasPlataforma("drop", [pub({})], [{ producto: "a1", dia: "2026-11-05", salidas: 4, devueltas: 0 }]);
  const e = armarVentasPlataforma("effi", [pub({ idPlataforma: "9", etiqueta: "9" })], [{ producto: "9", dia: "2026-11-05", salidas: 6, devueltas: 1 }]);
  const dropi = { id: 7591, nombre: "Batana", lista: "activo" as const, privado: false, variable: false, stock: 10, primeraVenta: null, ultimaVenta: null };
  const productos = [dropi, ...d.productos, ...e.productos];
  const dias = [{ producto: 7591, dia: "2026-11-05", pedidas: 2, ordenes: 2, canceladas: 0, rechazadas: 0, devueltas: 0 }, ...d.dias, ...e.dias];
  const skuDe = new Map([[7591, sku], ...d.skuDe, ...e.skuDe]);
  const g = agruparProductos(productos, dias, (id) => (skuDe.get(id) ? { clave: skuDe.get(id)!.codigo, nombre: skuDe.get(id)!.nombre } : null));
  const r = resumirProductos(g.productos, g.dias, "2026-11-09");
  assert.equal(r.length, 1);
  assert.equal(r[0].netas30, 2 + 4 + 5);
  assert.equal(r[0].stock, 10 + 40 + 40);
  assert.equal(textoEtiquetas(g.ids.get(r[0].id)!, new Map([...d.etiquetaDe, ...e.etiquetaDe])), "Dropi · ID 7591, Drop · BAT-1, Effi · 9");
});

test("la ficha: netas de 30 días hasta el último día leído y en total, con la primera y la última venta", () => {
  const r = resumenVentasPlataforma(
    [
      { dia: "2026-09-10", salidas: 10, devueltas: 0 },
      { dia: "2026-10-14", salidas: 5, devueltas: 2 },
      { dia: "2026-11-09", salidas: 4, devueltas: 1 },
      { dia: "2026-11-10", salidas: 0, devueltas: 3 },
    ],
    "2026-11-10",
  );
  // Del 12 oct al 10 nov: 5 − 2 + 4 − 1 − 3.
  assert.deepEqual(r, { netas30: 3, netasTotal: 13, primeraVenta: "2026-09-10", ultimaVenta: "2026-11-09" });
  assert.deepEqual(resumenVentasPlataforma([], null), { netas30: 0, netasTotal: 0, primeraVenta: null, ultimaVenta: null });
});
