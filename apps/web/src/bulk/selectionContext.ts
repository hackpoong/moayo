import { createContext, useContext } from 'react';

export interface SelectionApi {
  active: boolean;
  selected: ReadonlySet<string>;
  /** 길게 눌러 선택 시작. */
  start: (id: string) => void;
  toggle: (id: string) => void;
  clear: () => void;
}

const NONE: SelectionApi = { active: false, selected: new Set(), start: () => undefined, toggle: () => undefined, clear: () => undefined };

export const SelectionContext = createContext<SelectionApi>(NONE);

export function useSelection(): SelectionApi {
  return useContext(SelectionContext);
}
