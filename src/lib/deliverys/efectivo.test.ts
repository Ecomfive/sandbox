import assert from "node:assert/strict";
import test from "node:test";
import { cambiosTransportistas, efectivoDelCierre, leerOrdenesGuardadas, ordenesParaGuardar, repartidorDeTransportista } from "./efectivo";

const REPARTIDORES = [
  { id: "r1", nombre: "MARTINA PRUEBA", alias: ["ZONA 5 MARTINA", "CHORRERA"] },
  { id: "r2", nombre: "JULI DEMOSTRA", alias: [] },
  { id: "r3", nombre: "PEDRO EJEMPLO", alias: [] },
];

test("repartidorDeTransportista: zonas, una letra distinta y nombre corto", () => {
  assert.equal(repartidorDeTransportista("MARTINA ZONA 5", REPARTIDORES), "r1");
  assert.equal(repartidorDeTransportista("MARTINA CIUDAD", REPARTIDORES), "r1");
  assert.equal(repartidorDeTransportista("July Demostra", REPARTIDORES), "r2");
  assert.equal(repartidorDeTransportista("PEDRO EJEMPLO", REPARTIDORES), "r3");
  // No son personas o no se reconocen.
  assert.equal(repartidorDeTransportista("SERVIENTREGA", REPARTIDORES), null);
  assert.equal(repartidorDeTransportista("OFICINA", REPARTIDORES), null);
  assert.equal(repartidorDeTransportista("OTRA PERSONA", REPARTIDORES), null);
  // Dos repartidores que calzan: no se adivina.
  assert.equal(repartidorDeTransportista("PEDRO EJEMPLO", [...REPARTIDORES, { id: "r4", nombre: "PEDRO EJEMPLO SEGUNDO", alias: [] }]), null);
});

test("cambiosTransportistas: solo los nuevos y los automáticos que cambian; lo puesto a mano no se toca", () => {
  const c = cambiosTransportistas(
    ["MARTINA ZONA 5", "JULY DEMOSTRA", "OFICINA", "PEDRO EJEMPLO", "PEDRO EJEMPLO"],
    [
      { transportista: "MARTINA ZONA 5", repartidor_id: "r1", a_mano: false },
      { transportista: "JULY DEMOSTRA", repartidor_id: null, a_mano: false },
      { transportista: "PEDRO EJEMPLO", repartidor_id: "r1", a_mano: true },
    ],
    REPARTIDORES,
  );
  assert.deepEqual(c, [
    { transportista: "JULY DEMOSTRA", repartidor_id: "r2" },
    { transportista: "OFICINA", repartidor_id: null },
  ]);
});

test("efectivoDelCierre: lo cargado a mano manda; si no, las órdenes", () => {
  const ordenes = [
    { id: "o1", orden: "#10", tienda: "TIENDA UNO", fecha: "2026-09-03", monto: 25.5 },
    { id: "o2", orden: "#11", tienda: "TIENDA DOS", fecha: "2026-09-04", monto: 10.25 },
  ];
  assert.deepEqual(efectivoDelCierre({ hay: false, efectivo: 0 }, ordenes), { origen: "ordenes", monto: 35.75, deOrdenes: 35.75, ordenes });
  assert.deepEqual(efectivoDelCierre({ hay: true, efectivo: 30 }, ordenes), { origen: "manual", monto: 30, deOrdenes: 35.75, ordenes });
  assert.deepEqual(efectivoDelCierre({ hay: false, efectivo: 0 }, []), { origen: "ninguno", monto: 0, deOrdenes: 0, ordenes: [] });
});

test("leerOrdenesGuardadas: solo la forma esperada; ordenesParaGuardar quita el id", () => {
  const guardar = ordenesParaGuardar([{ id: "o1", orden: "#10", tienda: "T", fecha: "2026-09-03", monto: 5 }]);
  assert.deepEqual(guardar, [{ orden: "#10", tienda: "T", fecha: "2026-09-03", monto: 5 }]);
  assert.deepEqual(leerOrdenesGuardadas([...guardar, { orden: "", fecha: "2026-09-03" }, { orden: "#12", fecha: "mal" }, null, 3]), guardar);
  assert.deepEqual(leerOrdenesGuardadas("no"), []);
});
