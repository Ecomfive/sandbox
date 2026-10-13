import { test } from "node:test";
import assert from "node:assert/strict";
import { esIpPrivada, revisarUrlPublica } from "./url-externa";

test("las IP privadas, locales y de la nube no se descargan", () => {
  for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "172.31.255.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
    assert.equal(esIpPrivada(ip), true, ip);
  }
});

test("las IPv4 escondidas en IPv6 se revisan por sus bytes (como las escribe new URL)", () => {
  // new URL("http://[::ffff:127.0.0.1]/").hostname es "[::ffff:7f00:1]"
  assert.equal(new URL("http://[::ffff:127.0.0.1]/").hostname, "[::ffff:7f00:1]");
  for (const ip of ["::ffff:7f00:1", "::ffff:a9fe:a9fe", "::ffff:a00:5", "::7f00:1", "64:ff9b::7f00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::", "2002:a9fe:a9fe::1", "::", "fc00::1", "fec0::1", "ff02::1", "2001::1", "2001:db8::1", "100::1"]) {
    assert.equal(esIpPrivada(ip), true, ip);
  }
  for (const ip of ["::ffff:808:808", "64:ff9b::808:808", "2002:808:808::1", "2a00:1450:4001::200e"]) assert.equal(esIpPrivada(ip), false, ip);
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
  assert.ok("error" in (await revisarUrlPublica("http://[::ffff:127.0.0.1]/x.png")));
  assert.ok("error" in (await revisarUrlPublica("http://[::ffff:7f00:1]:9001/x.png")));
  assert.ok("error" in (await revisarUrlPublica("https://8.8.8.8:8080/x.png")));
  assert.ok("url" in (await revisarUrlPublica("https://8.8.8.8/x.png")));
  assert.ok("url" in (await revisarUrlPublica("https://8.8.8.8:443/x.png")));
});
