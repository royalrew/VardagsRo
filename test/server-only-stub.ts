/**
 * Next resolves `server-only` through the react-server condition, where the
 * real package is empty. Vitest runs plain Node and would hit the throwing
 * client entry instead, so server modules alias the marker to this stub. The
 * production guard is unaffected.
 */
export {};
