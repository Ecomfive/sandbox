import assert from "node:assert/strict";
import { test } from "node:test";
import { evaluarAsistente, type DatosAsistente } from "./asistente";

const base = (d: Partial<DatosAsistente> = {}): DatosAsistente => ({
  fase: "por_confirmar",
  etiquetas: "CIUDAD",
  cliente: { nombre: "Ana", telefono: "+50761234567", direccion: "Calle 5, casa 12, frente al parque", corregimiento: "Ancón" },
  anteriores: [],
  tienda: { entregados: 70, devueltos: 30 },
  zona: { entregados: 8, devueltos: 2 },
  repartidor: { nombre: "Aníbal Pérez", entregas: 6 },
  servientrega: { entregadas: 180, devueltas: 40 },
  whatsapp: { existe: false, ultimoDelCliente: null },
  ...d,
});

test("cliente nuevo: riesgo bajo, la tienda y su zona con sus cifras", () => {
  const a = evaluarAsistente(base());
  assert.equal(a.riesgo, "bajo");
  const r = a.partes[0].lineas.map((l) => l.texto);
  assert.match(r[0], /cliente nuevo/);
  assert.match(r[1], /70 %.*70 de 100/);
  assert.match(r[2], /En Ancón se entrega el 80 %: 8 de 10/);
});

test("riesgo alto con devoluciones: no despachar sin confirmación expresa", () => {
  const a = evaluarAsistente(base({ anteriores: ["devuelta", "devuelta", "entregada"] }));
  assert.equal(a.riesgo, "alto");
  assert.equal(a.partes[0].nivel, "mal");
  assert.ok(a.partes[0].lineas.some((l) => /confirmación expresa/.test(l.texto)));
});

test("una zona que entrega bastante menos que la tienda pide llamar antes", () => {
  const a = evaluarAsistente(base({ zona: { entregados: 3, devueltos: 7 } }));
  assert.equal(a.partes[0].nivel, "aviso");
  assert.ok(a.partes[0].lineas.some((l) => /Llamar antes/.test(l.texto)));
});

test("dirección: faltan datos o es muy corta", () => {
  const d = evaluarAsistente(base({ etiquetas: "", cliente: { nombre: "A", telefono: "", direccion: "Casa", corregimiento: null } })).partes[1];
  assert.equal(d.nivel, "mal");
  assert.ok(d.lineas.some((l) => /Sin etiqueta de zona/.test(l.texto)));
  assert.ok(d.lineas.some((l) => /muy corta/.test(l.texto)));
  assert.ok(d.lineas.some((l) => /Falta el teléfono/.test(l.texto)));
});

test("transportadora: ciudad con el repartidor que más entrega allí; interior con Servientrega", () => {
  assert.match(evaluarAsistente(base()).partes[2].lineas[0].texto, /Aníbal Pérez.*Ancón \(6/);
  assert.match(evaluarAsistente(base({ etiquetas: "INTERIOR/SERVIENTREGA" })).partes[2].lineas[0].texto, /Servientrega: entregó 180 de 220/);
  assert.match(evaluarAsistente(base({ repartidor: null })).partes[2].lineas[0].texto, /no hay entregas registradas/);
});

test("pedido y conversación, y la frase de abajo", () => {
  const sin = evaluarAsistente(base());
  assert.match(sin.partes[3].lineas[0].texto, /todavía no ha confirmado/);
  assert.match(sin.resumen, /Falta que el cliente confirme/);
  assert.match(evaluarAsistente(base({ etiquetas: "CIUDAD, Pendiente" })).partes[3].lineas[0].texto, /En gestión: Pendiente/);
  assert.match(evaluarAsistente(base({ etiquetas: "CIUDAD, Confirmada" })).resumen, /listo para preparar/);
  assert.match(evaluarAsistente(base({ fase: "entregada" })).resumen, /Ya salió/);
  assert.match(evaluarAsistente(base({ whatsapp: { existe: true, ultimoDelCliente: "2026-11-10T10:00:00Z" } })).partes[3].lineas[1].texto, /2026-11-10/);
});

test("en un pedido que ya salió no se recomienda llamar antes de despachar", () => {
  const a = evaluarAsistente(base({ fase: "entregada", anteriores: ["devuelta", "devuelta", "entregada"] }));
  assert.equal(a.riesgo, "alto");
  assert.ok(!a.partes[0].lineas.some((l) => /despachar/.test(l.texto)));
});
