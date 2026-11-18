import { LocalStore, type StateStorage, type StorePorts } from '../../src/core/store';
import { emptyBinding, type LanguageSetting, type TaskInput } from '../../src/shared/model';
export class Memory implements StateStorage {
  readonly values = new Map<string, unknown>();
  fail = false;
  get<T>(key: string, fallback: T): T {
    return structuredClone((this.values.has(key) ? this.values.get(key) : fallback) as T);
  }
  async update(key: string, value: unknown): Promise<void> {
    if (this.fail) {
      throw new Error('storage unavailable');
    }
    this.values.set(key, structuredClone(value));
  }
}
export function fixture(
  options: {
    global?: Memory;
    workspace?: Memory;
    hasWorkspace?: boolean;
    editorLanguage?: string;
  } = {},
) {
  const global = options.global || new Memory(),
    workspace = options.workspace || new Memory();
  const secrets = new Map<string, string>();
  let language: LanguageSetting = 'auto';
  let enteredKey: string | undefined = 'test-only-key';
  let opened = false;
  const ports: StorePorts = {
    global,
    workspace,
    secrets: {
      get: async (key) => secrets.get(key),
      store: async (key, value) => {
        secrets.set(key, value);
      },
      delete: async (key) => {
        secrets.delete(key);
      },
    },
    hasWorkspace: () => options.hasWorkspace !== false,
    workspaceName: () => 'test-workspace',
    editorLanguage: () => options.editorLanguage || 'en',
    getLanguage: () => language,
    setLanguage: async (value) => {
      language = value;
    },
    askKey: async () => enteredKey,
    openWorkspace: async () => {
      opened = true;
    },
  };
  return {
    store: new LocalStore(ports),
    ports,
    global,
    workspace,
    secrets,
    setKey: (value: string | undefined) => {
      enteredKey = value;
    },
    wasOpened: () => opened,
  };
}
export function taskInput(overrides: Partial<TaskInput> = {}): TaskInput {
  return {
    name: 'Fix retry',
    requirements: 'Preserve cancellation behavior.',
    roleId: 'bug',
    maxRounds: 5,
    worker: emptyBinding(),
    reviewer: emptyBinding(),
    ...overrides,
  };
}
