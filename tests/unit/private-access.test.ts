// tests/unit/private-access.test.ts

import { describe, expect, it } from "vitest";
import {
	type PrivateAccessMode,
	privateAccessMode,
} from "@/core/domain/private-access";
import type { Role } from "@/core/domain/role";

const cases: [Role, Role, PrivateAccessMode][] = [
	["usuario", "usuario", "none"],
	["usuario", "coordenacao", "none"],
	["usuario", "chefe", "none"],
	["usuario", "admin", "none"],
	["coordenacao", "usuario", "with-reason"],
	["coordenacao", "coordenacao", "with-reason"],
	["coordenacao", "chefe", "none"],
	["coordenacao", "admin", "none"],
	["chefe", "usuario", "direct"],
	["chefe", "coordenacao", "direct"],
	["chefe", "chefe", "none"],
	["chefe", "admin", "none"],
	["admin", "usuario", "direct"],
	["admin", "coordenacao", "direct"],
	["admin", "chefe", "direct"],
	["admin", "admin", "direct"],
];

describe("privateAccessMode", () => {
	it.each(cases)(
		"visualizador %s, dono %s -> %s",
		(viewer, owner, expected) => {
			expect(privateAccessMode(viewer, owner)).toBe(expected);
		},
	);
});
