# TripFlow Korea · Web presentation

English and Korean travel planner for the TripFlow Korea iPhone app. A buildless website: publish the contents of `dist/` at an HTTPS URL. No user trips, expenses, API secrets or Apple credentials are part of this source.

The iPhone shell provides a versioned `tripflow` bridge for on-device storage, Apple Maps place search, route estimates, map markers, reference exchange rates, sharing and conservative payment-message parsing. The website provides the interface and itinerary / expense editing. Existing native trips use the same JSON schema and storage file.

Ordinary interface/content changes require only a website deployment. Update `VERSION`, `version.json` and asset query versions together. The app checks on reopening and when returning to the foreground; it waits while a dialog is open. Native capability changes or bridge incompatibility require an app update. Keep bridge version 1 compatible with installed apps.

On Safari or desktop, trips are stored in localStorage. Browser data and app data are separate. Web place search uses Photon's public demo endpoint on explicit submission, with caching and a per-client interval. App place search uses Apple Maps first and falls back to Photon after an error or a 14-second deadline. No service worker is installed. Export a backup before clearing browser data or uninstalling the app.

Public geocoding service: https://github.com/komoot/photon (reasonable-use demo, no availability guarantee). Production scale requires a dedicated search service. Reference exchange rates: https://frankfurter.dev. Maps and directions open Kakao Maps. Public transport routing is not connected to an automatic data API.

## Updating

1. Edit `dist/` and keep the native bridge contract compatible.
2. Increment web version and asset query strings.
3. Publish the website files to the same address. The installed iPhone shell keeps that URL.
4. Check the trip, search, language and expense flows. Never bundle actual user data in the deployed files.

Public deployment: https://queninkim.github.io/tripflow-korea/
Source repository: https://github.com/QueninKim/tripflow-korea

## Budget conversion

Budget creation, editing and top-ups accept KRW or the eight home currencies. Select the latest published reference rate or enter a purchased rate, quoted per 1 or 100 currency units. Purchased rates have no date input. The preview shows the KRW amount and, for a top-up, the resulting total before saving. Budgets are fixed in KRW after saving; spending records are unchanged.

Latest rates come from Frankfurter, with its reference date shown. They are published reference rates rather than second-by-second quotes. A failed fresh lookup does not save a budget. Purchased rates are labelled separately, stored on the device, and never replace the general reference-rate cache. Their normalized per-unit snapshot uses an existing FXRate entry in the native schema, so the installed app does not need to change.

Conversion rounds once to a whole won, half up, with decimal arithmetic. KRW and JPY input use whole units. Empty / negative / malformed amounts, invalid rates and totals over KRW 1,000,000,000 are rejected. Local tests cover rounding, per-100 JPY rates, top-ups, expense preservation and legacy native JSON compatibility.

## Expense conversion

Expense entry now supports the purchased rate as well as the latest reference rate. A saved purchased budget rate is prefilled when available and can be changed for this expense. Enter a foreign payment to calculate its KRW charge, or enter a KRW charge and select a currency to calculate its purchased-rate equivalent. Per-1 and per-100 units are supported. Purchased rates have no date field.

The stored KRW charge, original input amount and rate snapshot stay fixed when general reference rates refresh. Plain KRW expenses still work without a rate or a network request. Zero / negative / malformed rates and converted charges below one won are blocked. Saving failures preserve the previous expense list.

The installed native schema is unchanged. `expense-fx-v1:` entries in the on-device rates dictionary retain each expense's original currency/amount, source and unit alongside its FXRate snapshot. Preserve these durable entries during cache maintenance. Web deletion removes the corresponding snapshot. Receipt-message fingerprints remain unchanged for duplicate detection. JSON backup and native round-trip compatibility were verified.

## Subway maps and manual routes · web-6

Open **Subway maps** in My trip or Essentials, or **Subway** on an itinerary movement. Choose the Capital area, Busan area, Daegu, Daejeon or Gwangju. The 35 line views contain 936 station identities (transfer stations share an identity). The diagrams show station order and transfer links in an original vertical layout; they do not represent geographic position or distance. Full official network maps are linked alongside them.

Korean and English station search, departure/arrival selection by tapping the diagram or a station list, branch handling, Line 2 direction choices, and the one-way Eungam loop are supported. Add up to eight connected legs and save to a day's incoming movement. Only lines serving the previous arrival station are offered for the next leg. Add a pending leg before saving. Enter a total time including walking, waiting and transfers, or leave it unknown. No live timetable, express/local routing, fare calculation or shortest cross-network journey is claimed.

Route metadata and a readable bilingual summary use a versioned block at the end of the destination stop's existing `note` field. Ordinary notes remain separately editable, and the combined field stays within the installed app's 2,000-character limit. This preserves bridge version 1 and needs no new TestFlight build. Reordering or removing a preceding place marks the route for review; selecting another travel mode marks it inactive. Sharing and backup retain the route, and native JSON round-trip compatibility was checked.

Station names, line membership and ordering were checked on 2026-11-14 against the following operator sources. No operator map artwork, schematic coordinates, schedules, fares, scripts, credentials or session cookies are bundled. The dataset is a checked snapshot and requires maintenance as service changes. English source gaps are filled with display romanizations.

- Capital area: [Seoul Metro cyberstation](https://www.seoulmetro.co.kr/kr/cyberStation.do), its Korean/English public line-data feeds, and [Incheon Transit map](https://www.ictr.or.kr/main/railway/guidance/map.jsp). GTX-A's two displayed operating sections are kept disconnected.
- Busan area: [Humetro cyberstation](https://data.humetro.busan.kr/homepage/cyberstation/map.do), including Lines 1–4, Busan–Gimhae LRT and Donghae Line. Same-name stations without a displayed transfer are not merged.
- Daegu: [DTRO cyberstation](https://www.dtro.or.kr/front/dtro/cyberstation/station/cyberstation.do) and its public station lookup, including the Hayang extension.
- Daejeon: [Daejeon Transportation map](https://www.djtc.kr/kor/page.do?menuIdx=39), Line 1.
- Gwangju: [Gwangju Transit cyberstation](https://www.grtc.co.kr/cyber/), operating Line 1; construction-only lines are excluded.

Run `npm test` from this source folder. Tests cover conversion behavior, branch/loop paths, transfer continuity, note preservation, storage limits and stale route detection.
