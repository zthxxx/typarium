/**
 * The runtime lib-files asset contract (ADR-0020): the worker fetches
 * the comment-stripped default libs from this URL instead of bundling
 * them into its own chunk. `scripts/generate-ts-libs.mjs` emits the
 * asset from node_modules and REFUSES to run if this version and the
 * installed typescript package disagree — URL and content cannot drift.
 */
export const TS_LIBS_VERSION = '6.0.3'

export const tsLibsUrl = `/ts-libs-${TS_LIBS_VERSION}.json`
