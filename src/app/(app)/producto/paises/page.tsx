import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** «Por país» estuvo unas horas en Producto (5 nov 2026): ahora vive en Compras. */
export default function PorPaisAntes() {
  redirect("/compras/por-pais");
}
