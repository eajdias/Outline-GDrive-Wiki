export interface KeySlot {
  apiKey: string;
  coolingUntilMs: number;
}

export interface KeyAvailability {
  apiKey: string;
  index: number;
}

export interface RingStatus {
  total: number;
  cooling: number;
  nextRetryMs: number;
}

export class KeyRing {
  private readonly slots: KeySlot[];

  constructor(apiKeys: string[]) {
    this.slots = apiKeys.map((apiKey) => ({ apiKey, coolingUntilMs: 0 }));
  }

  available(now: number): KeyAvailability[] {
    return this.slots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.coolingUntilMs <= now)
      .map(({ slot, index }) => ({ apiKey: slot.apiKey, index }));
  }

  markCooling(index: number, untilMs: number): void {
    const slot = this.slots[index];
    if (slot) slot.coolingUntilMs = untilMs;
  }

  status(now: number): RingStatus {
    const cooling = this.slots.filter((slot) => slot.coolingUntilMs > now);
    return {
      total: this.slots.length,
      cooling: cooling.length,
      nextRetryMs: cooling.length === 0 ? 0 : Math.min(...cooling.map((slot) => slot.coolingUntilMs)) - now,
    };
  }
}
