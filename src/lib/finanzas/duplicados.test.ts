import assert from "node:assert/strict";
import test from "node:test";
import { clavePar, detectarAtipicos, posiblesDuplicados } from "./duplicados";

test("duplicados: mismo monto, fechas cercanas y descripción parecida", () => {
  const movs = [
    { id: "b", fecha: "2026-03-10", monto: 120.5, descripcion: "PAGO HOSTING NUBE 1" },
    { id: "a", fecha: "2026-03-12", monto: 120.5, descripcion: "Pago hosting nube 2" },
    { id: "c", fecha: "2026-03-20", monto: 120.5, descripcion: "PAGO HOSTING NUBE 3" }, // 8 días: no
    { id: "d", fecha: "2026-03-11", monto: 120.5, descripcion: "ALQUILER LOCAL" }, // otra cosa
    { id: "e", fecha: "2026-03-11", monto: 2, descripcion: "COMISION" }, // muy chico
    { id: "f", fecha: "2026-03-11", monto: 2, descripcion: "COMISION" },
  ];
  const pares = posiblesDuplicados(movs);
  assert.deepEqual(pares.map((p) => p.clave), ["a|b"]);
  assert.equal(pares[0].dias, 2);
  assert.equal(clavePar("z", "a"), "a|z");
  // Marcado «no es duplicado»: no vuelve.
  assert.equal(posiblesDuplicados(movs, { descartados: new Set(["a|b"]) }).length, 0);
  // El mismo proveedor cuenta aunque la descripción no se parezca.
  const conProveedor = posiblesDuplicados([
    { id: "x", fecha: "2026-01-01", monto: 50, descripcion: "FACEBK *AB12", proveedor: "p1" },
    { id: "y", fecha: "2026-01-03", monto: 50, descripcion: "META PLATFORMS", proveedor: "p1" },
  ]);
  assert.equal(conProveedor.length, 1);
});

test("atípicos: más de 3 veces la mediana de los 6 meses anteriores", () => {
  const movs = [];
  const meses = ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"];
  let i = 0;
  for (const p of meses) for (const v of [100, 110, 90]) movs.push({ id: `m${i++}`, tipo_id: "luz", periodo: p, monto: v });
  movs.push({ id: "grande", tipo_id: "luz", periodo: "2026-05-01", monto: 900 });
  movs.push({ id: "normal", tipo_id: "luz", periodo: "2026-05-01", monto: 130 });
  movs.push({ id: "otro", tipo_id: "nuevo", periodo: "2026-05-01", monto: 5000 }); // sin historia: no se juzga
  const at = detectarAtipicos(movs);
  assert.deepEqual([...at.keys()], ["grande"]);
  assert.equal(at.get("grande")!.mediana, 100);
  assert.equal(at.get("grande")!.veces, 9);
  // El primer mes no tiene referencia.
  assert.equal(at.has("m0"), false);
});
