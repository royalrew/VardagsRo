/**
 * Types for the plain JavaScript the deployed image runs. The script itself has
 * to stay dependency-free, but the test that keeps it honest is TypeScript.
 */
export declare function hashPasswordForAuth(password: string): Promise<string>;
