# BedLink Task List

## Milestone 1: Scaffold & Foundation
- [x] Clean up existing Next.js files and initialize Vite + React 18 + TS.
- [x] Install dependencies: `react-router-dom`, `tailwindcss`, `zustand`, `vitest`, etc.
- [x] Configure `tailwind.config.js` with deep teal/blue palette and strict typography.
- [x] Setup React Router structure (`/hospital`, `/dispatch`, `/dispatch/request/:id`, `/demo`).
- [x] Create `vercel.json` for SPA routing.

## Milestone 2: Mock Service Layer & Data
- [x] Implement `MockBedLinkService` using `localStorage` and `BroadcastChannel`.
- [x] Create `/src/config/city.ts` with 12 fictional hospitals and seed states.
- [x] Implement `TravelTimeProvider` interface.
- [x] Create injectable clock utility (`now()`).

## Milestone 3: Nurse Screen (`/hospital`)
- [x] Build layout with large touch targets and offline status indicator.
- [x] Implement bed count controls (optimistic UI, auto-save).
- [x] Implement ED load segmented control.
- [x] Implement "Nothing changed - all correct" button.
- [x] Handle offline queuing and background sync.

## Milestone 4: Ranking & Dispatch (`/dispatch`)
- [x] Implement pure ranking function (`/src/lib/ranking.ts`) with unit tests.
- [x] Build Dispatch UI: Patient needs (multi-select), Location input.
- [x] Build Results UI: Ranked list, data freshness badges, hold button.

## Milestone 5: Confirm-and-Hold & State Machine
- [x] Implement state machine logic (`IDLE -> OFFERED -> ACCEPTED | REJECTED | TIMED_OUT`).
- [x] Build Countdown Ring and Timeline UI for Dispatcher.
- [x] Build Incoming Request Takeover for Nurse View.
- [x] Handle atomic race conditions in Mock Service.

## Milestone 6: Polish & Documentation
- [x] Implement Demo control panel (`/demo`).
- [x] Configure `vite-plugin-pwa` for offline capabilities.
- [x] Audit accessibility and performance (Lighthouse).
- [x] Write detailed `README.md`.
- [ ] Use browser subagent to record golden flows and generate Walkthrough artifact.
