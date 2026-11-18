import { createContext, useContext } from 'react';
import type { Action, AppSnapshot } from '../../src/shared/model';
import { t, type MessageKey } from '../../src/shared/i18n';
export interface LanguageGuard {
  save(): Promise<void>;
  discard(): void;
}
export interface UIContextValue {
  snapshot: AppSnapshot;
  pending: boolean;
  run(action: Action, notice?: MessageKey | false): Promise<AppSnapshot>;
  registerLanguageGuard(guard: LanguageGuard | null): void;
}
export const UIContext = createContext<UIContextValue | null>(null);
export function useUI() {
  const context = useContext(UIContext);
  if (!context) {
    throw new Error('UI context missing');
  }
  return { ...context, tr: (key: MessageKey) => t(context.snapshot.locale, key) };
}
