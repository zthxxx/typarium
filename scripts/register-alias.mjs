/**
 * Node resolve hook mapping the app's `#/` path alias onto ./src for
 * scripts that execute src modules directly (strip-types). Node's own
 * `imports` field forbids `#/`-prefixed specifiers, so the vite/tsc
 * alias needs this shim when running outside a bundler.
 */
import { register } from 'node:module'

register(new URL('./alias-loader.mjs', import.meta.url))
