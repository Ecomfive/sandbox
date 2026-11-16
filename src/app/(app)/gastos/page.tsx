import { redirect } from "next/navigation";

// «Nómina y gastos» se quitó el 16 nov 2026 (pedido del equipo: «los gastos ya se registran en el libro, que haya un solo lugar de registro»): nunca
// tuvo registros y nada más la leía. Los gastos se anotan en el Libro de movimientos; la nómina y la planilla, en Nómina. Un enlace viejo lleva al libro.
export default function GastosPage() {
  redirect("/libro-movimientos");
}
