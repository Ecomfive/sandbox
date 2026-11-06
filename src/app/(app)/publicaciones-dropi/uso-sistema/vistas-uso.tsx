"use client";

import { useState, type ReactNode } from "react";
import { Segmentado } from "@/components/panel/piezas-panel";

type Vista = "personas" | "publicaciones";

const VISTAS: { valor: Vista; etiqueta: string }[] = [
  { valor: "personas", etiqueta: "Personas" },
  { valor: "publicaciones", etiqueta: "Publicaciones" },
];

/** Las dos miradas de Uso del sistema: quién usa qué, y qué se creó dónde. */
export function VistasUso({ personas, publicaciones }: { personas: ReactNode; publicaciones: ReactNode }) {
  const [vista, setVista] = useState<Vista>("personas");
  return (
    <div className="flex flex-col gap-4">
      <div className="self-start">
        <Segmentado etiqueta="Vista" opciones={VISTAS} valor={vista} alCambiar={setVista} />
      </div>
      {vista === "personas" ? personas : publicaciones}
    </div>
  );
}
