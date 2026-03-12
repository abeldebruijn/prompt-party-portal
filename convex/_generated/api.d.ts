/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as game_constants from "../game/constants.js";
import type * as game_random from "../game/random.js";
import type * as game_scoring from "../game/scoring.js";
import type * as http from "../http.js";
import type * as imageGame from "../imageGame.js";
import type * as image_game_actions from "../image_game/actions.js";
import type * as image_game_constants from "../image_game/constants.js";
import type * as image_game_eligibility from "../image_game/eligibility.js";
import type * as image_game_helpers from "../image_game/helpers.js";
import type * as image_game_imageGeneration from "../image_game/imageGeneration.js";
import type * as image_game_mutations from "../image_game/mutations.js";
import type * as image_game_queries from "../image_game/queries.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_lobby from "../lib/lobby.js";
import type * as lobbies from "../lobbies.js";
import type * as lobbies_constants from "../lobbies/constants.js";
import type * as lobbies_helpers from "../lobbies/helpers.js";
import type * as lobbies_mutations from "../lobbies/mutations.js";
import type * as lobbies_queries from "../lobbies/queries.js";
import type * as lobbies_types from "../lobbies/types.js";
import type * as textGame from "../textGame.js";
import type * as text_game_constants from "../text_game/constants.js";
import type * as text_game_helpers from "../text_game/helpers.js";
import type * as text_game_mutations from "../text_game/mutations.js";
import type * as text_game_queries from "../text_game/queries.js";
import type * as userEmailChange from "../userEmailChange.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  "game/constants": typeof game_constants;
  "game/random": typeof game_random;
  "game/scoring": typeof game_scoring;
  http: typeof http;
  imageGame: typeof imageGame;
  "image_game/actions": typeof image_game_actions;
  "image_game/constants": typeof image_game_constants;
  "image_game/eligibility": typeof image_game_eligibility;
  "image_game/helpers": typeof image_game_helpers;
  "image_game/imageGeneration": typeof image_game_imageGeneration;
  "image_game/mutations": typeof image_game_mutations;
  "image_game/queries": typeof image_game_queries;
  "lib/auth": typeof lib_auth;
  "lib/lobby": typeof lib_lobby;
  lobbies: typeof lobbies;
  "lobbies/constants": typeof lobbies_constants;
  "lobbies/helpers": typeof lobbies_helpers;
  "lobbies/mutations": typeof lobbies_mutations;
  "lobbies/queries": typeof lobbies_queries;
  "lobbies/types": typeof lobbies_types;
  textGame: typeof textGame;
  "text_game/constants": typeof text_game_constants;
  "text_game/helpers": typeof text_game_helpers;
  "text_game/mutations": typeof text_game_mutations;
  "text_game/queries": typeof text_game_queries;
  userEmailChange: typeof userEmailChange;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
