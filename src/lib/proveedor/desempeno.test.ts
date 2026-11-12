import assert from "node:assert/strict";
import test from "node:test";
import { enviosPorSemana, estanciasTerminadas, lunesDe, resumenDesempeno, serieEnvios, transitosConPlazo } from "./desempeno";

test("la semana de un envío es la que empieza el lunes", () => {
  assert.equal(lunesDe("2026-11-11"), "2026-11-09"); // miércoles
  assert.equal(lunesDe("2026-11-09"), "2026-11-09"); // lunes
  assert.equal(lunesDe("2026-11-15"), "2026-11-09"); // domingo
  assert.equal(lunesDe("2026-11-16T03:00:00Z"), "2026-11-16");
});

test("unidades y órdenes por semana y país; lo descartado o sin fecha de envío no cuenta", () => {
  const e = enviosPorSemana([
    { fechaEnvio: "2026-11-10", paisCodigo: "PA", unidades: 500, etapa: "enviado" },
    { fechaEnvio: "2026-11-12", paisCodigo: "PA", unidades: 300, etapa: "llegado" },
    { fechaEnvio: "2026-11-12", paisCodigo: "CR", unidades: 100, etapa: "enviado" },
    { fechaEnvio: "2026-11-02", paisCodigo: "PA", unidades: 50, etapa: "enviado" },
    { fechaEnvio: null, paisCodigo: "PA", unidades: 999, etapa: "produccion" },
    { fechaEnvio: "2026-11-12", paisCodigo: "PA", unidades: 999, etapa: "descartado" },
  ]);
  assert.deepEqual(e, [
    { semana: "2026-11-02", pais: "PA", unidades: 50, ordenes: 1 },
    { semana: "2026-11-09", pais: "CR", unidades: 100, ordenes: 1 },
    { semana: "2026-11-09", pais: "PA", unidades: 800, ordenes: 2 },
  ]);
  const semanas = serieEnvios(e, "semana", null, "2026-11-11");
  assert.equal(semanas.length, 12);
  assert.deepEqual(semanas.at(-1), { clave: "2026-11-09", unidades: 900, ordenes: 3 });
  assert.deepEqual(semanas.at(-2), { clave: "2026-11-02", unidades: 50, ordenes: 1 });
  assert.deepEqual(serieEnvios(e, "semana", "CR", "2026-11-11").at(-1), { clave: "2026-11-09", unidades: 100, ordenes: 1 });
  const meses = serieEnvios(e, "mes", null, "2026-11-11");
  assert.deepEqual(meses.map((m) => m.clave), ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"]);
  assert.deepEqual(meses.at(-1), { clave: "2026-11", unidades: 950, ordenes: 4 });
  assert.deepEqual(serieEnvios(e, "mes", null, "2027-02-01").map((m) => m.clave), ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"]);
});

test("días para cotizar: de «Enviado a cotización» a «Cotizado», solo lo que terminó en la ventana", () => {
  const desde = Date.parse("2026-10-01T00:00:00Z");
  const ev = [
    { compraId: "a", valor: "cotizar", ocurridoEn: "2026-10-01T10:00:00Z" },
    { compraId: "a", valor: "enviado_cotizacion", ocurridoEn: "2026-10-02T10:00:00Z" },
    { compraId: "a", valor: "cotizado", ocurridoEn: "2026-10-05T22:00:00Z" },
    { compraId: "b", valor: "enviado_cotizacion", ocurridoEn: "2026-10-03T10:00:00Z" },
    { compraId: "b", valor: "descartado", ocurridoEn: "2026-10-04T10:00:00Z" },
    { compraId: "c", valor: "enviado_cotizacion", ocurridoEn: "2026-09-01T10:00:00Z" },
    { compraId: "c", valor: "cotizado", ocurridoEn: "2026-09-02T10:00:00Z" },
    { compraId: "d", valor: "enviado_cotizacion", ocurridoEn: "2026-11-01T10:00:00Z" },
  ];
  assert.deepEqual(estanciasTerminadas(ev, "enviado_cotizacion", desde, "cotizado"), [{ compraId: "a", dias: 3.5 }]);
  assert.equal(estanciasTerminadas(ev, "enviado_cotizacion", desde).length, 2);
});

test("indicadores: promedio para cotizar, producción en 15 días y tránsito dentro del plazo, por país", () => {
  const transitos = transitosConPlazo(
    [
      { fechaEnvio: "2026-08-01", fechaLlegada: "2026-10-10", paisCodigo: "CR", via: "mar" },
      { fechaEnvio: "2026-08-01", fechaLlegada: "2026-11-01", paisCodigo: "CR", via: "mar" },
      { fechaEnvio: "2026-09-01", fechaLlegada: "2026-10-01", paisCodigo: "MX", via: "mar" },
      { fechaEnvio: "2026-06-01", fechaLlegada: "2026-07-01", paisCodigo: "CR", via: "mar" },
      { fechaEnvio: "2026-10-01", fechaLlegada: null, paisCodigo: "CR", via: "mar" },
    ],
    (pais) => (pais === "CR" ? 80 : null),
    "2026-08-13",
  );
  assert.deepEqual(transitos, [
    { pais: "CR", dias: 70, plazo: 80 },
    { pais: "CR", dias: 92, plazo: 80 },
  ]);
  const d = {
    envios: [],
    cotizaciones: [
      { pais: "PA", dias: 1.5 },
      { pais: "CR", dias: 4.2 },
    ],
    producciones: [
      { pais: "PA", dias: 14.6 },
      { pais: "PA", dias: 15.4 },
      { pais: "CR", dias: 22 },
      { pais: "CR", dias: 9 },
    ],
    transitos,
  };
  assert.deepEqual(resumenDesempeno(d, null), {
    promedioCotizar: 2.9,
    cotizacionesMedidas: 2,
    produccionATiempo: 75,
    produccionesMedidas: 4,
    transitoATiempo: 50,
    transitosMedidos: 2,
  });
  const pa = resumenDesempeno(d, "PA");
  assert.equal(pa.promedioCotizar, 1.5);
  assert.equal(pa.produccionATiempo, 100);
  assert.equal(pa.transitoATiempo, null);
});
