import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { POLITICA_BASE, llevaPoliticaConNonce, nuevoNonce, politicaConNonce, scriptsEstrictos } from "@/lib/seguridad/cabeceras";

export async function middleware(request: NextRequest) {
  if (!llevaPoliticaConNonce(request.nextUrl.pathname)) return await updateSession(request);

  // Política de contenido con un nonce por petición (auditoría de seguridad, 18 nov 2026): Next lee la política de la
  // cabecera de la petición y pone el nonce en sus propios scripts; el layout raíz lo lee de `x-nonce` para el script del
  // tema. La misma política va en la respuesta, que es la que aplica el navegador.
  const nonce = nuevoNonce();
  const politica = politicaConNonce(nonce, process.env.NODE_ENV === "development");
  const cabeceras = new Headers(request.headers);
  cabeceras.set("x-nonce", nonce);
  cabeceras.set("content-security-policy", politica);
  // La página que se pidió, para volver a ella tras la verificación en dos pasos (`irADosPasosSiFalta`, seguridad · 19 nov 2026).
  // Se pisa siempre: una `x-ruta` que mande el navegador no llega a la página.
  cabeceras.set("x-ruta", `${request.nextUrl.pathname}${request.nextUrl.search}`);

  const respuesta = await updateSession(request, cabeceras);
  // Mientras no se prenda `CSP_SCRIPTS_ESTRICTA`, el límite de scripts solo avisa (en la consola del navegador) y no bloquea:
  // se prende cuando se comprobó que ninguna pantalla lo dispara. La base (incrustar, formularios, plugins) sí se aplica.
  if (scriptsEstrictos(process.env)) {
    respuesta.headers.set("Content-Security-Policy", politica);
  } else {
    respuesta.headers.set("Content-Security-Policy", POLITICA_BASE);
    respuesta.headers.set("Content-Security-Policy-Report-Only", politica);
  }
  return respuesta;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
