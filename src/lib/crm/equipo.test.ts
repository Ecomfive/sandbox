import assert from "node:assert/strict";
import test from "node:test";
import { armarEquipo, duracionCorta, tonoRespuesta, tramoDeEspera } from "./equipo";

const AHORA = Date.parse("2026-10-30T15:00:00Z");
const hace = (min: number) => new Date(AHORA - min * 60_000).toISOString();

test("tramos de espera", () => {
  assert.equal(tramoDeEspera(5), 0);
  assert.equal(tramoDeEspera(15), 1);
  assert.equal(tramoDeEspera(59), 2);
  assert.equal(tramoDeEspera(60), 3);
  assert.equal(tramoDeEspera(5000), 4);
});

test("tono de la respuesta frente a la meta de 15 min", () => {
  assert.equal(tonoRespuesta(null), "neutro");
  assert.equal(tonoRespuesta(15), "exito");
  assert.equal(tonoRespuesta(25), "aviso");
  assert.equal(tonoRespuesta(31), "peligro");
});

test("duración corta", () => {
  assert.equal(duracionCorta(null), "—");
  assert.equal(duracionCorta(8.4), "8 min");
  assert.equal(duracionCorta(80), "1 h 20 min");
  assert.equal(duracionCorta(60 * 51), "2 d 3 h");
});

test("arma una fila por persona con respuestas, chats, tareas y cartera", () => {
  const eq = armarEquipo({
    personas: [
      { id: "a", nombre: "Nicol Muñoz", area: "atencion" },
      { id: "b", nombre: "Laura", area: "comercial" },
      { id: "c", nombre: "Pedro", area: "atencion" },
    ],
    respuestas: [
      { persona: "Nicol Munoz", enviados: 40, respondidas: 12, mediana_min: 9.5, en_15_min: 10 },
      { persona: "Desde el celular", enviados: 3, respondidas: 1, mediana_min: 4, en_15_min: 1 },
    ],
    chats: [
      { area: "atencion", asignadaA: "a", abierta: true, esperandoDesde: hace(40) },
      { area: "atencion", asignadaA: "a", abierta: true, esperandoDesde: null },
      { area: "comercial", asignadaA: "b", abierta: false, esperandoDesde: hace(10) },
      { area: "comercial", asignadaA: null, abierta: true, esperandoDesde: hace(300) },
    ],
    tareas: [
      { responsableId: "b", estado: "pendiente", vence: "2026-10-28", hechaEn: null },
      { responsableId: "b", estado: "pendiente", vence: "2026-11-02", hechaEn: null },
      { responsableId: "b", estado: "hecha", vence: null, hechaEn: "2026-10-29T10:00:00Z" },
      { responsableId: "b", estado: "hecha", vence: null, hechaEn: "2026-09-01T10:00:00Z" },
    ],
    clientes: [
      { responsable: "Laura", segmento: "activo", pedidos30: 50, pedidos30Antes: 40 },
      { responsable: "Laura", segmento: "dormido", pedidos30: 0, pedidos30Antes: 9 },
      { responsable: null, segmento: "activo", pedidos30: 5, pedidos30Antes: 5 },
    ],
    ahora: AHORA,
    hoy: "2026-10-30",
    desde: "2026-10-01",
  });
  const [nicol, laura, pedro] = eq.filas;
  assert.equal(nicol.nombre, "Nicol Muñoz");
  assert.equal(nicol.respondidas, 12);
  assert.equal(nicol.asignados, 2);
  assert.equal(nicol.esperando, 1);
  assert.equal(Math.round(nicol.esperaMaxMin ?? 0), 40);
  assert.equal(laura.tareasPendientes, 2);
  assert.equal(laura.tareasAtrasadas, 1);
  assert.equal(laura.tareasHechas, 1);
  assert.equal(laura.cartera, 2);
  assert.equal(laura.carteraEnRiesgo, 1);
  assert.equal(laura.pedidos30, 50);
  assert.equal(pedro.conActividad, false);
  assert.deepEqual(eq.otras.map((o) => o.persona), ["Desde el celular"]);
  assert.deepEqual(eq.sinAsignar, { abiertos: 1, esperando: 1 });
  assert.equal(eq.tramos[2].total, 1);
  assert.equal(eq.tramos[4].porArea.comercial, 1);
});
