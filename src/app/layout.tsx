import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import "./globals.css";

// Inter = texto da interface; JetBrains Mono = só logins e senhas
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrainsMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="pt-BR" className={cn(inter.variable, jetbrainsMono.variable)}>
			<body>{children}</body>
		</html>
	);
}
