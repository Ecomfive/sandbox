import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { proveedorTexto } from "./proveedor";

const CLAVES = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "AI_PROVEEDOR", "AI_PROVEEDOR_CRM"] as const;
const antes = Object.fromEntries(CLAVES.map((k) => [k, process.env[k]]));
const con = (valores: Partial<Record<(typeof CLAVES)[number], string>>) => {
  for (const k of CLAVES) {
    if (valores[k] === undefined) delete process.env[k];
    else process.env[k] = valores[k];
  }
};

describe("qué IA de texto se usa", () => {
  afterEach(() => con(antes as Partial<Record<(typeof CLAVES)[number], string>>));

  it("con las dos claves, el CRM usa Claude y lo demás sigue con OpenAI", () => {
    con({ OPENAI_API_KEY: "a", ANTHROPIC_API_KEY: "b" });
    assert.equal(proveedorTexto("crm"), "anthropic");
    assert.equal(proveedorTexto(), "openai");
  });

  it("sin la clave de Claude, el CRM sigue con OpenAI", () => {
    con({ OPENAI_API_KEY: "a" });
    assert.equal(proveedorTexto("crm"), "openai");
  });

  it("AI_PROVEEDOR_CRM=openai devuelve el CRM a OpenAI; sin ninguna clave, nada", () => {
    con({ OPENAI_API_KEY: "a", ANTHROPIC_API_KEY: "b", AI_PROVEEDOR_CRM: "openai" });
    assert.equal(proveedorTexto("crm"), "openai");
    con({});
    assert.equal(proveedorTexto("crm"), null);
  });

  it("solo con Claude, todo usa Claude", () => {
    con({ ANTHROPIC_API_KEY: "b" });
    assert.equal(proveedorTexto(), "anthropic");
    assert.equal(proveedorTexto("crm"), "anthropic");
  });
});
