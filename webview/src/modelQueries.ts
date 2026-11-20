import { useCallback, useEffect, useRef, useState } from 'react';
import {
  modelErrorCodes,
  type Bridge,
  type ModelErrorCode,
  type ModelQueryState,
} from '../../src/shared/model';

/** Cache only within this mounted workbench, shared by all its model selectors. */
export function useModelQueries(bridge: Bridge) {
  const [models, setModels] = useState<Record<string, ModelQueryState>>({});
  const active = useRef(new Map<string, symbol>());
  useEffect(() => {
    const requests = active.current;
    const unsubscribe = bridge.onModelsInvalidated((id) => {
      requests.delete(id);
      setModels((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    });
    return () => {
      unsubscribe();
      requests.clear();
    };
  }, [bridge]);
  const queryModels = useCallback(
    async (id: string) => {
      if (active.current.has(id)) {
        return;
      }
      const token = Symbol(id);
      active.current.set(id, token);
      setModels((current) => ({ ...current, [id]: { status: 'loading', models: [] } }));
      try {
        const result = await bridge.queryModels(id);
        if (active.current.get(id) === token) {
          setModels((current) => ({ ...current, [id]: { status: 'success', ...result } }));
        }
      } catch (error) {
        if (active.current.get(id) !== token) {
          return;
        }
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        const known = modelErrorCodes.includes(code as ModelErrorCode)
          ? (code as ModelErrorCode)
          : 'modelsFailed';
        setModels((current) => ({
          ...current,
          [id]: { status: 'error', models: [], error: known },
        }));
      } finally {
        if (active.current.get(id) === token) {
          active.current.delete(id);
        }
      }
    },
    [bridge],
  );
  return { models, queryModels };
}
