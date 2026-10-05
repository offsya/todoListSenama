// Expo's global types (process.env, Metro require) without relying on the generated,
// git-ignored expo-env.d.ts, so typechecking works on a fresh clone and in CI.
/// <reference types="expo/types" />

declare namespace NodeJS {
  interface ProcessEnv {
    /** API base URL, inlined at build time. See src/lib/config.ts. */
    readonly EXPO_PUBLIC_API_URL?: string;
  }
}
