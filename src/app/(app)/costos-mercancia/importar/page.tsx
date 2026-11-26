import { redirect } from "next/navigation";
import { requireModulo } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Los costos ya no se importan desde Excel (0992): se cargan en la hoja de Costos de producto. */
export default async function ImportarCostosPage() {
  await requireModulo("costos-mercancia");
  redirect("/costos-mercancia");
}
