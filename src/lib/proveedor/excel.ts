import ExcelJS from "exceljs";

// Excel del portal del proveedor (28 oct 2026): cada pestaña se baja como un .xlsx con lo que se ve (o con las filas que la persona marcó).
// El archivo se arma en el navegador (esta pieza se carga solo al pulsar «Descargar Excel»). Los números y las fechas van como números y
// fechas de Excel (se pueden sumar, ordenar y filtrar) y el texto como texto: una celda de texto nunca se evalúa como fórmula.
// Desde el 29 oct 2026 (pedido de Hernán) lleva también las fotos, como miniaturas dentro de la celda: por eso se arma con ExcelJS (la
// versión gratuita de SheetJS no escribe imágenes).

export type CeldaExcel = string | number | null;

export interface ColumnaExcel {
  titulo: string;
  /** `entero` y `dinero` son números; `fecha` espera «AAAA-MM-DD»; `imagen` espera la dirección de la foto (lo demás queda como texto). */
  tipo?: "texto" | "entero" | "dinero" | "fecha" | "imagen";
  /** Ancho aproximado en caracteres. */
  ancho?: number;
}

/** Una foto lista para el Excel: `base64` con o sin el prefijo `data:`, y su tamaño en píxeles. */
export interface ImagenExcel {
  base64: string;
  extension: "png" | "jpeg" | "gif";
  ancho: number;
  alto: number;
}

/** Trae y prepara la foto de una dirección; null si no se pudo (la celda queda vacía). */
export type CargarImagen = (url: string) => Promise<ImagenExcel | null>;

const FORMATO = { entero: "#,##0", dinero: "#,##0.00", fecha: "yyyy-mm-dd" } as const;
const ES_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
/** Lado del cuadro donde cabe cada foto (píxeles en pantalla) y alto de una fila con foto (puntos). */
const LADO_FOTO = 64;
const ALTO_FILA_FOTO = 54;
/** Cuántas fotos se traen a la vez. */
const A_LA_VEZ = 6;

/** El nombre de una hoja: Excel admite hasta 31 caracteres y no deja `: \ / ? * [ ]`. */
export function nombreHoja(texto: string): string {
  return texto.replace(/[:\\/?*[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31) || "Hoja";
}

function valorCelda(valor: CeldaExcel, tipo: ColumnaExcel["tipo"]): { v: string | number | Date; z?: string } | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (tipo === "entero" || tipo === "dinero") {
    const n = Number(valor);
    return Number.isFinite(n) ? { v: n, z: FORMATO[tipo] } : { v: String(valor) };
  }
  if (tipo === "fecha") {
    const m = ES_FECHA.exec(String(valor));
    return m ? { v: new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))), z: FORMATO.fecha } : { v: String(valor) };
  }
  // Un texto se guarda como texto aunque empiece con «=»: ExcelJS solo escribe fórmulas cuando se le da `{ formula }`.
  return { v: String(valor) };
}

/** Corre `tarea` sobre cada elemento, `limite` a la vez. */
async function enTandas<T>(items: T[], limite: number, tarea: (item: T) => Promise<void>) {
  let siguiente = 0;
  const trabajador = async () => {
    while (siguiente < items.length) await tarea(items[siguiente++]);
  };
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
}

/**
 * Un .xlsx de una hoja: la fila de títulos (fija al bajar) y una fila por cada arreglo de `filas`, con filtros en los títulos. Las columnas
 * `imagen` llevan la foto en miniatura si se pasa `cargarImagen` (cada dirección se trae una sola vez); si no, o si la foto no se pudo
 * traer, la celda queda vacía.
 */
export async function filasAXlsx(hoja: string, columnas: ColumnaExcel[], filas: CeldaExcel[][], cargarImagen?: CargarImagen): Promise<Uint8Array> {
  const libro = new ExcelJS.Workbook();
  const ws = libro.addWorksheet(nombreHoja(hoja), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = columnas.map((c) => ({ width: c.ancho ?? (c.tipo === "imagen" ? 11 : c.tipo === "texto" || !c.tipo ? 28 : 14) }));
  const titulos = ws.getRow(1);
  columnas.forEach((c, j) => {
    titulos.getCell(j + 1).value = c.titulo;
  });
  titulos.font = { bold: true };

  const fotos: { fila: number; columna: number; url: string }[] = [];
  filas.forEach((fila, i) => {
    const row = ws.getRow(i + 2);
    columnas.forEach((c, j) => {
      const valor = fila[j] ?? null;
      if (c.tipo === "imagen") {
        if (typeof valor === "string" && valor) fotos.push({ fila: i + 1, columna: j, url: valor });
        return;
      }
      const x = valorCelda(valor, c.tipo);
      if (!x) return;
      const cell = row.getCell(j + 1);
      cell.value = x.v;
      if (x.z) cell.numFmt = x.z;
      cell.alignment = { vertical: "middle", wrapText: c.tipo === "texto" || !c.tipo };
    });
  });

  if (cargarImagen && fotos.length) {
    const ids = new Map<string, { id: number; ancho: number; alto: number } | null>();
    await enTandas([...new Set(fotos.map((f) => f.url))], A_LA_VEZ, async (url) => {
      const img = await cargarImagen(url).catch(() => null);
      ids.set(url, img && img.ancho > 0 && img.alto > 0 ? { id: libro.addImage({ base64: img.base64, extension: img.extension }), ancho: img.ancho, alto: img.alto } : null);
    });
    for (const f of fotos) {
      const img = ids.get(f.url);
      if (!img) continue;
      // La foto cabe en un cuadro de LADO_FOTO sin deformarse.
      const k = Math.min(1, LADO_FOTO / Math.max(img.ancho, img.alto));
      ws.addImage(img.id, { tl: { col: f.columna, row: f.fila }, ext: { width: Math.round(img.ancho * k), height: Math.round(img.alto * k) }, editAs: "oneCell" });
      ws.getRow(f.fila + 1).height = ALTO_FILA_FOTO;
    }
  }

  // Filtros en los títulos, para ordenar y buscar.
  if (columnas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(filas.length + 1, 1), column: columnas.length } };
  return new Uint8Array(await libro.xlsx.writeBuffer());
}

/** `ecomfive-enviado-2026-10-28.xlsx` (solo letras, números y guiones). */
export function nombreArchivoExcel(clave: string, ahora: Date): string {
  const limpia = clave.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "datos";
  return `ecomfive-${limpia}-${ahora.toISOString().slice(0, 10)}.xlsx`;
}
