/// <reference types="vite-plus/client" />

import { convexTest } from "convex-test";

import schema from "./schema";

export const convexModules = import.meta.glob("./**/!(*.*.*)*.*s");

export function createConvexTest() {
  return convexTest(schema, convexModules);
}
