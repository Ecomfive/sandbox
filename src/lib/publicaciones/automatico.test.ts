import assert from "node:assert/strict";
import { test } from "node:test";
import { accionesPublicacion, enDropi, estaArchivada } from "./automatico";

test("En Dropi sale de lo que reporta Dropi", () => {
  assert.equal(enDropi({ hayCarga: false, tieneId: true, dropi: null }), "sin_datos");
  assert.equal(enDropi({ hayCarga: true, tieneId: false, dropi: null }), "sin_id");
  assert.equal(enDropi({ hayCarga: true, tieneId: true, dropi: null }), "no_aparece");
  assert.equal(enDropi({ hayCarga: true, tieneId: true, dropi: { activo: true } }), "activo");
  assert.equal(enDropi({ hayCarga: true, tieneId: true, dropi: { activo: false } }), "archivado");
});

test("archivada: manda Dropi; sin datos, lo marcado a mano", () => {
  assert.equal(estaArchivada("archivado", false), true);
  assert.equal(estaArchivada("activo", true), false);
  assert.equal(estaArchivada("sin_datos", true), true);
  assert.equal(estaArchivada("no_aparece", false), false);
});

const base = { archivada: false, fechaPublicacion: "2026-01-01", primeraVenta: null, margen: 0.4, netas30: 50, netas30Antes: 40, privatizadaA: null, competidorMasBarato: false };
const HOY = "2026-10-21";

test("al día si no hay nada que revisar", () => {
  assert.deepEqual(accionesPublicacion(base, HOY), []);
  assert.deepEqual(accionesPublicacion({ ...base, archivada: true, margen: 0.1 }, HOY), []);
});

test("cada regla", () => {
  assert.deepEqual(accionesPublicacion({ ...base, fechaPublicacion: "2026-10-05" }, HOY), [], "nuevo ya no es una acción");
  assert.deepEqual(accionesPublicacion({ ...base, margen: 0.25 }, HOY), ["margen_bajo"]);
  assert.deepEqual(accionesPublicacion({ ...base, netas30: 15, netas30Antes: 40 }, HOY), ["ventas_caida"]);
  assert.deepEqual(accionesPublicacion({ ...base, margen: 0.1, netas30: 15, netas30Antes: 40 }, HOY), ["margen_bajo", "ventas_caida"]);
  assert.deepEqual(accionesPublicacion({ ...base, netas30: 2, netas30Antes: 8 }, HOY), [], "con pocas ventas antes no cuenta como caída");
  assert.deepEqual(accionesPublicacion({ ...base, competidorMasBarato: true }, HOY), ["bajar_precio"]);
  assert.deepEqual(accionesPublicacion({ ...base, privatizadaA: "Juan", netas30: 0, netas30Antes: 0 }, HOY), ["verificar_dropshipper"]);
  assert.deepEqual(accionesPublicacion({ ...base, privatizadaA: "Juan", netas30: 0, netas30Antes: 0, fechaPublicacion: "2026-10-15" }, HOY), [], "uno nuevo todavía no se verifica");
  assert.deepEqual(accionesPublicacion({ ...base, margen: 0.2, competidorMasBarato: true }, HOY), ["margen_bajo", "bajar_precio"]);
});

test("republicar: 30 días sin ninguna venta, activa y de nuestra bodega (nunca la B280)", async () => {
  const { necesitaRepublicar: r, BODEGA_DROPI: b280 } = await import("./automatico");
  const base = { archivada: false, enDropi: "activo" as const, bodegaId: 81, hayVentas: true, ultimaVenta: "2026-09-10", publicadaDesde: "2026-05-01" };
  const hoy = "2026-10-22";
  assert.equal(r(base, hoy), true);
  assert.equal(r({ ...base, bodegaId: b280 }, hoy), false, "la B280 es de Dropi: no se republica");
  assert.equal(r({ ...base, privada: true }, hoy), false, "una privada no se republica");
  assert.equal(r({ ...base, stock: 0 }, hoy), false, "sin stock no se republica");
  assert.equal(r({ ...base, stock: 12 }, hoy), true);
  // Un pedido en 30 días que se canceló no cuenta: sin ventas netas, sale.
  assert.equal(r({ ...base, ultimaVenta: "2026-10-04", netas30: 0 }, hoy), true, "su único pedido se canceló");
  assert.equal(r({ ...base, ultimaVenta: "2026-10-04", netas30: 2 }, hoy), false, "vendió en 30 días");
  assert.equal(r({ ...base, netas30: 0, publicadaDesde: "2026-10-10" }, hoy), false, "lleva menos de 30 días publicada");
  assert.equal(r({ ...base, netas30: 0, publicadaDesde: "2026-09-22" }, hoy), false, "30 días justos: todavía no");
  assert.equal(r({ ...base, netas30: 0, publicadaDesde: "2026-09-21" }, hoy), true, "31 días: sí");
  assert.equal(r({ ...base, bodegaId: null }, hoy), false, "sin bodega conocida no se sabe");
  assert.equal(r({ ...base, ultimaVenta: "2026-10-05" }, hoy), false, "vendió hace menos de 30 días");
  assert.equal(r({ ...base, ultimaVenta: null, publicadaDesde: "2026-10-01" }, hoy), false, "nunca vendió pero es nueva");
  assert.equal(r({ ...base, ultimaVenta: null, publicadaDesde: "2026-08-01" }, hoy), true, "nunca vendió y lleva más de 30 días");
  assert.equal(r({ ...base, enDropi: "archivado" }, hoy), false);
  assert.equal(r({ ...base, hayVentas: false }, hoy), false, "sin datos de Dropi no se sabe");
  assert.equal(r(base, hoy, { dias_republicar: 60 }), false, "el plazo sale de las reglas");
});

test("la bodega de Dropi de cada país: B280 Panamá, B15 Costa Rica, B49 México", async () => {
  const { esBodegaDropi, codigoBodegaDropi, detalleAccion } = await import("./automatico");
  const { REGLAS_DEFECTO } = await import("./reglas");
  for (const id of [280, 15, 49]) assert.equal(esBodegaDropi(id), true, `B${id} es de Dropi`);
  assert.equal(esBodegaDropi(81), false, "B81 es de ECOMFIVE");
  assert.equal(esBodegaDropi(3903), false);
  assert.equal(codigoBodegaDropi("MX"), "B49");
  assert.equal(codigoBodegaDropi("cr"), "B15");
  assert.equal(codigoBodegaDropi(undefined), "B280");
  assert.match(detalleAccion("republicar", REGLAS_DEFECTO, "MX"), /no la B49\)/);
  assert.match(detalleAccion("republicar", REGLAS_DEFECTO, "PA"), /no la B280\)/);
});

test("vende poco: activa, con stock, con más de un mes publicada y menos de 100 ventas en 30 días", async () => {
  const { vendePoco, REGLAS_DEFECTO } = { ...(await import("./automatico")), ...(await import("./reglas")) };
  const hoy = "2026-11-07";
  const base = { archivada: false, enDropi: "activo" as const, netas30: 40, stock: 200, publicadaDesde: "2026-08-01" };
  const si = (p: Parameters<typeof vendePoco>[0], r?: Parameters<typeof vendePoco>[2]) => vendePoco(p, hoy, r).vende;
  assert.equal(si(base), true);
  assert.equal(si({ ...base, netas30: 0 }), true, "sin ventas también: el precio puede ser el problema");
  assert.equal(si({ ...base, netas30: 100 }), false, "100 ya alcanza");
  assert.equal(si({ ...base, stock: 0 }), false, "sin stock es otra tarjeta");
  assert.equal(si({ ...base, stock: null }), false);
  assert.equal(si({ ...base, netas30: null }), false, "sin datos de ventas no se sabe");
  assert.equal(si({ ...base, publicadaDesde: "2026-10-20" }), false, "todavía no tiene un mes entero");
  assert.equal(si({ ...base, publicadaDesde: null }), false);
  assert.equal(si({ ...base, archivada: true }), false);
  assert.equal(si({ ...base, enDropi: "archivado" }), false);
  assert.equal(si({ ...base, netas30: 140 }, { ...REGLAS_DEFECTO, venta_minima_mes: 150 }), true, "el umbral sale de Reglas");
});

test("vende poco: después de un cambio de precio espera 30 días con el precio nuevo", async () => {
  const { vendePoco } = await import("./automatico");
  const hoy = "2026-11-07";
  const base = { archivada: false, enDropi: "activo" as const, netas30: 40, stock: 200, publicadaDesde: "2026-08-01" };
  assert.deepEqual(vendePoco({ ...base, ultimoCambioPrecio: "2026-11-01" }, hoy), { vende: false, espera: "2026-12-01", por: "precio" }, "cambió hace 6 días: vuelve el 1 dic");
  assert.deepEqual(vendePoco({ ...base, ultimoCambioPrecio: "2026-11-07T15:30:00Z" }, hoy), { vende: false, espera: "2026-12-07", por: "precio" }, "con hora: el día de Panamá");
  assert.deepEqual(vendePoco({ ...base, ultimoCambioPrecio: "2026-10-08" }, hoy), { vende: true }, "ya pasaron 30 días con el precio nuevo y sigue vendiendo poco");
  assert.deepEqual(vendePoco({ ...base, ultimoCambioPrecio: "2026-08-15" }, hoy), { vende: true });
  assert.deepEqual(vendePoco({ ...base, netas30: 150, ultimoCambioPrecio: "2026-11-01" }, hoy), { vende: false, espera: null }, "si ya vende bien no espera nada");
});

test("vende poco: «Esperar un mes» la saca hasta el día elegido sin cambiar el precio", async () => {
  const { vendePoco, masDias, revisarNotaEspera } = await import("./automatico");
  const hoy = "2026-11-08";
  const base = { archivada: false, enDropi: "activo" as const, netas30: 40, stock: 200, publicadaDesde: "2026-08-01" };
  assert.equal(masDias(hoy, 30), "2026-12-08");
  assert.deepEqual(vendePoco({ ...base, esperaHasta: "2026-12-08" }, hoy), { vende: false, espera: "2026-12-08", por: "decision" });
  assert.deepEqual(vendePoco({ ...base, esperaHasta: "2026-11-08" }, hoy), { vende: true }, "el día que vence vuelve a salir");
  assert.deepEqual(vendePoco({ ...base, esperaHasta: "2026-10-01" }, hoy), { vende: true }, "una espera vencida no cuenta");
  assert.deepEqual(vendePoco({ ...base, esperaHasta: "2026-12-08", ultimoCambioPrecio: "2026-11-20" }, hoy), { vende: false, espera: "2026-12-20", por: "precio" }, "manda la que termina más tarde");
  assert.deepEqual(vendePoco({ ...base, esperaHasta: "2026-12-30", ultimoCambioPrecio: "2026-11-01" }, hoy), { vende: false, espera: "2026-12-30", por: "decision" });
  assert.deepEqual(vendePoco({ ...base, netas30: 150, esperaHasta: "2026-12-08" }, hoy), { vende: false, espera: null }, "si ya vende bien no hay espera");
  assert.ok("error" in revisarNotaEspera("  "));
  assert.ok("error" in revisarNotaEspera("x".repeat(301)));
  assert.deepEqual(revisarNotaEspera("  esperando   la temporada "), { nota: "esperando la temporada" });
});
