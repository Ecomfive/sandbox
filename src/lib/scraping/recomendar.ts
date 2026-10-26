// Scraping de proveedores › qué hacer con cada producto de los proveedores referentes (pedido de Hernán, 26 oct 2026: «que tú mismo
// me vayas recomendando»). Dropi no muestra las ventas de otros proveedores, así que se estiman con lo que BAJA el stock entre una
// búsqueda y la siguiente (una subida es una reposición: no cuenta). Con eso, los cruces (ya testeado, ya en Producto, enviado a
// Selección) y en cuántos proveedores aparece, cada producto queda en Testear, Mirar de cerca, Ya lo tenemos o Sin señales, con una
// frase de por qué. Sin base ni React, con prueba.

export type Recomendacion = "testear" | "mirar" | "tenemos" | "sin_senales";

export const RECOMENDACIONES: { valor: Recomendacion; etiqueta: string; color: string; detalle: string }[] = [
  { valor: "testear", etiqueta: "Testear", color: "#18181b", detalle: "Se vende y todavía no lo tenemos" },
  { valor: "mirar", etiqueta: "Mirar de cerca", color: "#b45309", detalle: "Se mueve, pero falta ver si es tendencia" },
  { valor: "tenemos", etiqueta: "Ya lo tenemos", color: "#71717a", detalle: "Ya testeado, en Producto o en Selección" },
  { valor: "sin_senales", etiqueta: "Sin señales", color: "#a1a1aa", detalle: "No se movió en 30 días" },
];

/** Unidades (estimadas) a partir de las que se recomienda. */
export const UMBRALES = {
  /** Testear: bajó al menos esto en 30 días… */
  testear: 60,
  /** …o esto, si además lo vende otro proveedor (es tendencia en más de un lado). */
  testearRepetido: 20,
  /** Mirar de cerca: bajó al menos esto. */
  mirar: 10,
  /** Un producto visto por primera vez hace menos de estos días es «nuevo». */
  diasNuevo: 14,
} as const;

export interface EventoStock {
  /** ISO. */
  fecha: string;
  stock: number | null;
  stockAntes: number | null;
}

/** Lo que bajó el stock desde `desde` (ISO): la suma de cada bajada entre búsquedas; lo que sube es reposición y no cuenta. */
export function ventasEstimadas(eventos: EventoStock[], desde: string): number {
  let total = 0;
  for (const e of eventos) {
    if (e.fecha < desde || e.stock === null || e.stockAntes === null) continue;
    if (e.stock < e.stockAntes) total += e.stockAntes - e.stock;
  }
  return total;
}

const dias = (desde: string, hasta: string) => Math.floor((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);
const u = (n: number) => `${n.toLocaleString("es-PA")} u.`;
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

export interface DatosRecomendacion {
  estado: "activo" | "privado" | "desaparecido";
  motivo: "agotado" | "privatizado" | "desconocido" | null;
  ventas30: number;
  /** Los otros proveedores o fuentes donde aparece el mismo producto. */
  repetidoEn: string[];
  yaVisto: { tipo: "test" | "producto"; nombre: string } | null;
  enSeleccion: boolean;
  /** Hace cuántos días apareció si es nuevo (`esNuevo`), o null. */
  nuevoHaceDias: number | null;
}

/**
 * Si un producto es nuevo y hace cuántos días apareció: visto por primera vez hace menos de `UMBRALES.diasNuevo` días Y después de
 * la primera búsqueda de su proveedor (lo que ya estaba cuando se empezó a seguir al proveedor no es nuevo, aunque se haya visto
 * hace poco). `inicioProveedor` = la primera vez que se vio cualquier producto de ese proveedor.
 */
export function esNuevo(primeraVez: string, inicioProveedor: string, ahora: string): number | null {
  if (Date.parse(primeraVez) - Date.parse(inicioProveedor) < 86_400_000) return null;
  const d = dias(primeraVez, ahora);
  return d < UMBRALES.diasNuevo ? Math.max(0, d) : null;
}

/** Qué hacer con el producto y por qué, en una frase. */
export function recomendar(d: DatosRecomendacion): { tipo: Recomendacion; porQue: string } {
  const nuevoHace = d.nuevoHaceDias;
  const partes: string[] = [];
  if (d.ventas30 > 0) partes.push(`bajó ~${u(d.ventas30)} de stock en 30 días`);
  if (d.repetidoEn.length) partes.push(`también lo ${d.repetidoEn.length === 1 ? "tiene" : "tienen"} ${lista(d.repetidoEn)}`);
  if (nuevoHace !== null) partes.push(nuevoHace === 0 ? "apareció hoy" : `apareció hace ${nuevoHace} ${nuevoHace === 1 ? "día" : "días"}`);
  if (d.estado === "privado") partes.push("un dropshipper lo tiene privado");
  if (d.estado === "desaparecido") partes.push(d.motivo === "agotado" ? "se agotó" : d.motivo === "privatizado" ? "lo privatizaron" : "dejó de aparecer");
  const frase = (fin: string) => {
    const t = partes.length ? `${partes.join(", ")}. ${fin}` : fin;
    return t.charAt(0).toUpperCase() + t.slice(1);
  };

  if (d.yaVisto || d.enSeleccion) {
    const que = d.yaVisto ? (d.yaVisto.tipo === "test" ? `Ya se testeó: ${d.yaVisto.nombre}.` : `Ya está en Producto: ${d.yaVisto.nombre}.`) : "Ya se envió a Selección.";
    return { tipo: "tenemos", porQue: frase(que) };
  }
  const falta = "No está en Test productos ni en Producto.";
  const vendeFuerte = d.ventas30 >= UMBRALES.testear || (d.repetidoEn.length > 0 && d.ventas30 >= UMBRALES.testearRepetido);
  if (vendeFuerte && d.estado !== "desaparecido") return { tipo: "testear", porQue: frase(falta) };
  if (d.ventas30 >= UMBRALES.mirar || d.repetidoEn.length > 0 || (nuevoHace !== null && d.ventas30 > 0) || (d.estado === "desaparecido" && d.motivo === "agotado" && d.ventas30 > 0))
    return { tipo: "mirar", porQue: frase(falta) };
  return { tipo: "sin_senales", porQue: frase(d.ventas30 === 0 ? "No se movió en 30 días." : "Se mueve poco.") };
}
