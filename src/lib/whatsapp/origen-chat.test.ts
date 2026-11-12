import { test } from "node:test";
import assert from "node:assert/strict";
import { bandera, dondeVende, nombrePais, paisDeNumeroEmpresa, paisesDondeVende, vendeEnPorPais } from "./origen-chat";

test("el país de un número de la empresa sale de su prefijo, solo para los países de la operación", () => {
  assert.equal(paisDeNumeroEmpresa("+50766367426"), "PA");
  assert.equal(paisDeNumeroEmpresa("+506 8888 7777"), "CR");
  assert.equal(paisDeNumeroEmpresa("5215512345678"), "MX");
  assert.equal(paisDeNumeroEmpresa("+584220350576"), null);
  assert.equal(paisDeNumeroEmpresa(null), null);
});

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

test("dónde vende agrupado por país: la bandera una vez y sus plataformas", () => {
  const vende = dondeVende([{ plataforma: "Dropi", pais: "PA" }, { plataforma: "Dropi", pais: "CR" }], [{ plataforma: "EFFI", pais: "CR" }, { plataforma: "Dropi", pais: "MX" }]);
  assert.deepEqual(
    vendeEnPorPais(vende).map((g) => [g.pais, g.plataformas.map((p) => p.plataforma)]),
    [
      ["CR", ["Dropi", "EFFI"]],
      ["MX", ["Dropi"]],
      ["PA", ["Dropi"]],
    ],
  );
  // Un país de su ficha sin plataforma conocida sale al final, sin plataformas; uno que ya está no se repite.
  assert.deepEqual(vendeEnPorPais(vende, ["GT", "PA", "x"]).map((g) => [g.pais, g.plataformas.length]), [["CR", 2], ["MX", 1], ["PA", 1], ["GT", 0]]);
  assert.deepEqual(vendeEnPorPais([]), []);
});

test("países donde vende, sin repetir", () => {
  assert.deepEqual(paisesDondeVende(["CR", null], [{ pais: "MX" }, { pais: "CR" }]), ["CR", "MX"]);
});

test("bandera y nombre del país", () => {
  assert.equal(bandera("PA"), "🇵🇦");
  assert.equal(bandera("x"), "");
  assert.equal(nombrePais("CR"), "Costa Rica");
});
