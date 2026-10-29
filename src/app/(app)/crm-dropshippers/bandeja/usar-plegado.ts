"use client";

import { useCallback, useSyncExternalStore } from "react";

// Qué bloques de la ficha del chat se dejaron plegados (29 oct 2026), por chat: se guarda en el navegador de cada persona para que, al volver a abrir un chat que ya leyó, siga plegado.
// Sin almacenamiento (ventana privada) se recuerda mientras la página siga abierta.

const CLAVE = "bandeja-bloques-plegados-v1";
const oyentes = new Set<() => void>();
let enMemoria: string | null = null;
let cache: Set<string> | null = null;

function leer(): Set<string> {
  if (cache) return cache;
  let texto = enMemoria;
  try {
    texto = localStorage.getItem(CLAVE) ?? texto;
  } catch {
    // Sin almacenamiento: solo en memoria.
  }
  try {
    const lista: unknown = texto ? JSON.parse(texto) : [];
    cache = new Set(Array.isArray(lista) ? lista.filter((x): x is string => typeof x === "string") : []);
  } catch {
    cache = new Set();
  }
  return cache;
}

function escribir(nuevo: Set<string>) {
  cache = nuevo;
  // Se guardan solo los últimos 300 chats para que no crezca sin fin.
  enMemoria = JSON.stringify([...nuevo].slice(-300));
  try {
    localStorage.setItem(CLAVE, enMemoria);
  } catch {
    // Sin almacenamiento: queda en memoria.
  }
  oyentes.forEach((o) => o());
}

const suscribir = (o: () => void) => {
  oyentes.add(o);
  return () => oyentes.delete(o);
};

/** Si el bloque `clave` está plegado y cómo plegarlo o desplegarlo. En el servidor y en la primera pintura del navegador siempre sale desplegado. */
export function usePlegado(clave: string): [boolean, () => void] {
  const plegado = useSyncExternalStore(
    suscribir,
    () => leer().has(clave),
    () => false,
  );
  const alternar = useCallback(() => {
    const nuevo = new Set(leer());
    if (nuevo.has(clave)) nuevo.delete(clave);
    else nuevo.add(clave);
    escribir(nuevo);
  }, [clave]);
  return [plegado, alternar];
}
