import assert from "node:assert/strict";
import { test } from "node:test";
import { FRENTES, construirAreas, encontrarSeccionActiva } from "./nav-data";
import { ICONOS_PAGINA } from "./nav-icons";

// Se corre con: npm run test:seguridad (incluye estas pruebas del menú)
const areas = construirAreas([{ nombre: "Dropi", tieneDatos: true }]);
const area = (titulo: string) => areas.find((a) => a.title === titulo);
const hrefs = (titulo: string) => (area(titulo)?.items ?? []).map((i) => i.href);

test("el riel tiene las áreas acordadas y Avisos va oculto", () => {
  assert.deepEqual(
    areas.filter((a) => !a.oculta).map((a) => a.title),
    ["Desempeño", "Testing Lab", "Marketing", "Clientes", "Investigación", "Operación", "Finanzas", "Equipo"],
  );
  assert.equal(area("Avisos")?.oculta, true);
});

test("hay tres frentes y el de tienda se llama Gestión de tienda", () => {
  assert.deepEqual(FRENTES.map((f) => f.titulo), ["Proveeduría", "Gestión de tienda", "Fulfillment"]);
});

test("Compras y Producto están en Operación, no en Marketing", () => {
  for (const ruta of ["/compras", "/producto"]) {
    assert.ok(hrefs("Operación").includes(ruta), `${ruta} en Operación`);
    assert.ok(!hrefs("Marketing").includes(ruta), `${ruta} no en Marketing`);
  }
});

test("Testing Lab: solo Proveeduría, con el recorrido del producto en secciones y en orden", () => {
  const lab = area("Testing Lab");
  assert.deepEqual(lab?.soloFrentes, ["proveeduria"]);
  assert.deepEqual(
    lab?.items.map((i) => `${i.grupo} › ${i.href}`),
    [
      "Fuentes › /drop-killer",
      "Fuentes › /tu-winner",
      "Fuentes › /scraping-proveedores",
      "Fuentes › /instagram",
      "Fuentes › /sugerencias-clientes",
      "Selección › /seleccion-productos",
      "Producción › /creacion-ofertas",
      "Resultados › /productos-test",
      "Resultados › /filtro-productos",
    ],
  );
  assert.ok(lab?.items.every((i) => i.frente === "proveeduria"));
});

test("Marketing sigue en el riel aunque todavía no tenga páginas", () => {
  assert.deepEqual(hrefs("Marketing"), []);
  assert.equal(area("Marketing")?.mostrarVacia, true);
});

test("CRM en Clientes e Inteligencia competitiva en Investigación", () => {
  assert.deepEqual(hrefs("Clientes"), ["/crm-dropshippers"]);
  assert.deepEqual(hrefs("Investigación"), ["/inteligencia-competitiva", "/analisis-competencia"]);
  assert.ok(!hrefs("Operación").includes("/filtro-productos"));
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
  assert.equal(encontrarSeccionActiva("/compras/nueva", areas), "Operación");
  assert.equal(encontrarSeccionActiva("/crm-dropshippers/casos", areas), "Clientes");
  assert.equal(encontrarSeccionActiva("/notificaciones", areas), "Avisos");
  assert.equal(encontrarSeccionActiva("/", areas), "Desempeño");
});

test("bodegas, ubicaciones, inventario, compras y producto son del frente Fulfillment; los pedidos de dropshippers, de Proveeduría", () => {
  const frenteDe = (ruta: string) => areas.flatMap((a) => a.items).find((i) => i.href === ruta)?.frente;
  for (const ruta of ["/wms-bodegas", "/wms-ubicaciones", "/inventario", "/alertas", "/compras", "/producto"]) {
    assert.equal(frenteDe(ruta), "fulfillment", ruta);
  }
  assert.equal(frenteDe("/pedidos-dropi"), "proveeduria");
});

test("las fichas de Shopify y de Dropi ya no están en el menú, pero siguen registradas (migas y buscador)", () => {
  const visibles = areas.filter((a) => !a.oculta).flatMap((a) => a.items.map((i) => i.href));
  assert.ok(!visibles.includes("/wms-productos"));
  assert.ok(!visibles.includes("/wms-productos-dropi"));
  const ocultas = areas.filter((a) => a.oculta).flatMap((a) => a.items.map((i) => i.href));
  assert.ok(ocultas.includes("/wms-productos") && ocultas.includes("/wms-productos-dropi"));
  assert.equal(encontrarSeccionActiva("/wms-productos/nuevo", areas), "Fichas de canal");
});

test("cada página del menú tiene su ícono", () => {
  const sinIcono = areas.flatMap((a) => a.items).filter((i) => i.href && !ICONOS_PAGINA[i.href]).map((i) => i.href);
  assert.deepEqual(sinIcono, []);
});
