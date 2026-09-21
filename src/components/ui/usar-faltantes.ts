"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Para un formulario de creación con un botón grande de «Crear» que no se puede accionar hasta llenar lo obligatorio.
 *
 * - `completo`: si el navegador da el formulario por válido (todos los campos `required` llenos y bien). Se recalcula
 *   al escribir (`revisar`, que va en `onInput` y `onChange` del formulario) y después de cada dibujo, porque un campo
 *   obligatorio puede aparecer o desaparecer (los datos de Binance, por ejemplo).
 * - `señalarFaltante()`: al pulsar el botón sin haber llenado todo, lleva la página al primer campo que falta (lo deja
 *   en el centro, con el foco) y lo marca con `faltante` (su `id`); la marca se quita sola cuando ese campo se llena.
 *   Sin movimiento suave si la persona pidió menos animación.
 *
 * Cada campo obligatorio necesita un `id`. Para que se vea: `aria-invalid={faltante === id || undefined}` en el campo
 * (`fieldClass` ya pinta el borde de error) y `<AvisoFaltante id={id} faltante={faltante} />` debajo.
 */
export function useFaltantes() {
  const formRef = useRef<HTMLFormElement>(null);
  const [completo, setCompleto] = useState(false);
  const [faltante, setFaltante] = useState<string | null>(null);

  const revisar = useCallback(() => {
    const formulario = formRef.current;
    if (!formulario) return;
    setCompleto(formulario.checkValidity());
    // La marca de «falta este dato» se quita cuando el campo ya se llenó (o ya no existe).
    setFaltante((id) => {
      const campo = id ? (document.getElementById(id) as HTMLInputElement | null) : null;
      return campo && !campo.validity.valid ? id : null;
    });
  }, []);

  useEffect(() => {
    revisar();
  });

  const señalarFaltante = useCallback(() => {
    const primero = formRef.current?.querySelector<HTMLElement>(":invalid:not(form):not(fieldset)");
    if (!primero) return false;
    if (primero.id) setFaltante(primero.id);
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    primero.scrollIntoView({ block: "center", behavior: reducido ? "auto" : "smooth" });
    primero.focus({ preventScroll: true });
    return true;
  }, []);

  return { formRef, completo, faltante, revisar, señalarFaltante };
}
