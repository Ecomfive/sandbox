import assert from "node:assert/strict";
import { test } from "node:test";
import { agruparRemisiones, MAX_LINEAS_REMISION, numeroRemision, revisarLineasRemision, type LineaEnviada } from "./remision";

const A = "0194f0a2-0000-7000-8000-000000000001";
const B = "0194f0a2-0000-7000-8000-000000000002";

test("el número lleva ceros y crece sin cortarse", () => {
  assert.equal(numeroRemision(12), "REM-0012");
  assert.equal(numeroRemision(12345), "REM-12345");
});

test("acepta varios productos y convierte la cantidad", () => {
  assert.deepEqual(revisarLineasRemision([{ sku: A, cantidad: "200" }, { sku: B, cantidad: 5 }]), { lineas: [{ sku: A, cantidad: 200 }, { sku: B, cantidad: 5 }] });
});

test("no acepta una remisión vacía, ni un producto repetido, ni cantidades malas", () => {
  assert.match((revisarLineasRemision([]) as { error: string }).error, /al menos un producto/);
  assert.match((revisarLineasRemision(null) as { error: string }).error, /al menos un producto/);
  assert.match((revisarLineasRemision([{ sku: A, cantidad: 1 }, { sku: A, cantidad: 2 }]) as { error: string }).error, /dos veces/);
  for (const cantidad of [0, -1, 1.5, "", "abc", 2_000_000]) assert.match((revisarLineasRemision([{ sku: A, cantidad }]) as { error: string }).error, /cantidad entera/);
  assert.match((revisarLineasRemision([{ sku: "x", cantidad: 1 }]) as { error: string }).error, /no es válido/);
});

test("tiene un tope de productos", () => {
  const muchas = Array.from({ length: MAX_LINEAS_REMISION + 1 }, (_, i) => ({ sku: `0194f0a2-0000-7000-8000-${String(i).padStart(12, "0")}`, cantidad: 1 }));
  assert.match((revisarLineasRemision(muchas) as { error: string }).error, /demasiados/);
});

test("agrupa las líneas en una fila por remisión, con lo que falta por confirmar primero", () => {
  const l = (id: string, remisionId: string | null, extra: Partial<LineaEnviada> = {}): LineaEnviada => ({
    id,
    remisionId,
    referencia: remisionId ? `REM-${remisionId}` : null,
    desde: "Oficina",
    hacia: "Boxfull",
    enviadoEn: "2026-11-06T14:00:00Z",
    enviada: 100,
    recibida: 100,
    estado: "recibido",
    notas: null,
    ...extra,
  });
  const r = agruparRemisiones([
    l("a1", "0001"),
    l("a2", "0001", { enviada: 50, recibida: 50 }),
    l("b1", "0002", { enviadoEn: "2026-11-07T14:00:00Z", recibida: 98 }),
    l("c1", "0003", { enviadoEn: "2026-11-01T14:00:00Z", estado: "en_camino", recibida: null }),
    l("d1", "0004", { enviadoEn: "2026-10-30T14:00:00Z" }),
    l("d2", "0004", { enviadoEn: "2026-10-30T14:00:00Z", estado: "en_camino", recibida: null }),
    l("e1", null, { enviadoEn: "2026-10-01T14:00:00Z" }),
  ]);
  assert.deepEqual(r.map((x) => [x.clave, x.estado]), [
    ["0003", "en_camino"],
    ["0004", "parcial"],
    ["0002", "diferencia"],
    ["0001", "completa"],
    ["e1", "completa"],
  ]);
  const uno = r.find((x) => x.clave === "0001")!;
  assert.equal(uno.numero, "REM-0001");
  assert.deepEqual([uno.productos, uno.enviadas, uno.recibidas, uno.porConfirmar, uno.diferencia], [2, 150, 150, 0, 0]);
  assert.equal(r.find((x) => x.clave === "0002")!.diferencia, -2);
  assert.equal(r.find((x) => x.clave === "0004")!.porConfirmar, 1);
  assert.equal(r.find((x) => x.clave === "e1")!.numero, "Sin número", "una línea anterior a las remisiones sale sola");
  assert.deepEqual(agruparRemisiones([]), []);
});
