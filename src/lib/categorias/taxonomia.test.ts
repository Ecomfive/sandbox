import assert from "node:assert/strict";
import { test } from "node:test";
import { grupoReporte, leerTaxonomia, primerNivel, rutaLegible } from "./taxonomia";

test("lee el archivo de Shopify", () => {
  const t = leerTaxonomia(
    "# Shopify Product Taxonomy\n\ngid://shopify/TaxonomyCategory/hb                : Salud y belleza\ngid://shopify/TaxonomyCategory/hb-3-10-6          : Salud y belleza > Cuidado personal > Cuidado capilar > Tratamientos contra la caída del cabello\n",
  );
  assert.equal(t.length, 2);
  assert.deepEqual(t[0], { id: "hb", ruta: "Salud y belleza", nombre: "Salud y belleza", nivel: 1, padre: null });
  assert.equal(t[1].padre, "hb-3-10");
  assert.equal(t[1].nivel, 4);
  assert.equal(t[1].nombre, "Tratamientos contra la caída del cabello");
});

test("grupo para reportes: dos niveles, tres en Salud y belleza", () => {
  assert.equal(grupoReporte("Casa y jardín > Cocina y comedor > Herramientas y utensilios de cocina > Peladores y descorazonadores"), "Casa y jardín > Cocina y comedor");
  assert.equal(grupoReporte("Salud y belleza > Cuidado personal > Cuidado capilar > Tratamientos contra la caída del cabello"), "Salud y belleza > Cuidado personal > Cuidado capilar");
  assert.equal(grupoReporte("Salud y belleza > Cuidado personal > Cosméticos > Cuidado de la piel > Lociones y humectantes"), "Salud y belleza > Cuidado personal > Cosméticos > Cuidado de la piel");
  assert.equal(grupoReporte("Salud y belleza > Cuidado de la salud > Nutrición y actividad física > Pérdida de peso > Suplementos para bajar de peso"), "Salud y belleza > Cuidado de la salud > Nutrición y actividad física > Pérdida de peso");
  assert.equal(grupoReporte("Ropa y accesorios > Prendas de vestir > Lencería > Fajas reductoras > Bodis"), "Ropa y accesorios > Prendas de vestir > Lencería");
  assert.equal(grupoReporte("Salud y belleza > Cuidado personal > Cosméticos"), "Salud y belleza > Cuidado personal > Cosméticos");
  assert.equal(grupoReporte("Juegos y juguetes"), "Juegos y juguetes");
  assert.equal(grupoReporte(null), null);
  assert.equal(primerNivel("Bricolaje > Herramientas"), "Bricolaje");
  assert.equal(rutaLegible("A > B"), "A › B");
});
