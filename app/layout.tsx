import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "给你的生日档案",
  description: "一封写给你的信，和几份想亲手交给你的礼物。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
