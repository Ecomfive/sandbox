import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cambioDeUnidades, validarCotizacion } from "./cotizacion";
import { cuotasDe, cumplimiento, estadoCuota } from "./cuotas";
import { ETAPA_PORTAL_DE_COMPRA, viaPortal } from "./espejo";
import { sumarDias } from "./fechas";
import { puedeAvisarPago, puedeConfirmarPago, puedePasar } from "./permisos-proveedor";
import { rutaEsDelPedido, rutaFotoReal } from "./rutas";
import { estadoTransito, textoPlazo } from "./transito";

const pedido = { montoTotal: 5000, fechaEnvio: "2026-10-21", fechaLlegada: null, primerPago: null, fechaPago1: null, segundoPago: null, fechaPago2: null };

test("el disparador de la migración usa las mismas etapas y la misma vía que el código", () => {
  const sql = readFileSync(new URL("../../../supabase/migrations/0124_portal_proveedor.sql", import.meta.url), "utf8");
  const pares = [...sql.matchAll(/when '([a-z_]+)' then '([a-z_]+)'/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(Object.fromEntries(pares), ETAPA_PORTAL_DE_COMPRA);
  assert.match(sql, /= array\['aire'\]::text\[\] then 'aire' else 'mar'/);
  assert.equal(viaPortal(["aire"]), "aire");
  for (const v of [["mar"], ["tierra"], [], null, ["mar", "aire"]]) assert.equal(viaPortal(v), "mar");
});

test("anticipo del 50 % a los 10 días corridos del envío y saldo a la llegada", () => {
  const [anticipo, saldo] = cuotasDe(pedido);
  assert.equal(anticipo.monto, 2500);
  assert.equal(anticipo.vence, "2026-10-31"); // enviado el 21 oct, vence el 31 oct
  assert.equal(saldo.monto, 2500);
  assert.equal(saldo.vence, null);
  assert.equal(estadoCuota(saldo, "2026-10-25").texto, "Al llegar");
  assert.deepEqual(cuotasDe({ ...pedido, fechaEnvio: null }), []);
  assert.equal(sumarDias("2026-12-28", 10), "2027-01-07");
});

test("estado de una cuota: por vencer, vence hoy, vencida y pagada a tiempo o tarde", () => {
  const [a] = cuotasDe(pedido);
  assert.equal(estadoCuota(a, "2026-10-21").texto, "Vence en 10 d");
  assert.equal(estadoCuota(a, "2026-10-29").tono, "aviso");
  assert.equal(estadoCuota(a, "2026-10-31").texto, "Vence hoy");
  assert.deepEqual(estadoCuota(a, "2026-11-05"), { tono: "peligro", texto: "Vencido 5 d", atraso: 5 });
  const [aTiempo] = cuotasDe({ ...pedido, primerPago: 2500, fechaPago1: "2026-10-30" });
  assert.equal(estadoCuota(aTiempo, "2026-11-20").texto, "Pagado a tiempo");
  const [tarde] = cuotasDe({ ...pedido, primerPago: 2500, fechaPago1: "2026-11-08" });
  assert.deepEqual(estadoCuota(tarde, "2026-11-20"), { tono: "aviso", texto: "Pagado 8 d tarde", atraso: 8 });
  // Un pago parcial no la da por pagada.
  const [parcial] = cuotasDe({ ...pedido, primerPago: 1000, fechaPago1: "2026-10-25" });
  assert.equal(parcial.pendiente, 1500);
  assert.equal(cumplimiento([aTiempo, tarde, parcial]).aTiempo, 1);
  assert.equal(cumplimiento([aTiempo, tarde]).peor, 8);
});

test("tránsito contra el plazo: en plazo, por llegar, atrasado y llegado", () => {
  const pa = { min: 45, max: 55 };
  assert.equal(estadoTransito("2026-09-01", null, pa, "2026-09-30").texto, "En plazo");
  assert.equal(estadoTransito("2026-09-01", null, pa, "2026-10-20").tono, "aviso");
  assert.equal(estadoTransito("2026-09-01", null, pa, "2026-11-01").texto, "Atrasado 6 d");
  assert.equal(estadoTransito("2026-09-01", "2026-10-10", pa, "2026-11-01").texto, "Llegó 6 d antes");
  assert.equal(estadoTransito("2026-09-01", "2026-10-20", pa, "2026-11-01").texto, "Llegó a tiempo (49 d)");
  assert.equal(estadoTransito("2026-09-01", null, { min: 80, max: 80 }, "2026-11-25").texto, "Atrasado 5 d");
  assert.equal(estadoTransito("2026-09-01", null, null, "2026-11-25").texto, "Sin plazo acordado");
  assert.equal(textoPlazo(pa), "45–55 d");
  assert.equal(textoPlazo({ min: 80, max: 80 }), "80 d");
});

test("la cotización acepta costo por unidad o total y marca si cambió las unidades", () => {
  assert.deepEqual(validarCotizacion({ unidades: 960, costoUnitario: "1.5" }), { unidades: 960, costoUnitario: 1.5, montoTotal: 1440 });
  assert.deepEqual(validarCotizacion({ unidades: "1,000", montoTotal: 2130 }), { unidades: 1000, costoUnitario: 2.13, montoTotal: 2130 });
  assert.ok("error" in validarCotizacion({ unidades: 960 }));
  assert.ok("error" in validarCotizacion({ unidades: 0, montoTotal: 100 }));
  assert.ok("error" in validarCotizacion({ unidades: 10.5, montoTotal: 100 }));
  assert.ok("error" in validarCotizacion({ unidades: 1000, costoUnitario: -2 }));
  assert.ok("error" in validarCotizacion({ unidades: 1000, montoTotal: 5_000_000 }));
  assert.deepEqual(cambioDeUnidades(1000, 960), { pedidas: 1000, cotizadas: 960 });
  assert.equal(cambioDeUnidades(1000, 1000), null);
});

test("las fotos del proveedor quedan en la carpeta de su pedido y no se acepta otra ruta", () => {
  const prov = "01a1f0e2-1111-7000-8000-000000000001";
  const ped = "01a1f0e2-2222-7000-8000-000000000002";
  const otro = "01a1f0e2-3333-7000-8000-000000000003";
  const id = "0f8b6a2c-9d1e-4c3b-8a7f-123456789abc";
  const ruta = rutaFotoReal(prov, ped, "Foto Real.PNG", id);
  assert.equal(ruta, `${prov}/${ped}/fotos/${id}.png`);
  assert.equal(rutaFotoReal(prov, ped, "archivo.exe", id), `${prov}/${ped}/fotos/${id}.jpg`);
  assert.equal(rutaFotoReal("../x", ped, "a.jpg", id), null);
  assert.ok(rutaEsDelPedido(ruta, prov, ped));
  assert.ok(!rutaEsDelPedido(ruta, prov, otro)); // de otro pedido
  assert.ok(!rutaEsDelPedido(ruta, otro, ped)); // de otro proveedor
  assert.ok(!rutaEsDelPedido(`${prov}/${ped}/fotos/../../${otro}/x.jpg`, prov, ped));
  assert.ok(!rutaEsDelPedido(`${prov}/${ped}/otra/${id}.jpg`, prov, ped));
  assert.ok(!rutaEsDelPedido(42, prov, ped));
});

test("cada lado solo da sus pasos", () => {
  assert.ok(puedePasar("proveedor", "por_cotizar", "cotizado"));
  assert.ok(!puedePasar("proveedor", "cotizado", "produccion"));
  assert.ok(puedePasar("ecomfive", "cotizado", "produccion"));
  assert.ok(puedePasar("ecomfive", "cotizado", "descartado"));
  assert.ok(puedePasar("proveedor", "produccion", "enviado"));
  assert.ok(!puedePasar("ecomfive", "produccion", "enviado"));
  assert.ok(puedePasar("ecomfive", "enviado", "llegado"));
  assert.ok(!puedePasar("proveedor", "enviado", "llegado"));
  assert.ok(puedeAvisarPago("ecomfive") && !puedeAvisarPago("proveedor"));
  assert.ok(puedeConfirmarPago("proveedor") && !puedeConfirmarPago("ecomfive"));
});
