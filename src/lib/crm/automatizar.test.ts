import assert from "node:assert/strict";
import test from "node:test";
import { buscarDuplicados, entregasPor, pasoDeHoy, sumarEntregas, tonoEntrega, type FilaEntregas } from "./automatizar";

const fila = (d: string | null, t: string, entregados: number, devueltos: number, extra: Partial<FilaEntregas> = {}): FilaEntregas => ({
  dropshipperId: d,
  transportadora: t,
  pedidos: entregados + devueltos + (extra.cancelados ?? 0) + (extra.enCamino ?? 0),
  entregados,
  devueltos,
  cancelados: 0,
  novedades: 0,
  enCamino: 0,
  ...extra,
});

test("tasa de entrega: entregados entre cerrados, y el tono solo con 10 cerrados", () => {
  const e = sumarEntregas([fila("a", "HL", 40, 10), fila("a", "SERVI", 5, 5, { cancelados: 3 })]);
  assert.equal(e.entregados, 45);
  assert.equal(e.cancelados, 3);
  assert.equal(e.tasa, 45 / 60);
  assert.equal(tonoEntrega(e), "aviso");
  assert.equal(tonoEntrega(sumarEntregas([fila("b", "HL", 3, 0)])), "neutro");
  assert.equal(tonoEntrega(sumarEntregas([fila("b", "HL", 20, 2)])), "exito");
  assert.equal(tonoEntrega(sumarEntregas([fila("b", "HL", 10, 10)])), "peligro");
  assert.equal(sumarEntregas([]).tasa, null);
});

test("agrupa por dropshipper (sin los no vinculados) y dice su transportadora principal", () => {
  const filas = [fila("a", "HL", 40, 10), fila("a", "SERVI", 5, 5), fila(null, "HL", 100, 0), fila("b", "SERVI", 8, 2)];
  const porDs = entregasPor(filas, (f) => f.dropshipperId);
  assert.deepEqual([...porDs.keys()], ["a", "b"]);
  assert.equal(porDs.get("a")?.principal, "HL");
  const porT = entregasPor(filas, (f) => f.transportadora);
  assert.equal(porT.get("HL")?.entregados, 140);
});

test("duplicados por WhatsApp (sin código de país), correo, nombre y tienda; une los grupos", () => {
  const g = buscarDuplicados([
    { id: "1", nombre: "José Pérez", telefono: "+507 6123-4567", telefonoAlterno: null, correo: null, tiendas: [] },
    { id: "2", nombre: "Jose Perez ", telefono: null, telefonoAlterno: "61234567", correo: "jp@x.com", tiendas: [] },
    { id: "3", nombre: "Otra", telefono: null, telefonoAlterno: null, correo: "JP@x.com", tiendas: ["Tienda Luna"] },
    { id: "4", nombre: "Maria", telefono: null, telefonoAlterno: null, correo: null, tiendas: ["tienda luna!"] },
    { id: "5", nombre: "Ana", telefono: null, telefonoAlterno: null, correo: null, tiendas: [] },
    { id: "6", nombre: "Ana", telefono: null, telefonoAlterno: null, correo: null, tiendas: [] },
  ]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].ids.sort(), ["1", "2", "3", "4"]);
  assert.deepEqual(g[0].motivos, ["telefono", "correo", "tienda", "nombre"]);
  // «Ana» tiene menos de 4 letras: no cuenta como nombre repetido.
  assert.ok(!g.some((x) => x.ids.includes("5")));
});

test("secuencia de alta: el paso más nuevo vencido, salta los anteriores y para con el primer pedido", () => {
  assert.deepEqual(pasoDeHoy(0, [], false), { crear: null, saltar: [] });
  assert.deepEqual(pasoDeHoy(1, [], false), { crear: 1, saltar: [] });
  assert.deepEqual(pasoDeHoy(2, [1], false), { crear: null, saltar: [] });
  assert.deepEqual(pasoDeHoy(8, [1], false), { crear: 7, saltar: [3] });
  assert.deepEqual(pasoDeHoy(14, [1, 3, 7], false), { crear: 14, saltar: [] });
  assert.deepEqual(pasoDeHoy(5, [1], true), { crear: null, saltar: [] });
  assert.deepEqual(pasoDeHoy(25, [], false), { crear: null, saltar: [] });
});
