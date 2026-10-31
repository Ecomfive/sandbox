import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { esIdGiphy, esUrlGiphy, leerArchivosGiphy, leerListaGiphy } from "./giphy";

describe("GIPHY", () => {
  it("solo acepta direcciones de archivos de GIPHY por https", () => {
    assert.equal(esUrlGiphy("https://media2.giphy.com/media/abc/giphy.mp4"), true);
    assert.equal(esUrlGiphy("https://media.giphy.com/x.gif"), true);
    assert.equal(esUrlGiphy("http://media.giphy.com/x.gif"), false);
    assert.equal(esUrlGiphy("https://giphy.com.evil.example/x.gif"), false);
    assert.equal(esUrlGiphy("https://evil.example/media.giphy.com/x.gif"), false);
    assert.equal(esUrlGiphy("https://127.0.0.1/x.gif"), false);
    assert.equal(esUrlGiphy("no es una dirección"), false);
  });

  it("el id es solo letras y números", () => {
    assert.equal(esIdGiphy("l0HlBO7eyXzSZkJri"), true);
    assert.equal(esIdGiphy("../etc/passwd"), false);
    assert.equal(esIdGiphy("a"), false);
  });

  it("la lista solo deja lo que se muestra y descarta lo que viene de otro sitio", () => {
    const lista = leerListaGiphy({
      data: [
        { id: "abc123", title: "Hola", images: { fixed_width_small: { url: "https://media1.giphy.com/media/abc123/100w.gif" } } },
        { id: "def456", title: "Malo", images: { fixed_width_small: { url: "https://evil.example/x.gif" } } },
        { id: "../x", title: "Id raro", images: { fixed_width_small: { url: "https://media1.giphy.com/x.gif" } } },
      ],
    });
    assert.deepEqual(lista, [{ id: "abc123", titulo: "Hola", vista: "https://media1.giphy.com/media/abc123/100w.gif" }]);
    assert.deepEqual(leerListaGiphy(null), []);
  });

  it("los archivos de un GIF o sticker", () => {
    const a = leerArchivosGiphy({
      data: {
        id: "abc123",
        title: "Hola",
        images: {
          original_mp4: { mp4: "https://media1.giphy.com/media/abc123/giphy.mp4" },
          fixed_height: { mp4: "https://media1.giphy.com/media/abc123/200.mp4" },
          original: { webp: "https://media1.giphy.com/media/abc123/giphy.webp", url: "https://media1.giphy.com/media/abc123/giphy.gif" },
        },
      },
    });
    assert.equal(a?.mp4, "https://media1.giphy.com/media/abc123/giphy.mp4");
    assert.equal(a?.mp4Chico, "https://media1.giphy.com/media/abc123/200.mp4");
    assert.equal(a?.webp, "https://media1.giphy.com/media/abc123/giphy.webp");
    assert.equal(leerArchivosGiphy({ data: {} }), null);
    assert.equal(leerArchivosGiphy({ data: { id: "x1y2z3", images: { original_mp4: { mp4: "https://evil.example/a.mp4" } } } })?.mp4, null);
  });
});
