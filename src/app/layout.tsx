import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { SinRuedaEnNumeros } from "@/components/sin-rueda-en-numeros";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Cada página pone su nombre («Retiros») y la plantilla le agrega el del producto: «Retiros · Ecomfive».
  title: { default: "Ecomfive Business OS", template: "%s · Ecomfive" },
  description: "Gestión operativa, financiera y de inteligencia competitiva de Ecomfive por país y plataforma",
};

const SCRIPT_TEMA = `
try {
  var tema = localStorage.getItem("tema");
  if (tema === "dark") document.documentElement.dataset.theme = "dark";
} catch (e) {}
`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // El nonce de la política de contenido que puso el middleware (auditoría de seguridad, 18 nov 2026): sin él el
  // navegador no corre este script. Leer la cabecera hace dinámicas todas las páginas (ya lo eran, salvo /login).
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <head>
        {/* Antes del primer pintado, para que no haya parpadeo claro->oscuro al cargar. El navegador esconde el nonce
            del DOM, de ahí `suppressHydrationWarning`. */}
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full bg-background text-foreground">
        <SinRuedaEnNumeros />
        {children}
      </body>
    </html>
  );
}
