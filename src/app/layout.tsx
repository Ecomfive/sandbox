import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { NavBar } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ecomfive · Gestión de Proveeduría",
  description: "Control administrativo y financiero de proveeduría — Costa Rica y Panamá",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <NavBar />
        {children}
      </body>
    </html>
  );
}
