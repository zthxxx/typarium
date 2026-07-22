import { describeAdapterContract } from '#/core/analysis/adapter-contract.ts'
import { createFakeAdapter } from '#/core/analysis/fake-adapter.ts'

describeAdapterContract('fake reference language', () =>
  Promise.resolve({
    adapter: createFakeAdapter({ autoResolve: true }),
    virtualType: { name: 'ab', typeText: 'a | b' },
  }),
)
