import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy do Next 16 (antes middleware.ts). Roda antes de toda requisição.
 * Por enquanto deixa tudo passar; depois fará só a checagem otimista do cookie de sessão.
 * A validação real da sessão fica no auth-guard, nunca aqui.
 */
export function proxy(_request: NextRequest): NextResponse {
	return NextResponse.next();
}

export const config = {
	// Ignora arquivos estáticos e internos do Next
	matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
