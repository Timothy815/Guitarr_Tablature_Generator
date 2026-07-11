import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { SongProject } from '../types';

const STORAGE_KEY = 'tablature-pro-project-v1';
const HISTORY_LIMIT = 50;

interface ProjectHistory {
  past: SongProject[];
  present: SongProject;
  future: SongProject[];
}

function loadSavedProject(fallback: SongProject): SongProject {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return fallback;
    const parsed = JSON.parse(saved) as SongProject;
    return parsed?.measures?.length ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function useProjectHistory(initialProject: SongProject) {
  const [history, setHistory] = useState<ProjectHistory>(() => ({
    past: [],
    present: loadSavedProject(initialProject),
    future: [],
  }));

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(history.present));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [history.present]);

  const setProject: Dispatch<SetStateAction<SongProject>> = useCallback((update) => {
    setHistory((current) => {
      const next = typeof update === 'function' ? update(current.present) : update;
      if (next === current.present || JSON.stringify(next) === JSON.stringify(current.present)) return current;
      return {
        past: [...current.past.slice(-(HISTORY_LIMIT - 1)), current.present],
        present: next,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    setHistory((current) => {
      const previous = current.past.at(-1);
      if (!previous) return current;
      return {
        past: current.past.slice(0, -1),
        present: previous,
        future: [current.present, ...current.future],
      };
    });
  }, []);

  const redo = useCallback(() => {
    setHistory((current) => {
      const next = current.future[0];
      if (!next) return current;
      return {
        past: [...current.past, current.present],
        present: next,
        future: current.future.slice(1),
      };
    });
  }, []);

  return {
    project: history.present,
    setProject,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  };
}
