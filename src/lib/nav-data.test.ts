import assert from "node:assert/strict";
import { test } from "node:test";
import { FRENTES, agruparPaginas, colapsarGestionDeIds, construirAreas, encontrarSeccionActiva, paginaInicialDe } from "./nav-data";
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
      "Producción › /generador-landings",
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
  assert.deepEqual(hrefs("Clientes"), ["/crm-dropshippers", "/crm-dropshippers/bandeja"]);
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

test("sin acceso a una página, la persona cae en la primera suya y nunca en el módulo que la rechazó", () => {
  assert.equal(paginaInicialDe(["dashboard", "compras"]), "/");
  assert.equal(paginaInicialDe(["dashboard", "compras"], "dashboard"), "/compras");
  const sola = paginaInicialDe(["compras"]);
  assert.equal(sola, "/compras");
  // Un rol con un solo módulo cuyas pestañas están todas ocultas no tiene a dónde ir: se queda sin página.
  assert.equal(paginaInicialDe(["compras"], "compras"), null);
  assert.equal(paginaInicialDe([]), null);
});

test("Finanzas es el Portal AF4 360°: sin frentes y agrupado por función", () => {
  const fin = area("Finanzas");
  assert.equal(fin?.panel, "Portal AF4 360°");
  assert.ok(!fin?.frentes);
  assert.deepEqual(
    agruparPaginas(fin?.items ?? []).map((g) => g.grupo),
    ["Dirección", "Tesorería", "Contabilidad y cierre", "Comercial", "Proveeduría Dropi"],
  );
  assert.equal(fin?.items[0].href, "/panel-financiero");
  assert.ok(fin?.items.every((i) => i.grupo), "toda página de Finanzas tiene su grupo");
  assert.equal(encontrarSeccionActiva("/panel-financiero/informe", areas), "Finanzas");
  assert.equal(encontrarSeccionActiva("/proyeccion-caja/precision", areas), "Finanzas");
});

test("agruparPaginas: las sin grupo primero y los grupos en el orden en que aparecen", () => {
  const g = agruparPaginas([
    { label: "B", href: "/b", grupo: "Uno" },
    { label: "A", href: "/a" },
    { label: "C", href: "/c", grupo: "Dos" },
    { label: "D", href: "/d", grupo: "Uno" },
  ]);
  assert.deepEqual(
    g.map((x) => [x.grupo, x.items.map((i) => i.href)]),
    [
      [null, ["/a"]],
      ["Uno", ["/b", "/d"]],
      ["Dos", ["/c"]],
    ],
  );
});

test("sin Dropi, Finanzas no muestra el grupo de proveeduría Dropi", () => {
  const sinDropi = construirAreas([{ nombre: "Dropi", tieneDatos: false }]);
  const grupos = agruparPaginas(sinDropi.find((a) => a.title === "Finanzas")?.items ?? []).map((g) => g.grupo);
  assert.ok(!grupos.includes("Proveeduría Dropi"));
});

test("pestañas de Rentabilidad: juntadas en grupos, cada página en uno solo", async () => {
  const { gruposDePestanas, pestanasDe } = await import("./pestanas");
  const grupos = gruposDePestanas(pestanasDe("/rentabilidad"))!;
  assert.deepEqual(
    grupos.map((g) => [g.etiqueta, g.pestanas.length]),
    [["Rentabilidad", 1], ["Unidad económica", 5], ["Inventario y compras", 4], ["Capital y valor", 2]],
  );
  assert.equal(grupos[1].href, "/rentabilidad/productos");
  assert.equal(gruposDePestanas(pestanasDe("/retiros")), null);
});

test("Gestión de IDs es una sola entrada del menú que sigue a la plataforma elegida y se marca activa en las tres rutas", () => {
  const todos = { plataforma: "drop" as const, codigoPais: "CR", modulos: null };
  const menu = colapsarGestionDeIds(areas, todos);
  const items = menu.flatMap((a) => a.items).filter((i) => i.href?.startsWith("/publicaciones-"));
  assert.equal(items.length, 1);
  assert.equal(items[0].label, "Gestión de IDs");
  assert.equal(items[0].href, "/publicaciones-drop");
  // La entrada se queda en su sitio del menú, junto a Pedidos Dropi.
  const operacion = menu.find((a) => a.title === "Operación")!.items.map((i) => i.label);
  assert.equal(operacion.indexOf("Gestión de IDs"), operacion.indexOf("Pedidos Dropi") + 1);
  assert.equal(encontrarSeccionActiva("/publicaciones-effi/tareas", menu), "Operación");
  assert.equal(encontrarSeccionActiva("/publicaciones-dropi", menu), "Operación");
  // Con otro país solo existe Dropi; sin el módulo de la elegida, la primera que pueda abrir.
  assert.equal(colapsarGestionDeIds(areas, { ...todos, codigoPais: "PA" }).flatMap((a) => a.items).find((i) => i.label === "Gestión de IDs")!.href, "/publicaciones-dropi");
  assert.equal(colapsarGestionDeIds(areas, { ...todos, modulos: ["publicaciones-effi"] }).flatMap((a) => a.items).find((i) => i.label === "Gestión de IDs")!.href, "/publicaciones-effi");
  // El menú original no cambia: las migas y el buscador siguen viendo las cuatro páginas (Dropi, Drop, Effi y Dunamixfy).
  assert.equal(areas.flatMap((a) => a.items).filter((i) => i.href?.startsWith("/publicaciones-")).length, 4);
  assert.equal(encontrarSeccionActiva("/publicaciones-dunamixfy", menu), "Operación");
});
