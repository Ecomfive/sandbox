import { test } from "node:test";
import assert from "node:assert/strict";
import { bandera, dondeVende, nombrePais, paisesDondeVende } from "./origen-chat";

test("dónde vende junta cuentas y lo puesto a mano, sin repetir", () => {
  assert.deepEqual(
    dondeVende([{ plataforma: "Dropi", pais: "PA" }, { plataforma: null, pais: "CR" }], [{ plataforma: "Dropi", pais: "PA" }, { plataforma: "EFFI", pais: "CR" }]),
    [
      { plataforma: "EFFI", pais: "CR", manual: true },
      { plataforma: "Dropi", pais: "PA", manual: false },
    ],
  );
});

test("una fila oculta quita lo de una cuenta, sin mirar mayúsculas", () => {
  assert.deepEqual(dondeVende([{ plataforma: "Dropi", pais: "PA" }, { plataforma: "Dropi", pais: "CR" }], [{ plataforma: "dropi", pais: "PA", oculto: true }]), [
    { plataforma: "Dropi", pais: "CR", manual: false },
  ]);
});

test("países donde vende, sin repetir", () => {
  assert.deepEqual(paisesDondeVende(["CR", null], [{ pais: "MX" }, { pais: "CR" }]), ["CR", "MX"]);
});

test("bandera y nombre del país", () => {
  assert.equal(bandera("PA"), "🇵🇦");
  assert.equal(bandera("x"), "");
  assert.equal(nombrePais("CR"), "Costa Rica");
});
