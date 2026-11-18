// Las puertas de entrada al servidor que NO revisan sesión ni permisos y aun así están bien (o que se dejan anotadas para
// arreglar). La prueba `cierre-acciones.test.ts` revisa que cada función exportada de un archivo "use server" y cada
// GET/POST/... de un `route.ts` llame a una guardia reconocida; lo que no la llama tiene que estar aquí, con su motivo.
//
// Reglas:
// - Agregar algo aquí es decir «esto es público a propósito». Antes, lee la función entera: el sistema usa la llave de
//   servicio de Supabase en todos lados, así que sin una revisión explícita cualquiera en internet puede llamarla.
// - Si la función sí revisa la sesión pero con algo que la prueba no reconoce, mejor agregar esa guardia a la lista de la
//   prueba (`GUARDIAS`) que anotarla aquí.
// - Lo que parece un hueco real se anota con un motivo que empieza con «PENDIENTE:» hasta que se arregle.
// - Una entrada que ya no corresponde a nada (la función se borró o ahora sí tiene guardia) hace fallar la prueba: se quita.

export interface PuertaPermitida {
  /** Ruta desde la raíz del repositorio, con barras normales: `src/app/login/actions.ts`. */
  archivo: string;
  /** El nombre exportado: la acción o el método HTTP (`GET`, `POST`, ...). */
  funcion: string;
  /** Por qué no necesita guardia (o, con «PENDIENTE:», qué falta). */
  motivo: string;
}

export const PUERTAS_PERMITIDAS: readonly PuertaPermitida[] = [
  {
    archivo: "src/app/login/actions.ts",
    funcion: "iniciarSesion",
    motivo: "Es la entrada al sistema: por definición se llama sin sesión. Supabase valida correo y clave.",
  },
  {
    archivo: "src/app/login/actions.ts",
    funcion: "cerrarSesion",
    motivo: "Solo cierra la sesión de quien la llama; sin sesión no hace nada.",
  },
  {
    archivo: "src/lib/plataforma-actions.ts",
    funcion: "setPlataformaActual",
    motivo: "Solo guarda la cookie de preferencia (Dropi o Drop) en el navegador de quien llama; no lee ni cambia datos de la base.",
  },
];
