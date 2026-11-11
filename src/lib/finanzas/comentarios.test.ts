import assert from "node:assert/strict";
import test from "node:test";
import { claveCelda, contarHilos, enlaceAncla, limpiarTexto, nombreCifra, validarAncla } from "./comentarios";

test("el ancla se valida: página conocida, período corto y clave sin caracteres de control", () => {
  assert.deepEqual(validarAncla({ pagina: "estado-resultados", periodo: "", clave: "todo-usd-todas:ingresos|2026-03-01" }), {
    pagina: "estado-resultados",
    periodo: "",
    clave: "todo-usd-todas:ingresos|2026-03-01",
  });
  assert.equal(validarAncla({ pagina: "nomina", periodo: "", clave: "x" }), null);
  assert.equal(validarAncla({ pagina: "panel-financiero", periodo: "2026-10; drop", clave: "x" }), null);
  assert.equal(validarAncla({ pagina: "panel-financiero", periodo: "2026-10", clave: "" }), null);
  assert.equal(validarAncla({ pagina: "panel-financiero", periodo: "2026-10", clave: "a\u0000b" }), null);
  assert.equal(validarAncla({ pagina: "__proto__", periodo: "", clave: "x" }), null);
});

test("texto, claves y nombres", () => {
  assert.equal(limpiarTexto("  hola \r\n chau "), "hola \n chau");
  assert.equal(limpiarTexto("   "), null);
  assert.equal(limpiarTexto("x".repeat(2001)), null);
  assert.equal(claveCelda("ebitda", "2026-03-01"), "ebitda|2026-03-01");
  assert.deepEqual(contarHilos([{ clave: "a" }, { clave: "a" }, { clave: "b" }]), { a: 2, b: 1 });
  assert.equal(enlaceAncla({ pagina: "panel-financiero", periodo: "2026-10", clave: "x" }), "/panel-financiero?periodo=2026-10");
  assert.equal(nombreCifra("ebitda|2026-03-01", { ebitda: "EBITDA" }), "EBITDA · mar 26");
});
