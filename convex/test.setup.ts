/// <reference types="vite-plus/client" />

import { convexTest } from "convex-test";

import schema from "./schema";

export const convexModules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.test.js",
  "!./**/*.d.ts",
]);

export function createConvexTest() {
  return convexTest(schema, convexModules);
}
