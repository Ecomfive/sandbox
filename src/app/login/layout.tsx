import type { ReactNode } from "react";

// La página de acceso es de cliente (usa un formulario con estado) y no puede exportar su título: lo pone este layout.
export const metadata = { title: "Iniciar sesión" };

export default function LoginLayout({ children }: { children: ReactNode }) {
  return children;
}
