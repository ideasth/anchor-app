# Features TODO — pending implementation

Status snapshot: 2026-05-08, after Feature 3 (available hours this week) source landed but publish_website is still gated.

---

## Feature 1 — Pre-event travel time (STATIC defaults)

**Approach:** Static lookup table per location. No traffic API calls. User can override per event.

**Data model**

Add table `travel_locations`:
- `id` (pk)
- `name` (e.g. "Sandringham", "Peninsula", "Elgin Braybrook", "Elgin Carlton")
- `keywords` (comma-separated, used to match event location/title — e.g. "sandy,sandringham,sand hospital")
- `nominal_minutes` (typical drive time)
- `allow_minutes` (recommended block to leave by — buffer included)
- `notes` (free text, optional)

Add column on events (or a side table `event_travel_overrides`):
- `event_id`
- `nominal_minutes_override`
- `allow_minutes_override`

Settings additions:
- `home_address` (default: "Erskine St North Melbourne")
- `maps_provider` (default: "google" — used to construct deep links)

**Seed data** (user-provided, 2026-05-08)

| Name | Keywords | Nominal | Allow |
|---|---|---|---|
| Sandringham | sandy, sandringham, sandringham hospital | 45 | 60 |
| Peninsula | peninsula, frankston, peninsula health | 60 | 90 |
| Elgin Braybrook | elgin braybrook, braybrook | 20 | 30 |
| Elgin Carlton | elgin carlton, carlton, elgin house | 15 | 30 |

Home address: Erskine St North Melbourne.

**Maps link convention**

For a work event, generate two links:
- Outbound: `origin = home_address`, `destination = event_location`
- Return: `origin = event_location`, `destination = home_address`

Use Google Maps query URL format: `https://www.google.com/maps/dir/?api=1&origin=...&destination=...`

**Server endpoints**

- `GET /api/travel-locations` — list all
- `POST /api/travel-locations` — create
- `PATCH /api/travel-locations/:id` — update
- `DELETE /api/travel-locations/:id`
- `GET /api/events/:id/travel` — returns `{matchedLocation, nominalMinutes, allowMinutes, outboundMapsUrl, returnMapsUrl}` based on event title/location matching keywords

**Surfaces**

- Today page: badge on each event "Allow 60 min · Maps"
- Calendar page: same badge in event detail
- Morning briefing: include "Leave by HH:MM" line under each work event for the day

**Client work**

- New `TravelBadge.tsx` component (compact, shows allow time + Maps icon → click opens Google Maps directions)
- Settings page: "Travel locations" section with list/add/edit
- Morning briefing: extend existing event renderer

**Effort:** ~1 evening session.

---

## Feature 2 — Project values (income + benefit + kudos)

**Approach:** Extend `projects` schema with four scoring fields, surface on Projects page.

**Data model — add columns to `projects`**

- `current_income_per_hour` (number, AUD; 0 if not income-generating)
- `future_income_estimate` (number, AUD annualised over next 12 months; 0 if N/A)
- `community_benefit` (integer 1-5)
- `professional_kudos` (integer 1-5)

**Seed values** (user-provided, 2026-05-08)

| Project type | Current $/hr | Future est | Notes |
|---|---|---|---|
| Medicolegal | 400 | — | High hourly, ad-hoc volume |
| Elgin House (private) | 400 | — | High hourly, established |
| Hospital (Sandy/Peninsula/Monash) | 200 | — | Lower hourly, contractual |
| AUPFHS | (TBC) | (highest) | **Primary future-income project** — pre-fill `future_income_estimate` as flagged "primary"; user enters dollar value |

**Server endpoints**

- `PATCH /api/projects/:id` — extend existing endpoint to accept the 4 new fields
- `GET /api/projects/values-summary` — returns aggregate: total active projects, weighted average current rate, identified primary future-income project

**Surfaces**

- Projects page: 4 new columns/fields per project card. Edit inline.
- Projects detail view: scoring sliders for community_benefit and professional_kudos
- Morning page: "Top-paying project today" pill if any of today's events ties to a project with `current_income_per_hour >= 300`

**Client work**

- Extend `ProjectCard.tsx` (or equivalent) with 4 new fields
- Settings/edit form for project values
- Sliders (1-5) for the two qualitative scores

**Effort:** ~1 evening session.

---

## Feature 4 — Life coach function (DEFERRED 2 weeks)

**Why deferred:** Needs Features 1 + 2 to produce real data first. Without project values and travel time, the coach has nothing meaningful to weigh.

**Concept:** Once a week (Sunday weekly review time, ~18:30 AEST), pull:
- Available hours for the week (Feature 3 — already built)
- Project values (Feature 2)
- Top deadlines from Anchor task list
- Last week's actual time spent per project (from event log)

Then ask ONE focused question, e.g.:
- "AUPFHS is your primary future-income project but you spent 0 hours on it last week. Block 4 hours this week?"
- "You have 18 deep-work hours and Medicolegal pays $400/hr. Want to commit 6 of those to clearing the medicolegal queue?"

**Constraints:**
- One question per week, not a chat
- Question lands in Morning page on Sunday only
- User can dismiss or accept (accept = creates a calendar block + task)

**Implementation sketch:**
- New endpoint `GET /api/coach/weekly-prompt`
- Server-side rule engine (no LLM call needed for v1 — deterministic rules over the data)
- Client: Sunday-only banner on Morning page
- Action buttons: "Block this time" (creates calendar event + task), "Snooze a week", "Dismiss"

**Revisit:** ~2026-05-22 once Features 1 + 2 have produced 1-2 weeks of data.

---

## Implementation order (when next session starts)

1. Feature 1 first (smaller, self-contained, immediate value on Today page)
2. Feature 2 second (reuses existing Projects page UI patterns)
3. Then re-evaluate Feature 4 readiness

Both features should ship without enabling Outlook writes, without re-running the security review, and without re-pulling MS To Do projects (per standing rules).
