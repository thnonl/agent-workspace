import { useCallback, useSyncExternalStore } from 'react';
import type { RoomLayout } from '../world/layout';
import { deliveryVersion, subscribeDelivery } from '../sim/registry';

/** Re-renders the component when the room has been sent something (see commitDelivery in sim/registry.ts); returns a number that changes then. */
export function useDeliveryVersion(roomId: string, layout: RoomLayout): number {
  const subscribe = useCallback((fn: () => void) => subscribeDelivery(roomId, layout, fn), [roomId, layout]);
  return useSyncExternalStore(subscribe, () => deliveryVersion(roomId, layout));
}
