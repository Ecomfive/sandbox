// Buscar por monto en la lupa de una tabla (pedido de María José, Oceans, 19 nov 2026: «¿se puede buscar por monto?»).
// La lupa busca texto, así que el monto se escribe de las formas en que alguien lo teclea: «150», «150.25», «150,25»,
// «1,500.25», «1.500,25» y «1500.25», sin el signo. Prueba en `buscar-monto.test.ts`.

/** El monto escrito de varias formas, separadas por espacios, para que la lupa lo encuentre. */
export function textoParaBuscarMonto(monto: number): string {
  if (!Number.isFinite(monto)) return "";
  const abs = Math.abs(monto);
  const [entero, dec] = abs.toFixed(2).split(".");
  const miles = (sep: string) => entero.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  const formas = new Set([
    `${entero}.${dec}`,
    `${entero},${dec}`,
    `${miles(",")}.${dec}`,
    `${miles(".")},${dec}`,
    // Sin decimales cuando el monto es redondo (o el entero, para buscar «150» y encontrar 150.25).
    entero,
    miles(","),
  ]);
  return [...formas].join(" ");
}
