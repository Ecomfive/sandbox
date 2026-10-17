import assert from "node:assert/strict";
import { test } from "node:test";
import { interpretarVistaPrevia } from "./vista-previa";

test("vista previa: el copy sale de lo que sigue a la fecha, sin comillas ni caracteres invisibles (texto real del 15 oct 2026)", () => {
  const real =
    "5,668 likes, 149 comments - metodosawaya on July 14, 2026: &quot;C&#xfa;rcuma+ 50 c&#xe1;psulas por $10 (tasa BCV) puedes hacer tu pedido v&#xed;a WhatsApp.\n\nbeneficios\n&#x2022; Regula el az&#xfa;car\n&#x2022; &#x2060;desinflama articulaciones\n\nhacemos envios a toda Venezuela&quot;. ";
  assert.equal(
    interpretarVistaPrevia(real)?.copy,
    "Cúrcuma+ 50 cápsulas por $10 (tasa BCV) puedes hacer tu pedido vía WhatsApp.\n\nbeneficios\n• Regula el azúcar\n• desinflama articulaciones\n\nhacemos envios a toda Venezuela",
  );
});

test("vista previa: sin texto después de la fecha no hay copy", () => {
  assert.equal(interpretarVistaPrevia("3 likes - tienda on March 9, 2026: &quot;&quot;")?.copy, null);
  assert.equal(interpretarVistaPrevia("3 likes - tienda on March 9, 2026:")?.copy, null);
});

test("vista previa: el copy decodifica los símbolos de HTML", () => {
  assert.equal(interpretarVistaPrevia('3 likes - tienda on March 9, 2026: "2 &lt; 3 &amp; 4"')?.copy, "2 < 3 & 4");
});
