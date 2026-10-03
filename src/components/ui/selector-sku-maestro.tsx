"use client";

import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { fieldClass } from "@/components/ui/field";

/** Un SKU maestro para elegir: su código es la identidad del producto en todo el sistema. */
export interface OpcionSkuMaestro {
  id: string;
  codigo: string;
  nombre: string;
  estado: string;
}

interface Contexto {
  opciones: OpcionSkuMaestro[];
  idLista: string;
}
const SkusMaestrosContext = createContext<Contexto>({ opciones: [], idLista: "" });

/**
 * Pone a disposición de las fichas de producto (Shopify, Dropi) los SKU maestros que se pueden elegir. La lista del
 * navegador (`datalist`) se dibuja una sola vez aquí y la comparten todos los campos, así que no pesa aunque haya
 * muchas variantes.
 */
export function ProveedorSkusMaestros({ opciones, children }: { opciones: OpcionSkuMaestro[]; children: ReactNode }) {
  const idLista = useId();
  const valor = useMemo(() => ({ opciones, idLista }), [opciones, idLista]);
  return (
    <SkusMaestrosContext.Provider value={valor}>
      <datalist id={idLista}>
        {opciones.map((o) => (
          <option key={o.id} value={etiqueta(o)} />
        ))}
      </datalist>
      {children}
    </SkusMaestrosContext.Provider>
  );
}

const etiqueta = (s: OpcionSkuMaestro) => `${s.codigo} · ${s.nombre}`;

/**
 * Elige el SKU maestro de una variante o de un producto: se escribe parte del código o del nombre y se escoge de la
 * lista. No acepta texto libre: si lo escrito no es uno de la lista, al salir del campo se vuelve al que estaba.
 * Comparte una sola lista (`datalist`) entre todos los campos, así que no pesa aunque haya muchas variantes.
 */
export function CampoSkuMaestro({
  valor,
  alCambiar,
  etiquetaAria = "SKU maestro",
  placeholder = "Código o nombre del SKU maestro",
  className = "",
  deshabilitado,
}: {
  valor: string | null;
  alCambiar: (sku: OpcionSkuMaestro | null) => void;
  etiquetaAria?: string;
  placeholder?: string;
  className?: string;
  deshabilitado?: boolean;
}) {
  const { opciones, idLista } = useContext(SkusMaestrosContext);
  const actual = useMemo(() => opciones.find((o) => o.id === valor) ?? null, [opciones, valor]);
  const [texto, setTexto] = useState<string | null>(null); // null = mostrar el elegido
  const mostrado = texto ?? (actual ? etiqueta(actual) : "");

  function alEscribir(t: string) {
    setTexto(t);
    const exacto = opciones.find((o) => etiqueta(o) === t || o.codigo.toLowerCase() === t.trim().toLowerCase());
    if (exacto) {
      alCambiar(exacto);
      setTexto(null);
    } else if (t.trim() === "") {
      alCambiar(null);
    }
  }

  return (
    <>
      <input
        type="text"
        list={idLista}
        value={mostrado}
        disabled={deshabilitado}
        autoComplete="off"
        aria-label={etiquetaAria}
        placeholder={placeholder}
        onChange={(e) => alEscribir(e.target.value)}
        onBlur={() => setTexto(null)}
        className={`${fieldClass} w-full ${className}`.trim()}
      />
    </>
  );
}
