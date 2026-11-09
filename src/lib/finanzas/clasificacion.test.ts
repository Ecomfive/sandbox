import assert from "node:assert/strict";
import test from "node:test";
import { aprender, firma, normalizar, reglaPara, sugerir, type Regla } from "./clasificacion";

const R = (id: string, patron: string, unidad_id: string | null, tipo_id: string | null, activo = true): Regla => ({ id, patron, unidad_id, tipo_id, activo });

test("normalizar y firma ignoran acentos, signos y números", () => {
  assert.equal(normalizar("Comisión  transacciones Yappy #12"), "COMISION TRANSACCIONES YAPPY 12");
  assert.equal(firma("COMISION TRANSACCIONES YAPPY 1234"), firma("Comisión transacciones yappy 9876"));
  assert.equal(firma("14/08/- PAGO 2-ACH BANISTMO"), "PAGO ACH BANISTMO");
  assert.equal(firma("Compra En Comercio Facebk *X22"), "COMPRA COMERCIO FACEBK");
  assert.equal(firma("I/T-080426 I000595905"), "");
});

test("la regla más específica gana y solo calza palabras completas", () => {
  const reglas = [R("a", "YAPPY", null, "comisiones"), R("b", "COMISION TRANSACCIONES YAPPY", "oferfy", "comisiones"), R("c", "FACEBK", null, "facebook", false)];
  assert.equal(reglaPara("COMISION TRANSACCIONES YAPPY 33", reglas)?.id, "b");
  assert.equal(reglaPara("PAGO YAPPY", reglas)?.id, "a");
  assert.equal(reglaPara("YAPPYS SA", reglas), null);
  assert.equal(reglaPara("Compra Facebk *X", reglas), null); // inactiva
});

test("aprende solo lo que casi siempre fue igual y no aprende SIN ASIGNAR", () => {
  const hist = [
    ...Array.from({ length: 9 }, () => ({ descripcion: "COM ACH BEL CTE 1", unidad_id: "nuvo", tipo_id: "proc" })),
    { descripcion: "COM ACH BEL CTE 2", unidad_id: "sin", tipo_id: "otro" },
    { descripcion: "PAGO VARIOS", unidad_id: "kenku", tipo_id: "x" },
    { descripcion: "PAGO VARIOS", unidad_id: "nuvo", tipo_id: "y" },
    { descripcion: "PAGO VARIOS", unidad_id: "kenku", tipo_id: "x" },
  ];
  const a = aprender(hist, "sin");
  assert.equal(a.tipo.get("COM ACH BEL")?.id, "proc"); // 9 de 10 = 90 %
  assert.equal(a.unidad.get("COM ACH BEL")?.id, "nuvo"); // SIN ASIGNAR no cuenta
  assert.equal(a.tipo.get("PAGO VARIOS"), undefined); // 2 de 3: no alcanza
});

test("sugerir completa solo lo que falta: primero la regla, después lo aprendido", () => {
  const a = aprender(Array.from({ length: 4 }, () => ({ descripcion: "FEE CTA PLUS", unidad_id: "kenku", tipo_id: "comisiones" })), "sin");
  const reglas = [R("r1", "FEE CTA", null, "finanzas")];
  const s = sugerir({ descripcion: "FEE CTA PLUS 12", unidad_id: "sin", tipo_id: null }, "sin", reglas, a);
  assert.deepEqual([s.tipo_id, s.unidad_id, s.origen, s.regla_id], ["finanzas", "kenku", "regla", "r1"]);
  // Con tienda y tipo puestos no propone nada.
  assert.equal(sugerir({ descripcion: "FEE CTA PLUS", unidad_id: "nuvo", tipo_id: "t" }, "sin", reglas, a).origen, null);
  // Con la tienda puesta no la cambia.
  assert.equal(sugerir({ descripcion: "FEE CTA PLUS", unidad_id: "nuvo", tipo_id: null }, "sin", [], a).unidad_id, null);
});
