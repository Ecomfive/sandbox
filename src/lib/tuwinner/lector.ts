// El lector de Tu Winner en la extensión «Ecomfive · Dropi» (0.5.0, 2 nov 2026): corre en la pestaña de app.tuwinner.com («tw» en la extensión) y
// sube un solo archivo. Copia exacta de scripts/tuwinner-navegador.js en extension/ecomfive-dropi/lectores/tuwinner.js (la prueba lo exige).

export const LECTOR_TUWINNER = { pais: "tw", archivo: "lectores/tuwinner.js", funcion: "leerTuWinner", estado: "__tuwinner", archivos: ["tuwinner"] } as const;

/** La versión de la extensión que trae el lector de Tu Winner. */
export const VERSION_EXTENSION_TUWINNER = "0.5.0";
