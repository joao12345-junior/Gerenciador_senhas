import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	// argon2 é módulo nativo: o Next não deve empacotá-lo
	serverExternalPackages: ["argon2"],
};

export default nextConfig;
