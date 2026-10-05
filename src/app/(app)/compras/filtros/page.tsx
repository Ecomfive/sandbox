import { redirect } from "next/navigation";

/** Filtros salió de Compras: ahora es «Filtro de productos», en Marketing. */
export default function FiltrosAntiguo() {
  redirect("/filtro-productos");
}
