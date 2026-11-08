import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "屏菓悟 AI影视工作台",
  description: "从剧本、画风与资产，到智能分镜和视频制作。",
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
