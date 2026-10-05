import assert from "node:assert/strict";
import { test } from "node:test";
import { FRENTES, construirAreas, encontrarSeccionActiva } from "./nav-data";

// Se corre con: npm run test:seguridad (incluye estas pruebas del menú)
const areas = construirAreas([{ nombre: "Dropi", tieneDatos: true }]);
const area = (titulo: string) => areas.find((a) => a.title === titulo);
const hrefs = (titulo: string) => (area(titulo)?.items ?? []).map((i) => i.href);

test("el riel tiene las áreas acordadas y Avisos va oculto", () => {
  assert.deepEqual(
    areas.filter((a) => !a.oculta).map((a) => a.title),
    ["Desempeño", "Marketing", "Operación", "Finanzas", "Equipo"],
  );
  assert.equal(area("Avisos")?.oculta, true);
});

test("hay tres frentes y el de tienda se llama Gestión de tienda", () => {
  assert.deepEqual(FRENTES.map((f) => f.titulo), ["Proveeduría", "Gestión de tienda", "Fulfillment"]);
});

test("Compras, el catálogo y las fichas de producto están en Operación, no en Marketing", () => {
  for (const ruta of ["/compras", "/catalogo-maestro", "/wms-productos", "/wms-productos-dropi"]) {
    assert.ok(hrefs("Operación").includes(ruta), `${ruta} en Operación`);
    assert.ok(!hrefs("Marketing").includes(ruta), `${ruta} no en Marketing`);
  }
  assert.ok(hrefs("Marketing").includes("/productos-test"), "Productos Test sigue en Marketing");
});

test("Usuarios y roles queda afuera de los frentes", () => {
  const usuarios = area("Equipo")?.items.find((i) => i.href === "/usuarios");
  assert.ok(usuarios);
  assert.equal(usuarios.frente, undefined);
});

test("toda página de un área con frentes tiene uno válido (salvo las generales)", () => {
  const validos = new Set(FRENTES.map((f) => f.id));
  for (const a of areas.filter((x) => x.frentes)) {
    for (const i of a.items) assert.ok(i.frente === undefined || validos.has(i.frente), `${i.label}`);
  }
});

test("ninguna página sale dos veces en el menú", () => {
  const todas = areas.flatMap((a) => a.items.map((i) => i.href));
  assert.equal(new Set(todas).size, todas.length);
});

test("una página de Dropi se oculta si Dropi no tiene datos en el país", () => {
  const sinDropi = construirAreas([{ nombre: "Dropi", tieneDatos: false }]);
  const ops = sinDropi.find((a) => a.title === "Operación")?.items.map((i) => i.href);
  assert.ok(!ops?.includes("/pedidos-dropi"));
  assert.ok(ops?.includes("/compras"));
});

test("el área activa se encuentra por la ruta, también en una subpágina", () => {
  assert.equal(encontrarSeccionActiva("/compras/filtros", areas), "Operación");
  assert.equal(encontrarSeccionActiva("/crm-dropshippers/casos", areas), "Marketing");
  assert.equal(encontrarSeccionActiva("/notificaciones", areas), "Avisos");
  assert.equal(encontrarSeccionActiva("/", areas), "Desempeño");
});

test("bodegas, ubicaciones, inventario y producto son del frente Fulfillment; los pedidos de dropshippers, de Proveeduría", () => {
  const frenteDe = (ruta: string) => areas.flatMap((a) => a.items).find((i) => i.href === ruta)?.frente;
  for (const ruta of ["/wms-bodegas", "/wms-ubicaciones", "/inventario", "/alertas", "/catalogo-maestro", "/wms-productos", "/wms-productos-dropi"]) {
    assert.equal(frenteDe(ruta), "fulfillment", ruta);
  }
  assert.equal(frenteDe("/pedidos-dropi"), "proveeduria");
});
