import { describeAdapterContract } from './adapter-contract.ts'
import { createFakeAdapter } from './fake-adapter.ts'

describeAdapterContract('fake reference language', () =>
  Promise.resolve({
    adapter: createFakeAdapter({ autoResolve: true }),
    virtualType: { name: 'ab', typeText: 'a | b' },
  }),
)
