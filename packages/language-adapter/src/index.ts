export type {
  BootProgressEvent,
  CompletionEntry,
  CompletionPreferences,
  EditorCapabilities,
  FormatOptions,
  InlineQuery,
  LanguageAdapter,
  LanguageDescriptor,
  LanguagePreset,
  PresetCategory,
  SnippetSyntax,
  SpecialTypeNames,
  VirtualType,
} from './adapter.ts'
export {
  analyzeFakeSource,
  createFakeAdapter,
  EMPTY_RESULT,
} from './fake-adapter.ts'
export type {
  FakeAdapterOptions,
  FakeAnalyzeCall,
  FakeCheckCall,
  FakeLanguageAdapter,
} from './fake-adapter.ts'
// The vitest-based contract suite lives behind the ./contract-tests
// subpath — importing THIS index never pulls a test framework.
