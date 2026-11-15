import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: { default: "Dabbat Invoice Portal", template: "%s · Dabbat" }, description: "The private workspace for Dabbat orders and invoices.", robots: { index: false, follow: false } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
