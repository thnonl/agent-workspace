import { create } from 'zustand';
import type { IconName } from './ui/Icon';

export interface Toast {
  id: number;
  icon: IconName;
  title: string;
  text?: string;
}

interface ToastState {
  toasts: Toast[];
}

let nextId = 1;
export const useToasts = create<ToastState>(() => ({ toasts: [] }));

const SHOW_MS = 4800;

/** A small card in the corner that goes away by itself (achievements, "photo saved", ...). */
export function pushToast(t: Omit<Toast, 'id'>) {
  const id = nextId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts.slice(-3), { ...t, id }] }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })), SHOW_MS);
}
