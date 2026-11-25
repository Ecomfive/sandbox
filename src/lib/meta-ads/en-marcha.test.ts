import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularEnMarcha, enLaVista, estadoDeHallazgo, estadoDeTendencia, hallazgosEnVista, productoEnMarcha, soloEnMarcha } from "./en-marcha";
import type { AnalisisHistorico } from "./historico";

const campana = (nombre: string, producto: string | null, activa: boolean, gasto7: number, creadaEn: string | null = null) => ({ nombre, producto, activa, gasto7, creadaEn });

test("en marcha: activa y con gasto en 7 días, o recién montada; una apagada o sin gasto no cuenta", () => {
  const e = calcularEnMarcha(
    [campana("A", "NAD Selerb", true, 80), campana("B", "EO Dispositivo", false, 90), campana("C", "Crema Nida", true, 0, "2026-09-01T00:00:00Z"), campana("D", "Corrector", true, 0, "2026-11-24T10:00:00Z")],
    "2026-11-25",
  );
  assert.deepEqual(e.campanas, ["A", "D"]);
  assert.equal(productoEnMarcha(e, "nad selerb"), true);
  assert.equal(productoEnMarcha(e, "Corrector"), true);
  assert.equal(productoEnMarcha(e, "EO Dispositivo"), false);
  assert.equal(productoEnMarcha(e, "Crema Nida"), false);
  assert.equal(productoEnMarcha(e, null), false);
});

test("cada hallazgo dice si es de algo activo, apagado o general, según su llave", () => {
  const e = calcularEnMarcha([campana("PA | NAD", "NAD", true, 10)], "2026-11-25");
  assert.equal(estadoDeHallazgo({ id: "entrega:NAD:mala" }, e), "activo");
  assert.equal(estadoDeHallazgo({ id: "entrega:EODISPOSITIVO:mala" }, e), "apagado");
  assert.equal(estadoDeHallazgo({ id: "tendencia:Producto:NAD:mes" }, e), "activo");
  assert.equal(estadoDeHallazgo({ id: "tendencia:Campaña:PA | NAD:semana" }, e), "activo");
  assert.equal(estadoDeHallazgo({ id: "tendencia:Campaña:Vieja: 2:semana" }, e), "apagado");
  assert.equal(estadoDeHallazgo({ id: "tendencia:Ángulo:Dolor:mes" }, e), "general");
  assert.equal(estadoDeHallazgo({ id: "angulo:dolor:no" }, e), "general");
  assert.equal(estadoDeHallazgo({ id: "vigilancia:v1" }, e), "general");
  assert.equal(estadoDeTendencia({ nivel: "Todo", nombre: "Todas las campañas" }, e), "general");
});

test("la vista: activos trae lo general; apagados solo lo apagado; todos, todo", () => {
  assert.deepEqual([enLaVista("activo", "activos"), enLaVista("general", "activos"), enLaVista("apagado", "activos")], [true, true, false]);
  assert.deepEqual([enLaVista("activo", "apagados"), enLaVista("general", "apagados"), enLaVista("apagado", "apagados")], [false, false, true]);
  assert.equal(enLaVista("apagado", "todos"), true);
  const e = calcularEnMarcha([campana("X", "NAD", true, 1)], "2026-11-25");
  const ids = [{ id: "entrega:NAD:buena" }, { id: "entrega:VIEJO:mala" }, { id: "banda:ctr:alto:si" }];
  assert.deepEqual(hallazgosEnVista(ids, e, "activos").map((h) => h.id), ["entrega:NAD:buena", "banda:ctr:alto:si"]);
  assert.deepEqual(hallazgosEnVista(ids, e, "apagados").map((h) => h.id), ["entrega:VIEJO:mala"]);
});

test("la IA recibe solo lo que está en marcha; un análisis sin ese dato se queda igual", () => {
  const base = {
    hallazgos: [{ id: "entrega:NAD:mala" }, { id: "entrega:VIEJO:mala" }],
    tendencias: [{ nivel: "Producto", nombre: "NAD" }, { nivel: "Producto", nombre: "Viejo" }, { nivel: "Todo", nombre: "Todas" }],
    entrega: [{ clave: "NAD" }, { clave: "VIEJO" }],
    rankings: { productos: [{ nombre: "NAD" }, { nombre: "Viejo" }], campanas: [{ nombre: "X" }, { nombre: "Y" }], videos: [], angulos: [{ nombre: "Dolor" }], ganchos: [], formatos: [] },
    mesesPorProducto: [{ nombre: "Viejo", filas: [] }],
  } as unknown as AnalisisHistorico;
  assert.equal(soloEnMarcha(base), base);
  assert.equal(soloEnMarcha({ ...base, enMarcha: { productos: [], campanas: [] } }).hallazgos.length, 2, "sin nada en marcha no se recorta");
  const s = soloEnMarcha({ ...base, enMarcha: { productos: ["NAD"], campanas: ["X"] } });
  assert.deepEqual(s.hallazgos.map((h) => h.id), ["entrega:NAD:mala"]);
  assert.deepEqual(s.tendencias.map((t) => t.nombre), ["NAD", "Todas"]);
  assert.deepEqual(s.entrega.map((f) => f.clave), ["NAD"]);
  assert.deepEqual([s.rankings.productos.length, s.rankings.campanas.length, s.rankings.angulos.length, s.mesesPorProducto.length], [1, 1, 1, 0]);
});
