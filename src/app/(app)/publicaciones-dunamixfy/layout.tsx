import type { ReactNode } from "react";
import { SelectorGestionIds } from "@/components/plataformas/selector-gestion-ids";

/** Arriba de cada pestaña de Gestión de IDs Dunamixfy: el selector con los logos para pasar a Dropi, Drop o Dunamixfy (solo en Costa Rica). */
export default function LayoutDunamixfy({ children }: { children: ReactNode }) {
  return <SelectorGestionIds actual="dunamixfy">{children}</SelectorGestionIds>;
}
