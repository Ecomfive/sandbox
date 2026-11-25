import assert from "node:assert/strict";
import test from "node:test";
import { senalesDeModulos, senalesModulosParaIA, senalesVisibles, type DatosModulos } from "./senales-modulos";

const HOY = "2026-11-24";
const datos = (o: Partial<DatosModulos> = {}): DatosModulos => ({ stock: null, precios: [], competencia: { avisos: [], masBaratos: null }, test: null, ...o });

test("un producto sin inventario que sigue gastando es la señal más grave", () => {
  const s = senalesDeModulos(datos({ stock: { disponible: 0, enCamino: 0, salidas30: 40 }, precios: [{ precio: 20, margen: 0.1, ultimoCambio: null }] }), { hoy: HOY, cpaActual: 4, gasto14: 320 });
  assert.equal(s[0].tipo, "sin_stock");
  assert.equal(s[0].gravedad, "alta");
  assert.match(s[0].titulo, /\$320\.00/);
  assert.match(s[0].accion, /Pausar/);
  assert.ok(s.some((x) => x.tipo === "margen_bajo"), "y el margen de 10 % también se marca");
  const conCamino = senalesDeModulos(datos({ stock: { disponible: 0, enCamino: 200, salidas30: 0 } }), { hoy: HOY, cpaActual: null, gasto14: 100 });
  assert.match(conCamino[0].accion, /llegue el inventario/);
});

test("el inventario bajo se mide en días al ritmo de salida y sin ritmo no se inventa nada", () => {
  const poco = senalesDeModulos(datos({ stock: { disponible: 30, enCamino: 0, salidas30: 150 } }), { hoy: HOY, cpaActual: null, gasto14: 50 });
  assert.equal(poco[0].tipo, "poco_stock");
  assert.match(poco[0].titulo, /unos 6 días/);
  assert.equal(poco[0].gravedad, "alta", "sin nada en camino");
  assert.equal(senalesDeModulos(datos({ stock: { disponible: 500, enCamino: 0, salidas30: 150 } }), { hoy: HOY, cpaActual: null, gasto14: 50 }).length, 0, "100 días de inventario: bien");
  assert.equal(senalesDeModulos(datos({ stock: { disponible: 5, enCamino: 0, salidas30: 0 } }), { hoy: HOY, cpaActual: null, gasto14: 50 }).length, 0, "sin salidas no hay ritmo");
});

test("un cambio de precio reciente se señala con su fecha y uno viejo no", () => {
  const nuevo = senalesDeModulos(datos({ precios: [{ precio: 24.99, margen: 0.4, ultimoCambio: "2026-11-17" }] }), { hoy: HOY, cpaActual: null, gasto14: 50 });
  assert.equal(nuevo[0].tipo, "precio_cambio");
  assert.match(nuevo[0].titulo, /hace 7 días \(hoy \$24\.99\)/);
  assert.equal(senalesDeModulos(datos({ precios: [{ precio: 24.99, margen: 0.4, ultimoCambio: "2026-09-01" }] }), { hoy: HOY, cpaActual: null, gasto14: 50 }).length, 0);
  assert.equal(senalesDeModulos(datos({ precios: [{ precio: 10, margen: -0.7, ultimoCambio: null }] }), { hoy: HOY, cpaActual: null, gasto14: 50 })[0].gravedad, "alta", "un margen negativo es grave");
});

test("competidores más baratos, avisos recientes y el test mejor que hoy", () => {
  const s = senalesDeModulos(
    datos({ competencia: { avisos: [{ fecha: "2026-11-20", titulo: "Competidor nuevo X" }, { fecha: "2026-08-01", titulo: "Viejo" }], masBaratos: { competidores: 2, minimo: 14.5, nuestro: 19.99 } }, test: { fecha: "2026-09-10", cpa: 2.1, cvr: 5, estado: "winner" } }),
    { hoy: HOY, cpaActual: 4.5, gasto14: 200 },
  );
  assert.deepEqual(s.map((x) => x.tipo), ["mas_baratos", "competencia", "test_mejor"], "primero la media y luego las informativas");
  assert.match(s[0].titulo, /2 competidores venden el mismo producto más barato \(desde \$14\.50 frente a nuestros \$19\.99\)/);
  assert.match(s[2].titulo, /CPA fue \$2\.10; hoy es \$4\.50/);
  assert.match(s[2].detalle, /114 % más/);
  assert.match(s[1].detalle, /Competidor nuevo X/);
  assert.ok(!s[1].detalle.includes("Viejo"));
  // Un competidor apenas más barato no cuenta; y un test igual de bueno que hoy tampoco.
  assert.equal(senalesDeModulos(datos({ competencia: { avisos: [], masBaratos: { competidores: 1, minimo: 19, nuestro: 19.99 } }, test: { fecha: null, cpa: 4, cvr: null, estado: null } }), { hoy: HOY, cpaActual: 4.5, gasto14: 10 }).length, 0);
});

test("cada señal dice de qué módulo salió y solo se muestra a quien lo puede abrir", () => {
  const s = senalesDeModulos(datos({ stock: { disponible: 0, enCamino: 0, salidas30: 0 }, test: { fecha: null, cpa: 1, cvr: null, estado: null }, precios: [{ precio: 10, margen: 0.05, ultimoCambio: null }] }), { hoy: HOY, cpaActual: 4, gasto14: 100 });
  assert.deepEqual([...new Set(s.map((x) => x.modulo))].sort(), ["inventario", "productos-test", "publicaciones-dropi"]);
  assert.deepEqual(senalesVisibles(s, ["inventario"]).map((x) => x.modulo), ["inventario"]);
  assert.deepEqual(senalesVisibles(s, ["compras"]), []);
  assert.equal((senalesModulosParaIA(s) as { modulo: string }[])[0].modulo, "Inventario");
});
