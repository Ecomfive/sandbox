import { redirect } from "next/navigation";

/** La pestaña «Envíos a Dropi» pasó a ser «Remisiones» (a cualquier bodega externa). */
export default function EnviosDropiPage() {
  redirect("/inventario/remisiones");
}
