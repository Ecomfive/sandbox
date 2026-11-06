import assert from "node:assert/strict";
import { test } from "node:test";
import { quienesAutorizan, revisarCorreccion, textoCorreccion } from "./correccion-remision";

const autorizadores = [
  { perfil_id: "hernan", pais_id: null },
  { perfil_id: "alcides", pais_id: null },
  { perfil_id: "dinora", pais_id: "PA" },
  { perfil_id: "yanixia", pais_id: "CR" },
];

test("autorizan los de todos los países y el del país; nunca quien lo pidió", () => {
  assert.deepEqual(quienesAutorizan(autorizadores, "PA", "nicol"), ["hernan", "alcides", "dinora"]);
  assert.deepEqual(quienesAutorizan(autorizadores, "CR", "nicol"), ["hernan", "alcides", "yanixia"]);
  assert.deepEqual(quienesAutorizan(autorizadores, "CR", "yanixia"), ["hernan", "alcides"]);
  assert.deepEqual(quienesAutorizan(autorizadores, "MX", "nicol"), ["hernan", "alcides"]);
});

test("corregir lo recibido: 200 → 198, con motivo y sobre una línea recibida", () => {
  const recibida = { estado: "recibido", recibida: 200 };
  assert.deepEqual(revisarCorreccion(recibida, { tipo: "recibida", recibida: "198", motivo: "  Faltaron 2 en la caja  " }), { tipo: "recibida", recibida: 198, motivo: "Faltaron 2 en la caja" });
  assert.deepEqual(revisarCorreccion(recibida, { tipo: "recibida", recibida: 0, motivo: "No llegó nada" }), { tipo: "recibida", recibida: 0, motivo: "No llegó nada" });
  assert.match((revisarCorreccion(recibida, { tipo: "recibida", recibida: 200, motivo: "Motivo largo" }) as { error: string }).error, /misma cantidad/);
  assert.match((revisarCorreccion(recibida, { tipo: "recibida", recibida: "", motivo: "Motivo largo" }) as { error: string }).error, /cuántas unidades/);
  assert.match((revisarCorreccion(recibida, { tipo: "recibida", recibida: 1.5, motivo: "Motivo largo" }) as { error: string }).error, /cuántas unidades/);
  assert.match((revisarCorreccion(recibida, { tipo: "recibida", recibida: 198, motivo: "no" }) as { error: string }).error, /motivo/);
  assert.match((revisarCorreccion({ estado: "en_camino", recibida: null }, { tipo: "recibida", recibida: 198, motivo: "Motivo largo" }) as { error: string }).error, /ya se recibió/);
});

test("anular: solo lo que sigue en camino", () => {
  assert.deepEqual(revisarCorreccion({ estado: "en_camino", recibida: null }, { tipo: "anular", recibida: null, motivo: "No salió la carga" }), { tipo: "anular", recibida: null, motivo: "No salió la carga" });
  assert.match((revisarCorreccion({ estado: "recibido", recibida: 5 }, { tipo: "anular", recibida: null, motivo: "No salió la carga" }) as { error: string }).error, /sigue en camino/);
  assert.match((revisarCorreccion({ estado: "en_camino", recibida: null }, { tipo: "otra", recibida: null, motivo: "Motivo largo" }) as { error: string }).error, /no válida/);
});

test("el texto dice qué cambia", () => {
  assert.equal(textoCorreccion({ tipo: "recibida", recibidaAntes: 200, recibidaNueva: 198, enviada: 200 }), "Recibidas: 200 → 198");
  assert.equal(textoCorreccion({ tipo: "anular", recibidaAntes: null, recibidaNueva: null, enviada: 200 }), "Anular: vuelven 200 a la bodega");
});
