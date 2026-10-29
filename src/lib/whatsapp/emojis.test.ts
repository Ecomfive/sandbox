import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { GRUPOS_EMOJIS } from "./emojis";

describe("emojis del selector", () => {
  it("cada grupo trae emojis completos (no pedazos) y sin repetir", () => {
    for (const g of GRUPOS_EMOJIS) {
      assert.ok(g.emojis.length >= 20, `${g.id} tiene pocos`);
      assert.equal(new Set(g.emojis).size, g.emojis.length, `${g.id} repite emojis`);
      for (const emoji of g.emojis) assert.ok(/\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(emoji), `«${emoji}» en ${g.id} no es un emoji`);
    }
  });
  it("una bandera es un solo emoji (dos letras regionales juntas)", () => {
    const banderas = GRUPOS_EMOJIS.find((g) => g.id === "banderas")!.emojis;
    assert.ok(banderas.includes("🇵🇦"));
    assert.ok(banderas.every((b) => [...b].length === 2));
  });
});
