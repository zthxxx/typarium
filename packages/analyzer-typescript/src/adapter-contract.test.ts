import { describeAdapterContract } from '@typarium/language-adapter/contract-tests'
import { typescriptDescriptor } from './descriptor.ts'
import { createTsAnalyzer } from './index.ts'
import { loadLibFilesFromNodeModules } from './lib-files.node.ts'
import type { LanguageAdapter } from '@typarium/language-adapter'

/**
 * The real TypeScript engine run through the SAME contract suite as
 * the fake language — worker/comlink transport is glue, not contract,
 * so the node build wraps the analyzer directly.
 */
function createNodeTypescriptAdapter(): LanguageAdapter {
  const analyzer = createTsAnalyzer({ libFiles: loadLibFilesFromNodeModules() })
  return {
    descriptor: typescriptDescriptor,
    analyze: (source, virtualTypes) =>
      Promise.resolve(analyzer.analyze(source, virtualTypes)),
    check: (source) => Promise.resolve(analyzer.check(source)),
    editor: {
      quickInfo: (source, offset) =>
        Promise.resolve(analyzer.quickInfo(source, offset)),
      completions: (source, offset, preferences) =>
        Promise.resolve(analyzer.completions(source, offset, preferences)),
      inlineQueries: (source) =>
        Promise.resolve(analyzer.twoslashQueries(source)),
      // format lives in the worker build (prettier standalone import).
    },
    onTypesAcquired: () => () => {},
    onBootProgress: () => () => {},
    warmup: () => Promise.resolve(),
    dispose: () => analyzer.dispose(),
  }
}

describeAdapterContract('typescript 6.0.3', () =>
  Promise.resolve({
    adapter: createNodeTypescriptAdapter(),
    virtualType: { name: 'string', typeText: 'string' },
  }),
)
