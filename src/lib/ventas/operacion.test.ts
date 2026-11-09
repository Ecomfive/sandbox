import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as o from "./operacion";

const expect = (v: unknown) => ({
  toBe: (e: unknown) => assert.equal(v, e),
  toEqual: (e: unknown) => assert.deepEqual(v, e),
  toBeNull: () => assert.equal(v, null),
  toMatch: (r: RegExp) => assert.match(String(v), r),
  toContain: (e: string) => assert.ok(String(v).includes(e)),
  toBeCloseTo: (e: number, d = 2) => assert.ok(Math.abs((v as number) - e) < 10 ** -d),
  toMatchObject: (e: Record<string, unknown>) => { for (const k of Object.keys(e)) assert.deepEqual((v as Record<string, unknown>)[k], e[k]); },
});

describe("confirmación", () => {
  it("semáforo por antigüedad", () => {
    expect(o.semaforoConfirmacion(0.5)).toBe("verde");
    expect(o.semaforoConfirmacion(5)).toBe("ambar");
    expect(o.semaforoConfirmacion(30)).toBe("rojo");
  });
  it("umbrales: lo inválido usa la base", () => {
    expect(o.leerUmbrales({ horas_confirmar_alerta: 2, dias_estancada: "x" })).toMatchObject({ horasConfirmarAlerta: 2, diasEstancada: 3 });
    expect(o.leerUmbrales(null).montoAprobacion).toBe(150);
  });
  it("no contactable tras 3 fallidos o número malo", () => {
    expect(o.noContactable(["no_contesta", "ocupado"])).toBe(false);
    expect(o.noContactable(["no_contesta", "ocupado", "no_contesta"])).toBe(true);
    expect(o.noContactable(["numero_malo"])).toBe(true);
  });
  it("horario por país", () => {
    expect(o.horaLocalPais("PA", new Date("2026-11-02T13:00:00Z"))).toBe(8);
    expect(o.horaLocalPais("CR", new Date("2026-11-02T13:00:00Z"))).toBe(7);
    expect(o.dentroDeHorario(7)).toBe(false);
    expect(o.dentroDeHorario(8)).toBe(true);
    expect(o.dentroDeHorario(20)).toBe(false);
  });
  it("reparto parejo", () => {
    const r = o.repartirEntrePersonas(["a", "b", "c", "d", "e"], [{ nombre: "Ana", ya: 0 }, { nombre: "Beto", ya: 2 }]);
    const cuenta = (n: string) => [...r.values()].filter((v) => v === n).length;
    expect(cuenta("Ana")).toBe(4);
    expect(cuenta("Beto")).toBe(1);
  });
});

describe("teléfono", () => {
  it("Panamá", () => {
    expect(o.normalizarTelefono("PA", "+507 6671-8422")).toMatchObject({ clave: "66718422", valido: true, tipo: "movil" });
    expect(o.normalizarTelefono("PA", "263-1234")).toMatchObject({ valido: true, tipo: "fijo" });
    expect(o.normalizarTelefono("PA", "123").valido).toBe(false);
    expect(o.normalizarTelefono("PA", "").motivo).toBe("Sin teléfono");
  });
  it("Costa Rica y México", () => {
    expect(o.normalizarTelefono("CR", "506 8888 1234")).toMatchObject({ clave: "88881234", valido: true, tipo: "movil" });
    expect(o.normalizarTelefono("CR", "2222 3333").tipo).toBe("fijo");
    expect(o.normalizarTelefono("MX", "+52 55 1234 5678")).toMatchObject({ clave: "5512345678", valido: true });
    expect(o.normalizarTelefono("MX", "1234").valido).toBe(false);
  });
});

describe("riesgo y duplicadas", () => {
  it("niveles", () => {
    expect(o.riesgoCliente({ entregadas: 3, devueltas: 0, canceladas: 0, fallidas: 0 })).toBe("ninguno");
    expect(o.riesgoCliente({ entregadas: 1, devueltas: 1, canceladas: 0, fallidas: 0 })).toBe("medio");
    expect(o.riesgoCliente({ entregadas: 0, devueltas: 1, canceladas: 1, fallidas: 0 })).toBe("alto");
    expect(o.riesgoCliente({ entregadas: 0, devueltas: 5, canceladas: 0, fallidas: 0 }, "blanca")).toBe("lista_blanca");
    expect(o.riesgoCliente({ entregadas: 9, devueltas: 0, canceladas: 0, fallidas: 0 }, "negra")).toBe("lista_negra");
  });
  it("duplicadas: mismo teléfono y productos en 24 h", () => {
    const h = 3_600_000;
    const r = o.detectarDuplicadas([
      { id: "1", telefonoClave: "6", productos: "x", creadoMs: 0 },
      { id: "2", telefonoClave: "6", productos: "x", creadoMs: 5 * h },
      { id: "3", telefonoClave: "6", productos: "y", creadoMs: 6 * h },
      { id: "4", telefonoClave: "6", productos: "x", creadoMs: 60 * h },
    ]);
    expect(r).toEqual([{ original: "1", duplicada: "2" }]);
  });
});

describe("sugerencia de envío", () => {
  const cob = [
    { zona: "Chorrera", repartidorId: "a", transportista: null, tarifa: 3, prioridad: 1 },
    { zona: "Chorrera", repartidorId: "b", transportista: null, tarifa: 3.5, prioridad: 1 },
    { zona: "Colón", repartidorId: null, transportista: "Servientrega", tarifa: 6, prioridad: 1 },
  ];
  it("elige al de mejor tasa y menos carga", () => {
    const s = o.sugerirEnvio("LA CHORRERA", cob, [
      { repartidorId: "a", ordenesHoy: 10, capacidad: null, tasaEntrega: 0.7, efectivoEnMano: 0, limiteEfectivo: null },
      { repartidorId: "b", ordenesHoy: 2, capacidad: null, tasaEntrega: 0.9, efectivoEnMano: 0, limiteEfectivo: null },
    ]);
    expect(s?.repartidorId).toBe("b");
    expect(s?.motivo).toContain("90 %");
  });
  it("salta al que llenó su capacidad o su límite de efectivo", () => {
    const s = o.sugerirEnvio("Chorrera", cob, [
      { repartidorId: "a", ordenesHoy: 5, capacidad: 5, tasaEntrega: 1, efectivoEnMano: 0, limiteEfectivo: null },
      { repartidorId: "b", ordenesHoy: 0, capacidad: null, tasaEntrega: 0.5, efectivoEnMano: 500, limiteEfectivo: 400 },
    ]);
    expect(s).toBeNull();
  });
  it("transportadora sin carga y zona desconocida", () => {
    expect(o.sugerirEnvio("colon", cob, [])?.transportista).toBe("Servientrega");
    expect(o.sugerirEnvio("Darién", cob, [])).toBeNull();
  });
  it("ruta ordenada por zona", () => {
    expect(o.ordenarRuta([{ zona: "b", numero: "#10" }, { zona: "a", numero: "#9" }, { zona: "b", numero: "#2" }]).map((x) => x.numero)).toEqual(["#9", "#2", "#10"]);
  });
});

describe("entrega", () => {
  it("devolución al agotar intentos", () => {
    expect(o.debePasarADevolucion(2)).toBe(false);
    expect(o.debePasarADevolucion(3)).toBe(true);
  });
  it("código de 4 dígitos estable", () => {
    expect(o.codigoEntrega("abc")).toMatch(/^\d{4}$/);
    expect(o.codigoEntrega("abc")).toBe(o.codigoEntrega("abc"));
  });
  it("estancadas y riesgo de entrega", () => {
    expect(o.estancadas([{ id: "a", fase: "despachada", diasEnFase: 5 }, { id: "b", fase: "por_confirmar", diasEnFase: 9 }, { id: "c", fase: "confirmada", diasEnFase: 1 }])).toEqual([{ id: "a", fase: "despachada", dias: 5 }]);
    expect(o.entregaEnRiesgo("2026-11-02", "2026-11-02", "despachada")).toBe(true);
    expect(o.entregaEnRiesgo("2026-11-03", "2026-11-02", "despachada")).toBe(false);
    expect(o.entregaEnRiesgo("2026-11-01", "2026-11-02", "entregada")).toBe(false);
  });
});

describe("plata", () => {
  it("antigüedad", () => {
    expect(o.antiguedadSaldos([{ pendiente: 10, dias: 1 }, { pendiente: 5, dias: 5 }, { pendiente: 7, dias: 10 }, { pendiente: 3, dias: 30 }])).toEqual({ d0_3: 10, d4_7: 5, d8_14: 7, d15_mas: 3, total: 25 });
  });
  it("diferencia y límite", () => {
    expect(o.diferenciaCobro(50, 45)).toMatchObject({ diferencia: -5, tipo: "faltante" });
    expect(o.diferenciaCobro(50, 50).tipo).toBe("exacto");
    expect(o.excedeLimiteEfectivo(400, 400)).toBe(true);
    expect(o.excedeLimiteEfectivo(10, null)).toBe(false);
  });
  it("margen vivo", () => {
    const m = o.margenOrden({ total: 100, costoMercancia: 40, envioCobrado: 5, costoEnvio: 4, comisionPasarela: 3, comisionMensajero: 2 });
    expect(m).toEqual({ neto: 51, margenPct: 51, margenEnvio: 1 });
    expect(o.margenOrden({ total: 0, costoMercancia: 0, envioCobrado: 0, costoEnvio: 0, comisionPasarela: 0, comisionMensajero: 0 }).margenPct).toBeNull();
  });
  it("pasarela, ITBMS y aprobación", () => {
    expect(o.comisionPasarela(100, 2.9, 0.3)).toBeCloseTo(3.2, 2);
    expect(o.itbmsIncluido(107)).toBe(7);
    expect(o.pideAprobacion(150)).toBe(true);
    expect(o.pideAprobacion(10)).toBe(false);
  });
  it("cierre de mes y proyección", () => {
    expect(o.mesCerrado("2026-10-15", ["2026-10-01"])).toBe(true);
    expect(o.mesCerrado("2026-11-01", ["2026-10-01"])).toBe(false);
    expect(o.proyeccionCaja([{ cod: 100 }, { cod: 100 }], 50, 0.8)).toEqual({ enRuta: 200, esperado: 160, total: 210 });
    expect(o.provisionDevoluciones(1000, 0.1)).toBe(100);
  });
});
