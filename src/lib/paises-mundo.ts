// Todos los países del mundo con su código ISO de dos letras y su nombre en español, sacados del navegador (Intl), para
// agregar uno escribiendo su nombre (sin saberse el código). Sirve en el navegador y en el servidor.

// Códigos de región que no son países (la Unión Europea, la ONU, territorios de ultramar sin bandera propia…).
const NO_SON_PAISES = new Set(["EU", "EZ", "UN", "ZZ", "QO", "XA", "XB", "AC", "CP", "CQ", "DG", "EA", "IC", "TA"]);

let cache: { codigo: string; nombre: string }[] | null = null;

export function paisesDelMundo(): { codigo: string; nombre: string }[] {
  if (cache) return cache;
  const nombres = new Intl.DisplayNames(["es"], { type: "region" });
  const lista: { codigo: string; nombre: string }[] = [];
  for (let a = 65; a <= 90; a++)
    for (let b = 65; b <= 90; b++) {
      const codigo = String.fromCharCode(a, b);
      if (NO_SON_PAISES.has(codigo)) continue;
      let nombre: string | undefined;
      try {
        nombre = nombres.of(codigo);
      } catch {
        continue;
      }
      if (nombre && nombre !== codigo) lista.push({ codigo, nombre });
    }
  cache = lista.sort((x, y) => x.nombre.localeCompare(y.nombre, "es"));
  return cache;
}

/** Para buscar sin importar mayúsculas ni acentos. */
export const normalPais = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
