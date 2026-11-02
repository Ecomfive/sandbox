import assert from "node:assert/strict";
import { test } from "node:test";
import { esFechaTarea, grupoDeTarea, llegoLoEsperado, textoAvisoTarea, tituloAvisoLlegada } from "./tareas";

test("cada tarea va en su grupo según su estado y su fecha", () => {
  const hoy = "2026-12-23";
  assert.equal(grupoDeTarea({ estado: "pendiente", vence: "2026-12-20" }, hoy), "atrasada");
  assert.equal(grupoDeTarea({ estado: "pendiente", vence: "2026-12-23" }, hoy), "hoy");
  assert.equal(grupoDeTarea({ estado: "pendiente", vence: "2026-12-24" }, hoy), "proxima");
  assert.equal(grupoDeTarea({ estado: "pendiente", vence: null }, hoy), "sin_fecha");
  assert.equal(grupoDeTarea({ estado: "esperando", vence: "2026-12-01" }, hoy), "esperando");
  assert.equal(grupoDeTarea({ estado: "hecha", vence: "2026-12-01" }, hoy), "hecha");
});

test("llega de verdad cuando una compra esperada tiene fecha de llegada o se completa; descartada o ajena, no", () => {
  const compras = [
    { id: "a", fechaLlegada: null, etapa: "tracking" },
    { id: "b", fechaLlegada: "2026-12-22", etapa: "arribo_mercancia" },
    { id: "c", fechaLlegada: null, etapa: "completado" },
    { id: "d", fechaLlegada: null, etapa: "descartado" },
  ];
  assert.equal(llegoLoEsperado(["a"], compras), false);
  assert.equal(llegoLoEsperado(["a", "b"], compras), true);
  assert.equal(llegoLoEsperado(["c"], compras), true);
  assert.equal(llegoLoEsperado(["d"], compras), false);
  assert.equal(llegoLoEsperado(["z"], compras), false, "una compra que no se esperaba no activa la tarea");
  assert.equal(llegoLoEsperado(null, compras), false);
});

test("textos de la tarea y de sus avisos", () => {
  assert.equal(tituloAvisoLlegada("Semilla de calabaza"), "Avisarle que llegó Semilla de calabaza");
  assert.deepEqual(textoAvisoTarea({ titulo: "Avisarle que llegó Semilla de calabaza", cliente: "Jandry" }, "llego"), {
    titulo: "Llegó lo que esperaba · Jandry",
    texto: "Avisarle que llegó Semilla de calabaza",
  });
  assert.equal(textoAvisoTarea({ titulo: "Llamarlo", cliente: null }, "hoy").titulo, "Tarea para hoy");
  assert.equal(esFechaTarea("2026-12-23"), true);
  assert.equal(esFechaTarea("23/12/2026"), false);
  assert.equal(esFechaTarea("2026-13-40"), false);
});
