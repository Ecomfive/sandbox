import { redirect } from "next/navigation";
import { getUsuarioSesionBruta } from "@/lib/auth";
import { factorTotp, segundoPasoCumplido } from "@/lib/seguridad/segundo-paso-servidor";
import { VerificarFormulario } from "./verificar-formulario";

export const dynamic = "force-dynamic";

/**
 * El segundo paso del ingreso: sin contraseña puesta vuelve a entrar; con el segundo paso ya cumplido (o apagado) pasa al sistema. Quien
 * tiene la app autenticadora pone su código; quien no, la activa aquí mismo.
 */
export default async function VerificarPage() {
  const usuario = await getUsuarioSesionBruta();
  if (!usuario) redirect("/login");
  if (await segundoPasoCumplido(usuario.id)) redirect("/");
  const totp = await factorTotp();
  return <VerificarFormulario conTotp={!!totp} />;
}
