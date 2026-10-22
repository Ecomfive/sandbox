import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { cambioDeUnidades, validarCotizacion } from "./cotizacion";
import { cuotasDe, cumplimiento, estadoCuota, saldoTrasLlegada } from "./cuotas";
import { ETAPA_PORTAL_DE_COMPRA, viaPortal } from "./espejo";
import { sumarDias } from "./fechas";
import { puedeAvisarPago, puedeConfirmarPago, puedePasar } from "./permisos-proveedor";
import { emparejar, leerHojaPagos } from "./hoja-pagos";
import { rutaEsDelPedido, rutaFotoReal } from "./rutas";
import { estadoTransito, textoPlazo } from "./transito";

const pedido = { montoTotal: 5000, fechaEnvio: "2026-10-21", fechaLlegada: null as string | null, pagosAnticipo: [] as { monto: number; fecha: string }[], pagosSaldo: [] as { monto: number; fecha: string }[] };
const pago = (monto: number, fecha: string) => [{ monto, fecha }];

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
  const [aTiempo] = cuotasDe({ ...pedido, pagosAnticipo: pago(2500, "2026-10-30") });
  assert.equal(estadoCuota(aTiempo, "2026-11-20").texto, "Pagado a tiempo");
  const [tarde] = cuotasDe({ ...pedido, pagosAnticipo: pago(2500, "2026-11-08") });
  assert.deepEqual(estadoCuota(tarde, "2026-11-20"), { tono: "aviso", texto: "Pagado 8 d tarde", atraso: 8 });
  // Un pago parcial no la da por pagada; en dos partes, cuenta la fecha de la última.
  const [parcial] = cuotasDe({ ...pedido, pagosAnticipo: pago(1000, "2026-10-25") });
  assert.equal(parcial.pendiente, 1500);
  const [enDos] = cuotasDe({ ...pedido, pagosAnticipo: [{ monto: 1000, fecha: "2026-10-25" }, { monto: 1500, fecha: "2026-11-02" }] });
  assert.deepEqual(estadoCuota(enDos, "2026-11-20"), { tono: "aviso", texto: "Pagado 2 d tarde", atraso: 2 });
  assert.equal(cumplimiento([aTiempo, tarde, parcial]).aTiempo, 1);
  assert.equal(cumplimiento([aTiempo, tarde]).peor, 8);
});

test("anticipo completo por adelantado (UPS) sin saldo, y saldo pagado tras la llegada", () => {
  assert.equal(cuotasDe({ ...pedido, anticipoMonto: 5000 }).length, 1);
  const [, saldo] = cuotasDe({ ...pedido, fechaLlegada: "2026-12-10", pagosSaldo: pago(2500, "2026-12-20") });
  assert.equal(saldo.vence, "2026-12-10");
  assert.deepEqual(saldoTrasLlegada([saldo]), { total: 1, promedio: 10, dentro: 0 });
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

test("lee la hoja de pagos de Chin: anticipo en partes, saldo, UPS y fechas mal escritas", () => {
  const hoja = [
    "Product,Quantity,Amount,Delivery Time,Dowm payment,Paid amount,Payment Time,Unpaid Amount,Due date for payment,Blance payment,Arrival Time,Paid Time",
    'Presbyopic Glasses,2000,4400,01/04/2026,2200,2200,22/04/2026,0,,0,20/06/2026,09/07/2026',
    'MOUTHPIECE,1000,3370,15/04/2026,1685,"180\n1505","23/04/2026",0,,0,17/07/2026,06/08/2026',
    'Nail Fungus Treatment,1000,760,03/07/2025,380,150,15/07/2025,0,,0,,31/08/2025',
    ',,,,,230,22/07/2025,,,,,',
    'Bracelet with box（UPS）,500,3160,13/05/2026,3160,3160,28/05/2026,0,,,,',
    'Faja tipo Panty,1000,4240,12/10/2026,2120,,,2120,22/10/2026,2120,,',
    'After Shave Oil(Mexico pink),1488,4650,23/09/2025,2325,2325,16/10/2025,0,,0,18/11/2025,"02/12/2015\n14/12/2025"',
    "Total Amount,,,,,,,5330,,57860,,",
  ].join("\n");
  const f = leerHojaPagos(hoja);
  assert.equal(f.length, 6);
  assert.deepEqual(f[0].pagosAnticipo, [{ monto: 2200, fecha: "2026-04-22" }]);
  assert.deepEqual(f[0].pagosSaldo, [{ monto: 2200, fecha: "2026-07-09" }]);
  assert.equal(f[0].fechaLlegada, "2026-06-20");
  assert.deepEqual(f[1].pagosAnticipo, [{ monto: 180, fecha: "2026-04-23" }, { monto: 1505, fecha: "2026-04-23" }]);
  assert.deepEqual(f[2].pagosAnticipo.map((p) => p.monto), [150, 230]); // la fila sin producto es otra parte del anticipo
  assert.equal(f[3].anticipo, 3160); // UPS: todo por adelantado
  assert.deepEqual(f[3].pagosSaldo, []);
  assert.deepEqual(f[4].pagosAnticipo, []); // todavía sin pagar
  assert.deepEqual(f[5].pagosSaldo, [{ monto: 2325, fecha: "2025-12-14" }]); // «2015» no cuenta
});

test("empareja cada fila con su compra, la más segura primero y sin repetir", () => {
  const fila = (producto: string, monto: number, fechaEnvio: string, unidades = 1000) => ({ producto, unidades, monto, anticipo: monto / 2, fechaEnvio, fechaLlegada: null, pagosAnticipo: [], pagosSaldo: [] });
  const pedidos = [
    { id: "a", producto: "Lentes Presbicia Lote #1 - ECOM01-0100", paisCodigo: "PA", unidades: 2000, montoTotal: 4400, fechaEnvio: "2026-04-01" },
    { id: "b", producto: "Turkesterone - ECOM01-0200", paisCodigo: "PA", unidades: 1000, montoTotal: 2430, fechaEnvio: "2026-04-22" },
  ];
  const m = emparejar(
    [
      { fila: fila("Presbyopic Glasses", 4400, "2026-04-01", 2000), pais: "PA" },
      { fila: fila("TURKESTERONE", 2430, "2026-04-23"), pais: "PA" },
      { fila: fila("TURKESTERONE", 2430, "2026-04-24"), pais: "PA" }, // la misma compra no se usa dos veces
      { fila: fila("Algo sin compra", 999, "2026-04-01"), pais: "PA" },
    ],
    pedidos,
  );
  assert.equal(m.get(0), "a");
  assert.equal(m.get(1), "b");
  assert.equal(m.has(2), false);
  assert.equal(m.has(3), false);
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
