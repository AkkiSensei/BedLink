# BedLink Engineering & Product Assumptions

1. **Hospital & City Coordinates**: 
   - Based around a central metropolitan area (Los Angeles / Metro County centroid: 34.0522, -118.2437).
   - 12 realistic fictional hospitals with authentic trauma center designations, specialties, street addresses, and standard phone numbers.

2. **No Emojis Rule**:
   - Zero emojis across the entire project (UI, microcopy, test names, comments, data, SVG labels).
   - All visual communication is strictly powered by Lucide icons (at stroke width 1.75), custom vector SVG glyphs matching the exact icon stroke, and clear typography.

3. **Actor Model & Isolated Session Architecture**:
   - 5 distinct user roles: Ward Nurse (`nurse`), ED Coordinator (`coordinator`), Dispatcher (`dispatcher`), Ambulance Crew (`crew`), and Network Admin (`admin`).
   - Each browser tab maintains its own active user session in `sessionStorage`. All state modifications synchronize across tabs via `BroadcastChannel('bedlink_v2_channel')` and persist to `localStorage`.
   - Different browser tabs can run simultaneously as a Ward Nurse, an ED Coordinator, an Ambulance Crew, and a Dispatcher, behaving as one unified real-time system.

4. **Responder Presence & Escalation Protocol**:
   - Every active browser tab broadcasts a presence heartbeat (`PRESENCE_PING`) over the BroadcastChannel.
   - Incoming emergency bed requests route alert notifications to signed-in ED Coordinators of the target hospital.
   - If no ED Coordinator is online for that hospital, alerts escalate to any signed-in Ward Nurse of that facility.
   - If neither is online, the request still proceeds with the 2-minute timer, but the Dispatcher and Crew see a `ResponderChip` indicating "No responder online" with direct phone verification recommended.

5. **Two Purpose-Built App Shells**:
   - **Console Shell** (ED Desk, Dispatch, Admin): Built for tablets and desktops. Features a floating top bar (detached 12px inset, height 56px, radius 16px, scroll-depth shadow) and a narrow floating rail sidebar (collapsed 56px, expanded 208px, `variant="floating"`, `collapsible="icon"`). Never hides on scroll.
   - **Field Shell** (Nurse, Crew): Built for phones and rugged cab tablets. Features a compact 48px floating pill header and a solid bottom action bar, ensuring the core actions fit a 360x640 screen without scrolling.

6. **Boxed Map Card Pattern**:
   - Maps are contained inside supporting cards (360-400px wide, 240-280px tall) with 16px radius, border, and an "Expand" action opening a full dialog (desktop) or bottom drawer (phone).
   - Scroll-wheel zooming is disabled until the map is focused to prevent scroll traps. No critical operational task requires map interaction.

7. **Service Layer & Pure Ranking Engine**:
   - Multi-factor pure math formula: Score = 0.40 ETA + 0.25 Bed Surplus + 0.20 Freshness + 0.15 Surge Load.
   - Policy parameters (weights, freshness thresholds, response deadline, hold buffer) are managed dynamically in the Admin Console and enforced in the service layer.
   - Timeouts and deadlines are evaluated using an injectable clock function `now()` from `src/lib/clock.ts`. Direct calls to `Date.now()` are forbidden.

8. **Atomic Race Safety & Automatic Cascade**:
   - When multiple requests compete for the last available bed, the first to commit locks the reservation; concurrent requests receive an atomic rejection with automatic cascade to the next-ranked facility.
   - Rejections or timeouts advance seamlessly to candidate #2 in the ranked list without jarring layout shifts.
