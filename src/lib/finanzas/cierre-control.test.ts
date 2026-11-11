import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONFIG_CIERRE_DEFECTO,
  atrasoTarea,
  cuadra,
  evaluarCuadre,
  evaluarDevengos,
  evaluarProvisiones,
  evaluarVariaciones,
  explicarDiferenciaDropi,
  fechaObjetivo,
  leerConfigCierre,
  leerPartesDropi,
  limpiarContraparte,
  lineasVariacion,
  pendienteDropi,
  puedeAprobar,
  resumenVariaciones,
  superaUmbral,
  textoPlazo,
  validarConfigCierre,
} from "./cierre-control";
import { armarEerr, type FilaEerr } from "./eerr";

test("ajustes del cierre: lo inválido toma el valor por defecto", () => {
  assert.deepEqual(leerConfigCierre(null), CONFIG_CIERRE_DEFECTO);
  const c = leerConfigCierre({ dia_habil: 8, umbral_pct: "15", umbral_monto: -3, contraparte_dropi: "Dropi%' or 1=1" });
  assert.equal(c.diaHabil, 8);
  assert.equal(c.umbralPct, 15);
  assert.equal(c.umbralMonto, CONFIG_CIERRE_DEFECTO.umbralMonto);
  assert.equal(c.contraparteDropi, "Dropi or 11");
  assert.equal(limpiarContraparte("  ab_c "), "abc");
});

test("validar ajustes del cierre", () => {
  const base = { dia_habil: "5", umbral_pct: "10", umbral_monto: "500", tolerancia_inventario: "100", tolerancia_dropi: "50", contraparte_dropi: "dropi" };
  const ok = validarConfigCierre(base);
  assert.ok(!("error" in ok));
  if (!("error" in ok)) assert.equal(ok.config.toleranciaDropi, 50);
  assert.ok("error" in validarConfigCierre({ ...base, dia_habil: "0" }));
  assert.ok("error" in validarConfigCierre({ ...base, dia_habil: "2.5" }));
  assert.ok("error" in validarConfigCierre({ ...base, contraparte_dropi: "" }));
});

test("fecha objetivo: día hábil N del mes siguiente", () => {
  // Diciembre 2025 → enero 2026, 5.º hábil = 8 ene (1 y 9 son feriados).
  assert.equal(fechaObjetivo("2025-12-01", 5), "2026-01-08");
  assert.equal(fechaObjetivo("2026-09-01", 1), "2026-10-01");
});

test("semáforo de atraso", () => {
  assert.equal(atrasoTarea(true, "2026-10-07", "2026-10-20").atraso, "resuelta");
  const vencida = atrasoTarea(false, "2026-10-07", "2026-10-09");
  assert.equal(vencida.atraso, "vencida");
  assert.equal(vencida.dias, -2);
  assert.equal(textoPlazo(vencida), "Atrasada 2 días hábiles");
  assert.equal(atrasoTarea(false, "2026-10-09", "2026-10-07").atraso, "por_vencer");
  assert.equal(atrasoTarea(false, "2026-10-20", "2026-10-07").atraso, "en_plazo");
  assert.equal(textoPlazo(atrasoTarea(false, "2026-10-07", "2026-10-07")), "Vence hoy");
});

test("aprobación en dos pasos", () => {
  assert.equal(puedeAprobar("a", "a").ok, false);
  assert.equal(puedeAprobar("a", "b").ok, true);
  assert.equal(puedeAprobar(null, "b").ok, true);
});

test("umbral de variación: monto y % a la vez", () => {
  const c = { umbralPct: 10, umbralMonto: 500 };
  assert.equal(superaUmbral(11_600, 10_000, c), true);
  assert.equal(superaUmbral(10_400, 10_000, c), false, "no llega al monto");
  assert.equal(superaUmbral(100_600, 100_000, c), false, "no llega al %");
  assert.equal(superaUmbral(800, 0, c), true, "sin mes anterior basta el monto");
});

test("líneas de variación del EERR con explicaciones", () => {
  const f = (periodo: string, tipo: string, seccion: FilaEerr["seccion"], signo: number, monto: number): FilaEerr => ({ periodo, unidad_id: "u", tipo, orden: 1, seccion, signo, monto });
  const filas = [
    f("2026-08-01", "Ingresos", "ingresos", 1, 20_000),
    f("2026-09-01", "Ingresos", "ingresos", 1, 30_000),
    f("2026-08-01", "SUELDOS", "administracion", -1, 3_000),
    f("2026-09-01", "SUELDOS", "administracion", -1, 3_100),
  ];
  const eerr = armarEerr(filas, ["2026-08-01", "2026-09-01"]);
  const lineas = lineasVariacion(eerr, "2026-09-01", "2026-08-01", { umbralPct: 10, umbralMonto: 500 }, new Map([["ingresos", "Campaña de septiembre"]]));
  const ing = lineas.find((l) => l.clave === "ingresos")!;
  assert.equal(ing.supera, true);
  assert.equal(ing.explicacion, "Campaña de septiembre");
  assert.equal(ing.pct, 50);
  assert.equal(lineas.find((l) => l.clave === "administracion-SUELDOS")!.supera, false);
  assert.ok(!lineas.some((l) => l.clave.endsWith("-pct")));
  const r = resumenVariaciones(lineas);
  assert.ok(r.superan >= 2);
  assert.equal(r.sinExplicar, r.superan - 1);
  assert.equal(evaluarVariaciones(r).resultado, "falta");
  assert.equal(evaluarVariaciones({ superan: 0, sinExplicar: 0 }).resultado, "ok");
});

test("cuadres", () => {
  assert.equal(cuadra(-80, 100), true);
  assert.equal(evaluarCuadre(null, 100).resultado, "falta");
  assert.equal(evaluarCuadre({ libros: 10, sistema: 0, diferencia: 10, explicacion: null }, 100).resultado, "ok");
  assert.equal(evaluarCuadre({ libros: 1000, sistema: 0, diferencia: 1000, explicacion: null }, 100).resultado, "revisar");
  assert.equal(evaluarCuadre({ libros: 1000, sistema: 0, diferencia: 1000, explicacion: "Merma" }, 100).resultado, "ok");
});

test("cuadre con Dropi: pendiente y explicación", () => {
  const p = leerPartesDropi({ wallet: "100", wallet_fecha: "2026-09-30", retiros_transito: 250, retiros_abiertos: 2, entregados_sin_liquidar: 50, pedidos_sin_liquidar: 3, cartera_libros: 150, documentos_libros: 1 })!;
  assert.equal(pendienteDropi(p), 400);
  const textos = explicarDiferenciaDropi(p);
  assert.ok(textos.some((t) => t.includes("2 retiros")));
  assert.ok(textos.some((t) => t.includes("retiros en tránsito")), "la diferencia de 250 es igual a los retiros");
  assert.ok(explicarDiferenciaDropi({ ...p, walletFecha: null }).some((t) => t.includes("wallet")));
});

test("devengos y provisiones en el checklist", () => {
  assert.equal(evaluarDevengos({ esperados: 0, registrados: 0 }).resultado, "ok");
  assert.equal(evaluarDevengos({ esperados: 2, registrados: 1 }).resultado, "falta");
  assert.equal(evaluarProvisiones({ conPlanilla: false, registradas: 0 }).resultado, "ok");
  assert.equal(evaluarProvisiones({ conPlanilla: true, registradas: 3 }).resultado, "ok");
  assert.equal(evaluarProvisiones({ conPlanilla: true, registradas: 1 }).resultado, "falta");
});

test("avisos al responsable: una vez por estado", async () => {
  const { avisoPendiente } = await import("./cierre-control");
  assert.equal(avisoPendiente("en_plazo", null), null);
  assert.equal(avisoPendiente("por_vencer", null), "por_vencer");
  assert.equal(avisoPendiente("por_vencer", "por_vencer"), null);
  assert.equal(avisoPendiente("vencida", "por_vencer"), "vencida");
  assert.equal(avisoPendiente("resuelta", "vencida"), null);
});
