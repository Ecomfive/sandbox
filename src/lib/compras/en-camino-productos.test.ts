import assert from "node:assert/strict";
import test from "node:test";
import { repartirEnCamino, type ComponenteDeCombo } from "./en-camino-productos";

const total = (m: ReturnType<typeof repartirEnCamino>, sku: string) => (m.get(sku) ?? []).reduce((t, a) => t + a.unidades, 0);
const sinPadres = new Map<string, string>();

test("una orden de un producto suma a ese producto, y una variante suma también a su producto", () => {
  const m = repartirEnCamino([{ compraId: "c1", skuId: "vapor-azul", unidades: 40 }, { compraId: "c2", skuId: "vapor", unidades: 10 }], new Map([["vapor-azul", "vapor"]]), []);
  assert.equal(total(m, "vapor-azul"), 40);
  assert.equal(total(m, "vapor"), 50);
  assert.deepEqual(m.get("vapor"), [{ compraId: "c1", unidades: 40 }, { compraId: "c2", unidades: 10 }]);
});

test("un combo de 2 del mismo producto tiene en camino la mitad de lo que viene del producto (lo que se puede armar)", () => {
  const combos: ComponenteDeCombo[] = [{ comboId: "pack2", componenteId: "vapor", cantidad: 2 }];
  const m = repartirEnCamino([{ compraId: "c1", skuId: "vapor", unidades: 101 }], sinPadres, combos);
  assert.equal(total(m, "vapor"), 101);
  assert.equal(total(m, "pack2"), 50);
});

test("si la orden es del combo, también vienen sus componentes (unidades por lo que lleva cada combo)", () => {
  const combos: ComponenteDeCombo[] = [{ comboId: "pack2", componenteId: "vapor", cantidad: 2 }];
  const m = repartirEnCamino([{ compraId: "c1", skuId: "pack2", unidades: 30 }], sinPadres, combos);
  assert.equal(total(m, "pack2"), 30, "no se cuenta dos veces: el combo ya viene en la orden");
  assert.equal(total(m, "vapor"), 60);
});

test("un combo de dos productos distintos solo cuenta las unidades que se pueden armar en una misma orden", () => {
  const combos: ComponenteDeCombo[] = [{ comboId: "kit", componenteId: "a", cantidad: 1 }, { comboId: "kit", componenteId: "b", cantidad: 2 }];
  const m = repartirEnCamino(
    [
      { compraId: "c1", skuId: "a", unidades: 10 },
      { compraId: "c1", skuId: "b", unidades: 8 },
      { compraId: "c2", skuId: "a", unidades: 50 },
    ],
    sinPadres,
    combos,
  );
  assert.equal(total(m, "kit"), 4, "c1 arma min(10, 8/2) = 4; c2 no trae b");
});

test("lo que no tiene unidades no aparece, y un producto sin combos ni variantes queda igual", () => {
  const m = repartirEnCamino([{ compraId: "c1", skuId: "x", unidades: 0 }, { compraId: "c1", skuId: "", unidades: 5 }], sinPadres, []);
  assert.equal(m.size, 0);
});

test("un combo de una variante también cuenta lo que viene de esa variante", () => {
  const combos: ComponenteDeCombo[] = [{ comboId: "pack2", componenteId: "vapor", cantidad: 2 }];
  const m = repartirEnCamino([{ compraId: "c1", skuId: "vapor-azul", unidades: 20 }], new Map([["vapor-azul", "vapor"]]), combos);
  assert.equal(total(m, "vapor"), 20);
  assert.equal(total(m, "pack2"), 10);
});
