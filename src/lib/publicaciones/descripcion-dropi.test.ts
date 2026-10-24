import assert from "node:assert/strict";
import test from "node:test";
import { descripcionAHtml, medirDescripcion, textoDeDescripcion } from "./descripcion-dropi";

test("párrafos y viñetas se vuelven HTML simple", () => {
  const html = descripcionAHtml("Crema de uso diario.\nPara todo tipo de piel.\n\nBeneficios:\n\n- Hidrata\n- Suaviza\n• Protege");
  assert.equal(html, "<p>Crema de uso diario.<br>Para todo tipo de piel.</p><p>Beneficios:</p><ul><li>Hidrata</li><li>Suaviza</li><li>Protege</li></ul>");
});

test("lo escrito se escapa: nunca llega una etiqueta", () => {
  const html = descripcionAHtml('<script>alert(1)</script> & "comillas"');
  assert.equal(html.includes("<script"), false);
  assert.equal(html, "<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; \"comillas\"</p>");
});

test("sin texto no hay HTML; las negritas de la IA se quitan", () => {
  assert.equal(descripcionAHtml("  \n\n "), "");
  assert.equal(descripcionAHtml("**Ideal** para ti"), "<p>Ideal para ti</p>");
});

test("el texto y el largo se cuentan sin etiquetas, como Dropi", () => {
  const html = "<p>Hola&nbsp;<b>mundo</b></p><ul><li>uno</li><li>dos</li></ul>";
  assert.equal(textoDeDescripcion(html), "Hola mundo uno dos");
  assert.deepEqual(medirDescripcion("<p>corta</p>"), { largo: 5, cumple: false });
  assert.equal(medirDescripcion(`<p>${"a".repeat(200)}</p>`).cumple, true);
  assert.equal(medirDescripcion(`<p>${"a".repeat(199)}</p>`).cumple, false);
});
