import assert from "node:assert/strict";
import test from "node:test";
import { cuandoProgramado, fechaProgramada } from "./programado";

test("fecha programada: casos reales de las notas de Kenku", () => {
  assert.deepEqual(fechaProgramada("sitio de trabajo, puede recibir la proxima semana a patir del lunes 16/11", "2026-11-11"), {
    fecha: "2026-11-16",
    tipo: "desde", // «a patir» (con falta) también vale como «a partir»
    cita: "sitio de trabajo, puede recibir la proxima semana a patir del lunes 16/11",
  });
  assert.equal(fechaProgramada("Frente a la empresa Celmec a lado de la empresa procosa, para el jueves 19/11", "2026-11-11")?.fecha, "2026-11-19");
  assert.equal(fechaProgramada("pedido seria para el viernes 13", "2026-11-09")?.fecha, "2026-11-13");
  assert.deepEqual(fechaProgramada("Lo quiere a partir del 15 de noviembre", "2026-11-10"), { fecha: "2026-11-15", tipo: "desde", cita: "Lo quiere a partir del 15 de noviembre" });
  assert.equal(fechaProgramada("desde el 20/11/2026", "2026-11-10")?.tipo, "desde");
});

test("fecha programada: horas, teléfonos y lo relativo no son fechas", () => {
  assert.equal(fechaProgramada("sitio de trabajo, 8am a 4pm", "2026-11-11"), null);
  assert.equal(fechaProgramada("cliente recibe en su trabajo de lunes a viernes, en horario de 11am a 2pm", "2026-11-11"), null);
  assert.equal(fechaProgramada("Pedido #1564 Venta por bot - WhatsApp 6123-4567", "2026-11-11"), null);
  assert.equal(fechaProgramada("Si llega el lunes o el miércoles estoy en el trabajo", "2026-11-11"), null);
  assert.equal(fechaProgramada("sitio de trabajo, puede recibir a las 12 pm", "2026-11-11"), null);
  assert.equal(fechaProgramada("estoy el viernes 8am", "2026-11-11"), null);
  assert.equal(fechaProgramada("casa 15/40", "2026-11-11"), null);
  assert.equal(fechaProgramada(null, "2026-11-11"), null);
  // Un número de casa y el corregimiento «24 de Diciembre» no son fechas; «para el 24 de diciembre» sí.
  assert.equal(fechaProgramada("Calle 6 casa 24 / 9", "2026-10-30"), null);
  assert.equal(fechaProgramada("calle 4, Corregimiento de la 24 de Diciembre", "2026-12-01"), null);
  assert.equal(fechaProgramada("lo quiere para el 24 de diciembre", "2026-12-01")?.fecha, "2026-12-24");
});

test("fecha programada: cambio de mes y de año", () => {
  // «viernes 2» pedido el 28 nov: el 2 de diciembre.
  assert.equal(fechaProgramada("para el viernes 2", "2026-11-28")?.fecha, "2026-12-02");
  // 5/1 pedido en diciembre: enero del año siguiente.
  assert.equal(fechaProgramada("para el 5/1", "2026-12-20")?.fecha, "2027-01-05");
  assert.equal(cuandoProgramado("2026-11-13", "2026-11-12"), "mañana");
  assert.equal(cuandoProgramado("2026-11-09", "2026-11-12"), "hace 3 días");
  assert.equal(cuandoProgramado("2026-11-16", "2026-11-12"), "en 4 días");
});
