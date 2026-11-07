import assert from "node:assert/strict";
import { test } from "node:test";
import { cuantasCajas, revisarCajas, textoCaja, textoCajasEnviadas, unidadesDeCajas } from "./cajas";

const SKU = "0194f0a2-0000-7000-8000-000000000001";
const C1 = "0194f0a2-0000-7000-8000-00000000000a";
const C2 = "0194f0a2-0000-7000-8000-00000000000b";

test("las cuentas y los textos de las cajas", () => {
  const lineas = [{ cajas: 16, porCaja: 175 }, { cajas: 1, porCaja: 58 }];
  assert.equal(unidadesDeCajas(lineas), 2858);
  assert.equal(cuantasCajas(lineas), 17);
  assert.equal(textoCaja({ cajas: 1, porCaja: 58, ubicacion: "C1" }), "1 caja de 58 (C1)");
  assert.equal(textoCajasEnviadas([{ ubicacion: "C1", cajas: 3, por_caja: 175 }, { ubicacion: "C3", cajas: 1, por_caja: 58 }]), "3 cajas de 175 (C1) · 1 caja de 58 (C3)");
  assert.equal(textoCajasEnviadas([{ ubicacion: "C1", cajas: 4, por_caja: 48 }, { ubicacion: "C1", cajas: 0, por_caja: 29, sueltas: 8 }]), "4 cajas de 48 (C1) · 8 u. de una caja de 29 (C1)");
  assert.equal(textoCajasEnviadas([{ ubicacion: "C1", cajas: 2, por_caja: 29, sueltas: 8 }]), "2 cajas de 29 (C1) · 8 u. de una caja de 29 (C1)");
  assert.equal(textoCajasEnviadas(null), null);
  assert.equal(textoCajasEnviadas([]), null);
});

test("revisa las cajas de un levantamiento: junta lo igual, ignora lo vacío y dice qué falta", () => {
  assert.deepEqual(revisarCajas(undefined), { cajas: [] });
  const r = revisarCajas([
    {
      sku: SKU,
      lineas: [
        { ubicacion: C1, cajas: "16", por_caja: "175", observacion: "  abierta " },
        { ubicacion: C1, cajas: 2, por_caja: 175 },
        { ubicacion: C2, cajas: 1, por_caja: 58 },
        { ubicacion: "", cajas: "", por_caja: "" },
      ],
    },
  ]);
  assert.deepEqual(r, {
    cajas: [
      {
        sku: SKU,
        lineas: [
          { ubicacion: C1, cajas: 18, por_caja: 175, observacion: "abierta" },
          { ubicacion: C2, cajas: 1, por_caja: 58, observacion: null },
        ],
      },
    ],
  });
  assert.deepEqual(revisarCajas([{ sku: SKU, lineas: [] }]), { cajas: [{ sku: SKU, lineas: [] }] }, "sin líneas: el producto se queda sin cajas");
  assert.deepEqual(revisarCajas([{ sku: SKU, lineas: [{ ubicacion: "", cajas: 1, por_caja: 5 }] }]), { error: "Elige la ubicación de cada línea de cajas." });
  assert.deepEqual(revisarCajas([{ sku: SKU, lineas: [{ ubicacion: C1, cajas: 0, por_caja: 5 }] }]), { error: "Cada línea necesita cuántas cajas y cuántas unidades por caja." });
  assert.deepEqual(revisarCajas([{ sku: SKU, lineas: [] }, { sku: SKU, lineas: [] }]), { error: "Un producto viene dos veces en las cajas." });
});
