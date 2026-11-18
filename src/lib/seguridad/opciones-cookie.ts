/**
 * Opciones de las cookies de preferencia que pone el servidor (país, plataforma, tienda): fuera del alcance de JavaScript
 * (ningún código del navegador las lee: las lee el servidor y llegan a la página como datos), solo por https en producción,
 * `SameSite=Lax` y para toda la app (auditoría de seguridad, 18 nov 2026).
 */
export function opcionesCookiePreferencia(maxAgeSegundos: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSegundos,
  };
}

/** Un año: lo que dura la elección de país, plataforma o tienda. */
export const UN_ANO_SEGUNDOS = 60 * 60 * 24 * 365;
