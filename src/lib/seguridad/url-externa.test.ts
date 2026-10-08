import { test } from "node:test";
import assert from "node:assert/strict";
import { esIpPrivada, revisarUrlPublica } from "./url-externa";

test("las IP privadas, locales y de la nube no se descargan", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "172.31.255.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(esIpPrivada(ip), true, ip);
  }
});

test("las IP públicas sí", () => {
  for (const ip of ["8.8.8.8", "151.101.1.69", "172.32.0.1", "2606:4700::1111"]) assert.equal(esIpPrivada(ip), false, ip);
});

test("solo http(s) a un host público", async () => {
  assert.ok("error" in (await revisarUrlPublica("file:///etc/passwd")));
  assert.ok("error" in (await revisarUrlPublica("http://localhost:3000/x.png")));
  assert.ok("error" in (await revisarUrlPublica("http://127.0.0.1/x.png")));
  assert.ok("error" in (await revisarUrlPublica("http://169.254.169.254/latest/meta-data")));
  assert.ok("error" in (await revisarUrlPublica("http://[::1]/x.png")));
  assert.ok("error" in (await revisarUrlPublica("https://usuario:clave@ejemplo.com/x.png")));
  assert.ok("error" in (await revisarUrlPublica("no es una url")));
  assert.ok("url" in (await revisarUrlPublica("https://8.8.8.8/x.png")));
});
