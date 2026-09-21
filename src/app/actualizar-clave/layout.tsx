import type { ReactNode } from "react";

// La página es de cliente (lee la invitación del enlace) y no puede exportar su título: lo pone este layout.
export const metadata = { title: "Elegir contraseña" };

export default function ActualizarClaveLayout({ children }: { children: ReactNode }) {
  return children;
}
