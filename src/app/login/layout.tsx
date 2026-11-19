import type { ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";
import { irADosPasosSiFalta } from "@/lib/auth";

// La página de acceso es de cliente (usa un formulario con estado) y no puede exportar su título: lo pone este layout.
export const metadata = { title: "Iniciar sesión" };

export default async function LoginLayout({ children }: { children: ReactNode }) {
  // Quien ya entró con su contraseña pero le falta la verificación en dos pasos sigue en /dos-pasos (seguridad · 19 nov 2026):
  // varias páginas mandan a /login cuando no hay usuario, y para esa persona no lo hay hasta escribir el código. Si leer el perfil
  // falla (la base no responde), se muestra el login igual en vez de romper la página; la redirección de Next sí se deja pasar.
  try {
    await irADosPasosSiFalta();
  } catch (e) {
    unstable_rethrow(e);
    console.error("[dos-pasos] no se pudo revisar la verificación en /login", e);
  }
  return children;
}
