import type { ReactNode } from "react";
import { SelectorGestionIds } from "@/components/plataformas/selector-gestion-ids";

/** Arriba de cada pestaña de Gestión de IDs Drop: el selector con los logos para pasar a Dropi, Drop o Effi (solo en Costa Rica). */
export default function LayoutDrop({ children }: { children: ReactNode }) {
  return <SelectorGestionIds actual="drop">{children}</SelectorGestionIds>;
}
