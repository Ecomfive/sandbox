import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dominioRegistrado, enlacesPeligrosos, partesConEnlaces, revisarArchivo, revisarEnlace } from "./enlaces";

const riesgo = (url: string) => revisarEnlace(url).riesgo;
const enlaces = (texto: string) => partesConEnlaces(texto).flatMap((p) => (p.tipo === "enlace" ? [p.texto] : []));

describe("enlaces peligrosos", () => {
  it("bloquea los que se hacen pasar por una marca", () => {
    assert.equal(riesgo("https://dropi-pagos.com/login"), "peligroso");
    assert.equal(riesgo("dropiapp.store"), "peligroso");
    assert.equal(riesgo("https://whatsap-verificacion.net"), "peligroso");
    assert.equal(riesgo("https://faceb00k-soporte.com"), "peligroso");
    assert.equal(riesgo("http://paypa1.com.secure-id.co"), "peligroso");
    assert.equal(riesgo("https://apple-id.help"), "peligroso");
    assert.match(revisarEnlace("https://yappy-premio.xyz").motivos[0], /yappy/);
  });

  it("bloquea IP, «@» que esconde el sitio, letras de otro alfabeto, programas y esquemas raros", () => {
    assert.equal(riesgo("http://192.168.0.10/pago"), "peligroso");
    assert.equal(riesgo("https://app.dropi.co@estafa.ru/login"), "peligroso");
    assert.equal(riesgo("https://аpple.com"), "peligroso"); // «а» cirílica
    assert.equal(riesgo("https://descargas.com/dropi-app.apk"), "peligroso");
    assert.equal(riesgo("javascript:alert(1)"), "peligroso");
    assert.equal(revisarEnlace("javascript:alert(1)").url, null);
  });

  it("los oficiales son conocidos, aunque lleven subdominio o país", () => {
    for (const u of ["https://app.dropi.co/dashboard", "https://app.dropi.pa", "dropi.cr", "https://wa.me/50760000000", "https://www.facebook.com/x", "https://docs.google.com/a", "https://google.com.pa", "https://mom-beta-proveduria.vercel.app/crm", "youtu.be/abc", "https://yappy.com.pa"]) {
      assert.equal(riesgo(u), "conocido", u);
    }
  });

  it("avisa antes de abrir acortadores, terminaciones baratas, http y palabras de estafa", () => {
    assert.equal(riesgo("bit.ly/3abc"), "sospechoso");
    assert.equal(riesgo("https://ofertas.xyz"), "sospechoso");
    assert.equal(riesgo("http://mitienda.com"), "sospechoso");
    assert.equal(riesgo("https://premio-gratis.com"), "sospechoso");
    assert.equal(riesgo("https://a.b.c.d.e.com"), "sospechoso");
  });

  it("lo demás es normal, sin confundir palabras que contienen una marca", () => {
    assert.equal(riesgo("https://mitienda.com/producto"), "normal");
    assert.equal(riesgo("https://pineapple.com"), "normal");
    assert.equal(riesgo("https://applebees.com"), "normal");
    assert.deepEqual(revisarEnlace("https://mitienda.com").motivos, []);
  });

  it("el dominio registrado, con y sin país", () => {
    assert.equal(dominioRegistrado("app.dropi.co"), "dropi.co");
    assert.equal(dominioRegistrado("www.yappy.com.pa"), "yappy.com.pa");
    assert.equal(dominioRegistrado("dropi.pa"), "dropi.pa");
  });
});

describe("encontrar los enlaces en un mensaje", () => {
  it("con https, con www y sueltos, sin el punto o el paréntesis del final", () => {
    assert.deepEqual(enlaces("Mira https://app.dropi.co/x. Y www.ejemplo.com, o bit.ly/abc)"), ["https://app.dropi.co/x", "www.ejemplo.com", "bit.ly/abc"]);
  });

  it("no toma correos, números ni palabras con punto", () => {
    assert.deepEqual(enlaces("Escribe a juan.perez@gmail.com o paga 1.50 y ok.de acuerdo, gracias.Mañana"), []);
  });

  it("deja el texto completo, en orden", () => {
    const partes = partesConEnlaces("Hola, entra a premio.xyz ya");
    assert.equal(partes.map((p) => p.texto).join(""), "Hola, entra a premio.xyz ya");
    assert.equal(partes[1].tipo === "enlace" && partes[1].riesgo, "sospechoso");
  });

  it("los peligrosos de un mensaje del equipo", () => {
    assert.equal(enlacesPeligrosos("Tu guía: https://app.dropi.co/guia").length, 0);
    assert.equal(enlacesPeligrosos("Entra a dropi-soporte.com y valida").length, 1);
  });
});

describe("archivos que llegan por WhatsApp", () => {
  it("bloquea los que instalan programas, aunque escondan la extensión", () => {
    assert.equal(revisarArchivo("Dropi.apk", null).riesgo, "peligroso");
    assert.equal(revisarArchivo("factura.pdf.exe", "application/pdf").riesgo, "peligroso");
    assert.equal(revisarArchivo("archivo", "application/vnd.android.package-archive").riesgo, "peligroso");
  });

  it("avisa con comprimidos, macros y páginas; deja pasar lo normal", () => {
    assert.equal(revisarArchivo("fotos.zip", null).riesgo, "sospechoso");
    assert.equal(revisarArchivo("precios.xlsm", null).riesgo, "sospechoso");
    assert.equal(revisarArchivo("login.html", null).riesgo, "sospechoso");
    assert.equal(revisarArchivo("guia.pdf", "application/pdf").riesgo, "normal");
    assert.equal(revisarArchivo(null, null).riesgo, "normal");
  });
});
