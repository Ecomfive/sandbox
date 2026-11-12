import assert from "node:assert/strict";
import test from "node:test";
import { urlDelSistema } from "./conectar-shopify";
import { appDeDominio, appDeTienda, appsDeEntorno, permisosDeEscritura } from "./shopify-app";

const ENV = {
  SHOPIFY_KENKU_CLIENT_ID: "id-k",
  SHOPIFY_KENKU_CLIENT_SECRET: "secreto-k",
  SHOPIFY_KENKU_DOMINIO: "https://Kenku-PA.myshopify.com/",
  SHOPIFY_NUVO_PAN_CLIENT_ID: "id-n",
  SHOPIFY_NUVO_PAN_CLIENT_SECRET: "secreto-n",
  SHOPIFY_NUVO_PAN_DOMINIO: "nuvo.myshopify.com",
  // Sin secreto: no cuenta.
  SHOPIFY_OFERFY_CLIENT_ID: "id-o",
  SHOPIFY_OFERFY_DOMINIO: "oferfy.myshopify.com",
  // Dominio que no es de Shopify: no cuenta.
  SHOPIFY_MALA_CLIENT_ID: "id-m",
  SHOPIFY_MALA_CLIENT_SECRET: "s",
  SHOPIFY_MALA_DOMINIO: "evil.com",
  // Las variables del portal de Finanzas no son apps de tienda.
  SHOPIFY_CLIENT_SECRET: "otro",
  SHOPIFY_WEBHOOK_SECRET: "otro",
};

test("las tiendas se leen de SHOPIFY_<TIENDA>_CLIENT_ID, _CLIENT_SECRET y _DOMINIO, con el dominio limpio", () => {
  assert.deepEqual(appsDeEntorno(ENV), [
    { tienda: "KENKU", dominio: "kenku-pa.myshopify.com", clientId: "id-k", clientSecret: "secreto-k" },
    { tienda: "NUVO PAN", dominio: "nuvo.myshopify.com", clientId: "id-n", clientSecret: "secreto-n" },
  ]);
});

test("la app de una tienda, por su nombre o por el dominio del aviso", () => {
  const apps = appsDeEntorno(ENV);
  assert.equal(appDeTienda("Kenku", apps)?.clientId, "id-k");
  assert.equal(appDeTienda("Nuvo Pan", apps)?.clientId, "id-n");
  assert.equal(appDeTienda("Oferfy", apps), null);
  assert.equal(appDeDominio("KENKU-PA.myshopify.com", apps)?.tienda, "KENKU");
  assert.equal(appDeDominio("otra.myshopify.com", apps), null);
});

test("una app con permisos de escritura no se conecta", () => {
  assert.deepEqual(permisosDeEscritura("read_orders,read_customers,read_products"), []);
  assert.deepEqual(permisosDeEscritura("read_orders, write_orders,write_products"), ["write_orders", "write_products"]);
  assert.deepEqual(permisosDeEscritura(null), []);
});

test("la dirección pública del sistema para los avisos", () => {
  assert.equal(urlDelSistema({ PORTAL_URL: "https://sistema.ecomfive.io/" }), "https://sistema.ecomfive.io");
  assert.equal(urlDelSistema({ VERCEL_PROJECT_PRODUCTION_URL: "sandbox.vercel.app" }), "https://sandbox.vercel.app");
  assert.equal(urlDelSistema({ PORTAL_URL: "http://inseguro.com" }), null);
  assert.equal(urlDelSistema({}), null);
});
