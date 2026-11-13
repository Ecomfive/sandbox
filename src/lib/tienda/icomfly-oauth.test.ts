import assert from "node:assert/strict";
import test from "node:test";
import {
  claveIcomfly,
  contenidoHerramienta,
  desafioPkce,
  firmarStateIcomfly,
  leerTokensIcomfly,
  leerUrlConector,
  nuevoPkce,
  respuestaRpc,
  urlAutorizacionIcomfly,
  venceProntoIcomfly,
  verificarStateIcomfly,
} from "./icomfly-oauth";

test("la dirección del conector: solo la de iComfly", () => {
  assert.equal(leerUrlConector(" https://api.icomfly.com/mcp/c_0a1b2c3d4e5f6a7b8c9d0e1f/ "), "https://api.icomfly.com/mcp/c_0a1b2c3d4e5f6a7b8c9d0e1f");
  assert.equal(leerUrlConector("https://otro.com/mcp/c_0a1b2c3d"), null);
  assert.equal(leerUrlConector("http://api.icomfly.com/mcp/c_0a1b2c3d"), null);
  assert.equal(leerUrlConector(""), null);
});

test("PKCE S256: SHA-256 del verificador en base64url, sin relleno", () => {
  assert.equal(desafioPkce("dBjftJeZ4CVP-mB92K27uhbUJU1p1r7W5uqvhl9q5eh"), "WOcrVe70jWQzTz-DcHonxjrkbYrU219ILhd-_EgzKm4");
  const { verificador, desafio } = nuevoPkce();
  assert.equal(verificador.length, 43);
  assert.equal(desafio, desafioPkce(verificador));
});

test("el state firmado: misma persona, mismo navegador, a tiempo y con su tienda", () => {
  const clave = claveIcomfly({ SUPABASE_SERVICE_ROLE_KEY: "servicio-de-prueba-123" })!;
  const tienda = "01a0e7d2-1111-7222-8333-444455556666";
  const s = firmarStateIcomfly({ tiendaId: tienda, usuarioId: "u1", nonce: "n1", vence: 2000 }, clave);
  assert.deepEqual(verificarStateIcomfly(s, { usuarioId: "u1", nonceCookie: "n1", ahora: 1000 }, clave), { ok: true, tiendaId: tienda });
  assert.equal(verificarStateIcomfly(s, { usuarioId: "u2", nonceCookie: "n1", ahora: 1000 }, clave).ok, false);
  assert.equal(verificarStateIcomfly(s, { usuarioId: "u1", nonceCookie: "otro", ahora: 1000 }, clave).ok, false);
  assert.equal(verificarStateIcomfly(s, { usuarioId: "u1", nonceCookie: "n1", ahora: 3000 }, clave).ok, false);
  assert.equal(verificarStateIcomfly(s.replace(/.$/, "x"), { usuarioId: "u1", nonceCookie: "n1", ahora: 1000 }, clave).ok, false);
  assert.equal(claveIcomfly({}), null);
  assert.notDeepEqual(claveIcomfly({ SUPABASE_SERVICE_ROLE_KEY: "a" }), claveIcomfly({ SUPABASE_SERVICE_ROLE_KEY: "b" }));
});

test("la dirección de autorización lleva PKCE, el alcance y el recurso", () => {
  const u = new URL(urlAutorizacionIcomfly({ clientId: "cli", redirectUri: "https://sistema.test/api/icomfly/retorno", desafio: "abc", state: "st", recurso: "https://api.icomfly.com/mcp/c_1234567" }));
  assert.equal(u.origin + u.pathname, "https://api.icomfly.com/authorize");
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("scope"), "mcp read");
  assert.equal(u.searchParams.get("resource"), "https://api.icomfly.com/mcp/c_1234567");
});

test("tokens: con y sin vencimiento; renovar 2 minutos antes", () => {
  const t = leerTokensIcomfly({ access_token: "a", refresh_token: "r", expires_in: 3600 }, 0)!;
  assert.deepEqual(t, { access: "a", refresh: "r", expiraEn: new Date(3_600_000).toISOString() });
  assert.equal(leerTokensIcomfly({ access_token: "a" }, 0)!.refresh, null);
  assert.equal(leerTokensIcomfly({ error: "invalid_grant" }, 0), null);
  assert.equal(venceProntoIcomfly(new Date(100_000).toISOString(), 0), true);
  assert.equal(venceProntoIcomfly(new Date(600_000).toISOString(), 0), false);
  assert.equal(venceProntoIcomfly(null, 0), true);
});

test("respuestas del servidor MCP: JSON directo o flujo de eventos", () => {
  assert.deepEqual(respuestaRpc('{"jsonrpc":"2.0","id":2,"result":{"ok":1}}', 2), { jsonrpc: "2.0", id: 2, result: { ok: 1 } });
  const sse = 'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":3,"result":{"tools":[]}}\n\n';
  assert.deepEqual(respuestaRpc(sse, 3)?.result, { tools: [] });
  assert.equal(respuestaRpc(sse, 9), null);
  assert.equal(respuestaRpc("", 1), null);
});

test("el contenido de una herramienta: estructurado, JSON en texto o texto", () => {
  assert.deepEqual(contenidoHerramienta({ structuredContent: { a: 1 } }), { datos: { a: 1 }, esError: false });
  assert.deepEqual(contenidoHerramienta({ content: [{ type: "text", text: '{"mensajes":[1,2]}' }] }), { datos: { mensajes: [1, 2] }, esError: false });
  assert.deepEqual(contenidoHerramienta({ content: [{ type: "text", text: "No encontrado" }], isError: true }), { datos: "No encontrado", esError: true });
});
