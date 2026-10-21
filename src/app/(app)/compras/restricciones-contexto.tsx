"use client";

import { createContext, useContext, type ReactNode } from "react";
import { SIN_RESTRICCIONES, accionPermitidaEnCompras, campoEditable, campoOculto, type RestriccionesCompras } from "./permisos-compras";

// Lo que el rol (o la ficha) de la persona tiene limitado dentro de Compras (Usuarios y roles › Afinar), disponible para cualquier
// pieza de la pantalla sin pasarlo de mano en mano. Los datos que no ve ya no llegan del servidor: esto solo esconde sus etiquetas
// y apaga lo que no puede cambiar.
const Contexto = createContext<RestriccionesCompras>(SIN_RESTRICCIONES);

export const ProveedorRestricciones = Contexto.Provider;
export const useRestricciones = () => useContext(Contexto);

/** ¿Puede usar esta acción (crear, anular, comentar…)? */
export function usePuedeAccion(accion: string): boolean {
  return accionPermitidaEnCompras(useContext(Contexto), accion);
}

/**
 * Un campo de un formulario o de una ficha: no se dibuja si la persona no lo ve y, si solo lo ve, queda apagado (sus controles se
 * deshabilitan, así que tampoco viaja al guardar).
 */
export function CampoGobernado({ clave, children }: { clave: string; children: ReactNode }) {
  const r = useContext(Contexto);
  if (campoOculto(r, clave)) return null;
  if (!campoEditable(r, clave)) return <fieldset disabled className="m-0 contents min-w-0 border-0 p-0">{children}</fieldset>;
  return <>{children}</>;
}

/** Un dato de solo lectura de una ficha: no se dibuja (ni su etiqueta) si la persona no lo ve. */
export function DatoGobernado({ clave, children }: { clave: string; children: ReactNode }) {
  return campoOculto(useContext(Contexto), clave) ? null : <>{children}</>;
}
