import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Memories",
  description:
    "Advisory Committee on AI and Innovation × Library Relaxation Week — generate a 5-second memory.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
