// Single injectable clock utility for BedLink.
// Never call Date.now() directly in UI or business logic.

let mockTimeOffset = 0;

export const now = (): number => {
  return Date.now() + mockTimeOffset;
};

export const setMockTimeOffset = (offset: number) => {
  mockTimeOffset = offset;
};

export const fastForward = (ms: number) => {
  mockTimeOffset += ms;
};

export const resetClock = () => {
  mockTimeOffset = 0;
};

export const getClockOffset = (): number => {
  return mockTimeOffset;
};
