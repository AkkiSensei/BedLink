# BedLink Reference Architecture & Design Study

This document details the architectural, visual, and interaction analysis conducted during Milestone M0 across nine production and open-source references. Cloned and analyzed in a dedicated external scratch directory, each reference informs specific subsystems, component architectures, and interaction ergonomics across BedLink's five actor interfaces.

---

## 1. satnaing/shadcn-admin (MIT License)

### Core Analysis
A production-grade administrative dashboard built with Vite, React, Radix UI primitives, and Tailwind CSS. Demonstrates high-density information layout, detached navigation elements, and keyboard-first system navigation.

### Five Concrete Takeaways Mapped to BedLink

1. **Floating Inset Header with Scroll-Depth Shadow**  
   *Mapped Component*: `ConsoleHeader` (in `src/components/layout/ConsoleHeader.tsx`)  
   *Takeaway*: The top navigation bar is detached with 12px margins (`inset-x-3 top-3`), rounded corners (`rounded-2xl`), and a 1px border. Rather than relying on constant heavy dropshadows, a scroll-depth listener dynamically deepens the shadow (`shadow-md` applied when `scrollTop > 10px`). BedLink applies this to the ED Desk, Dispatch Console, and Admin Console.

2. **Global Command Palette (`Ctrl/Cmd + K`)**  
   *Mapped Component*: `CommandPalette` (in `src/components/ui/CommandPalette.tsx`)  
   *Takeaway*: Central search trigger inside the header exposing immediate keyboard shortcuts to jump across system views, switch active facilities, trigger simulation scenarios, or filter emergency queues.

3. **Narrow Collapsible Floating Sidebar Rail**  
   *Mapped Component*: `ConsoleSidebar` (in `src/components/layout/ConsoleSidebar.tsx`)  
   *Takeaway*: Floating sidebar configuration (`variant="floating"`, `collapsible="icon"`) set to a compact 56px (`3.5rem`) collapsed width and 208px (`13rem`) expanded width. Includes tooltips on every icon when collapsed and clear active indicators on current navigation routes.

4. **Persisted Layout and Theme Attributes**  
   *Mapped Subsystem*: `useSettingsStore` (in `src/store/useSettingsStore.ts`)  
   *Takeaway*: Layout state, collapsed sidebar preference, theme, and high-contrast flags are stored in localStorage and applied immediately to `document.documentElement` to prevent layout shift or visual flashing on initial render.

5. **Dense Filterable Data Tables with Sticky Column Headers**  
   *Mapped Screens*: `DispatchHospitalTable`, `AdminAuditLog`, `HospitalRequestHistory`  
   *Takeaway*: Clean tabular layouts featuring sortable column headers, pagination controls, status badges, and row-click actions that launch slide-out inspection sheets.

---

## 2. shadcn-ui/ui (MIT License)

### Core Analysis
The official repository for shadcn/ui primitives, including the modern Sidebar architecture, login blocks, accessible Radix dialogs, and reusable chart primitives.

### Five Concrete Takeaways Mapped to BedLink

1. **Two-Column Split Authentication (login-02 pattern)**  
   *Mapped Screen*: `LoginPage` (in `src/features/auth/LoginPage.tsx`)  
   *Takeaway*: High-polish auth screen layout. The left column holds clean, focused authentication inputs and role tabs; the right column features a branded graphic panel with live regional network telemetry (reporting hospitals, median freshness age). No generic stock photography.

2. **Muted Account Preset Cards (login-03 pattern)**  
   *Mapped Component*: `DemoAccountPicker` (in `src/features/auth/DemoAccountPicker.tsx`)  
   *Takeaway*: Fast demonstration picker enabling reviewers to sign in as any of the five actors (Nurse, ED Coordinator, Dispatcher, Crew, Admin) with a single tap, cleanly marked with clear demonstration notices.

3. **Sidebar Primitive Architecture (`SidebarProvider`, `SidebarTrigger`)**  
   *Mapped Component*: `ConsoleSidebar` (in `src/components/layout/ConsoleSidebar.tsx`)  
   *Takeaway*: Separation of sidebar state management (`SidebarProvider`) from presentation layers (`SidebarHeader`, `SidebarContent`, `SidebarFooter`), enabling seamless keyboard toggle (`Cmd+B`) and accessible mobile sheet fallbacks.

4. **Accessible Primitive Modals & Sheets**  
   *Mapped Component*: `HospitalDetailSheet` (in `src/features/dispatch/HospitalDetailSheet.tsx`)  
   *Takeaway*: Use of Radix Dialog and Sheet primitives for hospital deep-dive drawers with accessible focus management, Escape key handling, and zero scroll bleed on underlying pages.

5. **Tokenized Semantic Palette Definition**  
   *Mapped Subsystem*: `tokens.css` (in `src/design/tokens.css`)  
   *Takeaway*: Strict mapping of CSS custom properties into Tailwind variables, guaranteeing complete light, dark, and high-contrast theme parity without hardcoded utility hex colors.

---

## 3. Kiranism/next-shadcn-dashboard-starter (MIT License)

### Core Analysis
A robust enterprise dashboard template demonstrating role-based access control (RBAC), multi-role navigation structures, and data table toolbars.

### Five Concrete Takeaways Mapped to BedLink

1. **Synchronous Client-Side RBAC Navigation Config**  
   *Mapped Subsystem*: `navConfig` (in `src/config/navConfig.ts`)  
   *Takeaway*: Central dictionary defining navigation items tagged with allowed roles (`allowedRoles: ['dispatcher', 'admin']`). The navigation hook synchronously filters menu items for the current actor without network latency or visual flicker.

2. **Route Guards & Friendly Unauthorized Handling**  
   *Mapped Component*: `ProtectedRoute` and `UnauthorizedPage` (in `src/auth/ProtectedRoute.tsx`)  
   *Takeaway*: Route wrappers that verify actor role permissions against target path metadata. Unauthorized attempts are directed to a friendly 403 Forbidden screen with a direct link back to that actor's dedicated home screen.

3. **Contextual Breadcrumb Bar**  
   *Mapped Component*: `ConsoleBreadcrumbs` (in `src/components/layout/ConsoleBreadcrumbs.tsx`)  
   *Takeaway*: Dynamic breadcrumb navigation in the floating console header indicating current workspace context (e.g. `Dispatch / Active Requests / BL-7F3K`).

4. **Data Table Toolbar with Clear-All Filters**  
   *Mapped Component*: `DataTableToolbar` (in `src/components/ui/DataTable.tsx`)  
   *Takeaway*: Search input coupled with faceted filters (e.g. Trauma Level, Responder Status) and an instant "Clear filters" action button.

5. **Structured Skeleton Loaders**  
   *Mapped Component*: `TableSkeleton`, `CardSkeleton` (in `src/components/ui/Skeleton.tsx`)  
   *Takeaway*: Component-specific skeleton pulse shapes matching actual card and row geometry rather than generic loading spinners.

---

## 4. tremorlabs/tremor (Apache-2.0 License)

### Core Analysis
A specialized component library for data-dense dashboards, financial monitoring, and KPI reporting.

### Five Concrete Takeaways Mapped to BedLink

1. **Tracker Strip for 24-Period Historical Telemetry**  
   *Mapped Component*: `FreshnessTracker` (in `src/components/ui/FreshnessTracker.tsx`)  
   *Takeaway*: Segmented horizontal tracker bar displaying the last 24 updates. Each segment is color-coded by update timeliness (fresh green, delayed amber, missed red) with interactive hover tooltips indicating exact timestamps and staff initials.

2. **KPI Metric Card with Trend Delta**  
   *Mapped Component*: `KpiCard` (in `src/components/ui/KpiCard.tsx`)  
   *Takeaway*: Clean numeric display with uppercase micro-label tracking (`text-xs font-semibold uppercase tracking-wider`), bold tabular metric (`numeral-xl`), and directional status badge.

3. **Micro-Progress Capacity Bars**  
   *Mapped Component*: `CapacityMicroBar` (in `src/components/ui/Stepper.tsx`)  
   *Takeaway*: Subtle occupied-versus-available bar directly beneath each bed counter to provide instant visual proportion without clutter.

4. **Clean SVG Sparkline Curves**  
   *Mapped Component*: `BedSparkline` (in `src/components/ui/BedSparkline.tsx`)  
   *Takeaway*: Pure SVG path sparkline representing ICU availability trends over the last 12 hours inside hospital inspection drawers, avoiding heavy external charting dependencies in lightweight bundles.

5. **Status Pill Indicators with Semantic Color Pairing**  
   *Mapped Component*: `Badge` and `Chip` (in `src/components/ui/Badge.tsx`, `Chip.tsx`)  
   *Takeaway*: Consistent pairing of tinted background, crisp border, high-contrast foreground text, and leading icon for every clinical status.

---

## 5. emilkowalski/vaul & sonner (MIT License)

### Core Analysis
State-of-the-art mobile interaction primitives created by Emil Kowalski, recognized for natural physics, tactile gesture response, and non-intrusive feedback.

### Five Concrete Takeaways Mapped to BedLink

1. **Mobile Bottom Drawer with Drag Handle & Snap Points**  
   *Mapped Component*: `MobileDrawer` (in `src/components/ui/MobileDrawer.tsx`)  
   *Takeaway*: Mobile bottom sheet with a 36px drag handle bar, rubber-band boundary physics, and touch dismiss, used for hospital inspection and map expansion on phone screens.

2. **Undo Action Toasts with Discrete Lifetime**  
   *Mapped Subsystem*: Sonner Toaster integration (in `src/components/ui/Toast.tsx`)  
   *Takeaway*: Critical operations (bed count modification, request cancellation, hold release) trigger high-contrast toasts with an inline "Undo" button, eliminating disruptive confirmation modals.

3. **Restrained Spring Timing (`cubic-bezier(0.22, 1, 0.36, 1)`)**  
   *Mapped Subsystem*: Transition tokens in `tokens.css`  
   *Takeaway*: UI transitions operate on a fast 150-250ms duration with natural deceleration easing, completely avoiding bouncy or distracting animations in clinical interfaces.

4. **Tactile Press Scale States (`active:scale-[0.98]`)**  
   *Mapped Component*: `Button`, `Stepper` (in `src/components/ui/Button.tsx`, `Stepper.tsx`)  
   *Takeaway*: Primary action buttons and 72px stepper pads implement subtle `active:scale-[0.98]` tactile press transformations coupled with mobile device haptic pulses (`navigator.vibrate(40)`).

5. **Non-Blocking Background Interaction**  
   *Mapped Component*: Nurse Stepper & Sticky Bottom Bar  
   *Takeaway*: Toast alerts and status confirmations float above the viewport without obscuring primary tap targets or blocking consecutive adjustments.

---

## 6. traccar/traccar-web (Apache-2.0 License)

### Core Analysis
An open-source GPS tracking and fleet dispatch application displaying concurrent moving vehicles, event streams, and status-coded telemetry.

### Five Concrete Takeaways Mapped to BedLink

1. **Supporting Map Card vs. Dominant Full-Bleed Pane**  
   *Mapped Component*: `MapCard` (in `src/components/map/MapCard.tsx`)  
   *Takeaway*: The map is treated as a contained, supporting information card (360-400px width, 240-280px height) rather than dominating the entire interface. The tabular operational queue remains the primary focus.

2. **Interactive Association Between List Rows and Map Pins**  
   *Mapped Screen*: `DispatchActiveBoard`, `DispatchScreen`  
   *Takeaway*: Hovering or focusing an ambulance or hospital row immediately highlights its corresponding marker pin on the map and vice versa.

3. **Active Fleet Queue Board**  
   *Mapped Screen*: `DispatchActiveBoard` (in `src/features/dispatch/DispatchActiveBoard.tsx`)  
   *Takeaway*: Dedicated tracking list of all in-flight requests showing unit ID, requested units, target hospital, countdown timer chip, cascade attempt number, and current status.

4. **Map Scroll-Trap Prevention**  
   *Mapped Component*: `DispatchMap` (in `src/components/map/DispatchMap.tsx`)  
   *Takeaway*: Scroll-wheel zooming is disabled until the map container receives explicit click or focus, preventing accidental scroll hijacking during page navigation.

5. **Color Semantics for Real-Time Status**  
   *Mapped Subsystem*: `StatusDot` (in `src/components/ui/StatusDot.tsx`)  
   *Takeaway*: Pulsing blue for active transport, solid green for accepted reservation, amber for pending offer countdown, muted gray for completed.

---

## 7. Aceternity UI Floating Navbar (Visual Reference Only)

### Five Concrete Takeaways Mapped to BedLink

1. **Floating Pill Field Header**  
   *Mapped Component*: `FieldHeader` (in `src/components/layout/FieldHeader.tsx`)  
   *Takeaway*: Compact 48px floating header pill inset 8px from screen edges, providing essential context (unit name, connection dot, user menu) with minimal screen occlusion on cheap mobile devices.

2. **Persistent Non-Hiding Navigation**  
   *Mapped Component*: `FieldHeader`, `ConsoleHeader`  
   *Takeaway*: Critical clinical navigation never hides upon scrolling. High-stress emergency operators must never hunt for navigation controls.

3. **Border Luminance & Theme Harmony**  
   *Mapped Tokens*: `--border-app` and `--border-subtle`  
   *Takeaway*: Crisp 1px borders with calibrated alpha values (`rgba(227, 232, 239, 1)` light / `rgba(34, 50, 80, 1)` dark) defining boundaries cleanly against dark surfaces.

4. **Backdrop Clarity with Solid Surface Fallback**  
   *Mapped Component*: Floating Top Bars  
   *Takeaway*: Floating chrome uses solid surface tokens (`var(--bg-surface)`) with optional subtle blur to prevent legibility issues when dense content scrolls underneath.

5. **Clean Radial Inset Geometry**  
   *Mapped Tokens*: `radius-xl` (`16px`)  
   *Takeaway*: Harmonious 16px radius applied uniformly to floating header bars, floating sidebar rails, and main surface cards.

---

## 8. OpenMRS Patient Management (Study Only)

### Five Concrete Takeaways Mapped to BedLink

1. **Calm Clinical Color Discipline**  
   *Mapped Subsystem*: Color Tokens in `tokens.css`  
   *Takeaway*: Red and amber are strictly reserved for genuine hazards (stale data, declined hold, unit full, timeout). Primary blue carries all standard actions.

2. **Triage Severity Classifications**  
   *Mapped Component*: `SeverityControl` (in `src/features/dispatch/SeverityControl.tsx`)  
   *Takeaway*: Standardized emergency severity toggles (`Critical` vs `Stable/Standard`) where Critical shifts ranking weights toward travel time.

3. **Structured Bed Category Hierarchies**  
   *Mapped Types*: `BedType` (in `src/lib/types.ts`)  
   *Takeaway*: Clinical categorization grouping ICU, Ventilator, and High-Flow Oxygen as Critical Care, with Cardiac and Burns separated as Specialized Units.

4. **Patient Arrival & Hold Completion Workflow**  
   *Mapped Screen*: `HospitalDeskScreen`  
   *Takeaway*: Formal transition from held bed to admitted patient (`Patient Arrived`), transferring reserved capacity to occupied capacity.

5. **Accountable Audit Trails**  
   *Mapped Screen*: `AdminAuditLog`  
   *Takeaway*: Every count adjustment and request action logs timestamp, actor identifier, role, and target facility.

---

## 9. DISHANTUS/MESHCUE (Study Only)

### Five Concrete Takeaways Mapped to BedLink

1. **Explainable Dispatch Scoring ("Why this rank?")**  
   *Mapped Component*: `RankExplanationPanel` (in `src/features/dispatch/RankExplanationPanel.tsx`)  
   *Takeaway*: A transparent breakdown displaying the four scoring components (ETA 40%, Bed Match 25%, Freshness 20%, Load 15%) with actual values (e.g. 7 min ETA = 30.7 pts).

2. **Multi-Hospital Side-by-Side Comparison**  
   *Mapped Component*: `HospitalComparisonModal` (in `src/features/dispatch/HospitalComparisonModal.tsx`)  
   *Takeaway*: Direct comparison table comparing top 3 candidate facilities across travel distance, bed counts, and surge load.

3. **Interactive Scenario Simulation Engine**  
   *Mapped Screen*: `DemoPanel` (in `src/features/demo/DemoPanel.tsx`)  
   *Takeaway*: Preconfigured scenarios (Clean Accept, Reject & Cascade, Timeout Cascade, Stale Demotion, Concurrent Last-Bed Race) for comprehensive demonstrations.

4. **Live Event Log Stream**  
   *Mapped Component*: `BroadcastEventLog` (in `src/features/demo/DemoPanel.tsx`)  
   *Takeaway*: Real-time chronological audit stream capturing BroadcastChannel messages, state transitions, and timeouts across tabs.

5. **Configurable Policy Tuning**  
   *Mapped Screen*: `AdminPolicyEditor` (in `src/features/admin/AdminPolicyEditor.tsx`)  
   *Takeaway*: Administrative sliders to adjust ranking weights (constrained to sum to 100%) with live preview re-ranking.
