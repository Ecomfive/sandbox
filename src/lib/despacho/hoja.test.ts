import assert from "node:assert/strict";
import test from "node:test";
import { assetDeUrl, claseDe, rutaCopia } from "../monday/comprobantes";
import { COLUMNAS_HOJA, diaLargo, filaExcel, gruposHoja, SIN_REPARTIDOR, type FilaHoja } from "./hoja";

const f = (itemId: string, courier: string | null, numero: string, extra: Partial<FilaHoja> = {}): FilaHoja => ({
  itemId,
  numero,
  tienda: "KENKU",
  courier,
  estado: null,
  edoPago: "PENDIENTE",
  formaPago: "EFECTIVO",
  porCobrar: 10,
  cobrado: null,
  comprobantes: 0,
  comentario: null,
  costeEnvio: 3.65,
  turno: null,
  posicion: 0,
  actualizado: null,
  ...extra,
});

test("hoja: por repartidor en el orden de Monday, sin repartidor al final, pedidos por número", () => {
  const g = gruposHoja([f("1", "ANIBAL PEREZ", "1470"), f("2", null, "1"), f("3", "JULY CALLE", "1469"), f("4", "JULY CALLE", "1462", { estado: "ENTREGADO", cobrado: 10 }), f("5", "NUEVO", "9")]);
  assert.deepEqual(g.map((x) => x.nombre), ["JULY CALLE", "ANIBAL PEREZ", "NUEVO", SIN_REPARTIDOR]);
  assert.deepEqual(g[0].filas.map((x) => x.numero), ["1462", "1469"]);
  assert.equal(g[0].sumas.entregados, 1);
  assert.equal(g[0].sumas.porCobrar, 20);
});

test("hoja: solo las columnas de Monday y el Excel en ese orden", () => {
  assert.equal(COLUMNAS_HOJA.length, 13);
  const fila = filaExcel(f("1", "JULY CALLE", "1462", { comprobantes: 2 }));
  assert.equal(fila.length, COLUMNAS_HOJA.length);
  assert.equal(fila[9], "Sí (2)");
  assert.equal(diaLargo("2026-11-17"), "martes 17/11/2026");
});

test("comprobantes de Monday: el archivo y su copia en el sistema", () => {
  const a = assetDeUrl("https://oferfly.monday.com/protected_static/10510875/resources/3291602767/media_2026-10-03_18-24-54_1_1F1898AE.jpg");
  assert.deepEqual(a, { id: "3291602767", ext: "jpg" });
  assert.equal(rutaCopia({ id: "9", ext: "jpeg" }), "monday/9.jpg");
  assert.equal(assetDeUrl("https://otro.com/x.jpg"), null);
  assert.equal(claseDe("HEIC"), "otro");
  assert.equal(claseDe("png"), "imagen");
  assert.equal(claseDe("pdf"), "pdf");
});
