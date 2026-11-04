export interface Clock {
  now(): Date;
}

let developmentOffsetMs = 0;

export const systemClock: Clock = {
  now: () => new Date(Date.now() + developmentOffsetMs),
};

export function getDevelopmentClockOffsetMs(): number {
  return developmentOffsetMs;
}

export function setDevelopmentClockOffsetMs(offsetMs: number): void {
  if (process.env.NODE_ENV === "production") throw new Error("Development clock controls are disabled in production.");
  if (!Number.isSafeInteger(offsetMs) || Math.abs(offsetMs) > 30 * 24 * 60 * 60 * 1000) {
    throw new RangeError("Development clock offset must be within 30 days.");
  }
  developmentOffsetMs = offsetMs;
}

export function createManualClock(initialTime: Date): Clock & { set(time: Date): void; advance(ms: number): void } {
  let currentTime = new Date(initialTime);

  return {
    now: () => new Date(currentTime),
    set: (time) => {
      currentTime = new Date(time);
    },
    advance: (ms) => {
      currentTime = new Date(currentTime.getTime() + ms);
    },
  };
}

export function formatIndiaDateTime(date: Date): string {
  const formatted = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
  return `${formatted} IST`;
}