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

## Whole subway network and station selection · web-7

**Subway maps** now opens the complete regional network, with all lines and stations visible together. Regions: Capital area (24 lines / 656 station identities), Busan area (6 / 147), Daegu (3 / 91), Daejeon (1 / 22), Gwangju (1 / 20). Shared sections use parallel line strokes. The original schematic follows broad geographic relationships, compresses distances and separates overlapping station markers; it is not a geographic map or a representation of track geometry.

Tap a station marker and assign **Start**, **Transfer**, or **End**. At dense positions, a nearby-station list resolves ambiguity. Korean/English search focuses the station on the map. Pinch, drag, wheel, zoom buttons, keyboard pan/zoom, **All**, and **Route** controls support exploration. Line-colour buttons emphasize a line while leaving the rest of the network visible. Search and named SVG station buttons provide an alternative to precise touch selection.

Static routing connects the selected stations using the checked operator line graph. Up to seven manually chosen transfer stations are followed in order, and each must be an actual change of line. Choices prioritize fewer transfers and then fewer station hops; up to three distinct connection suggestions are shown, without claiming they enumerate every possible route. Branches and the one-way Eungam loop are respected. Transfer selection is available only at interchange identities. No fares, live service status, express/local stopping pattern, timetable or estimated travel time is invented. Users enter total minutes including access walks, waits and transfers, or leave them unknown.

Save the chosen route to a day's incoming movement. Existing routes remain readable and editable. Route metadata, optional ordered transfer station IDs, and a bilingual summary stay in the destination stop's versioned `note` block. Ordinary notes are preserved and the installed app's 2,000-character combined limit is enforced. This keeps bridge version 1 and needs no TestFlight update. Reordering places marks old routes for review. Backup/sharing and native JSON round-tripping retain the route and its selected transfers.

### Data and attribution

Operator line/station ordering remains the checked 2026-11-14 snapshot in `metro-data.json`. The original map layout is a separately published ODbL dataset in `metro-layout.json`, credited visibly in the map to **© OpenStreetMap contributors**. All 936 identities have a matched station position; no station, rail connection or missing geographic position is fabricated. Display positions are compressed and separated for the schematic, and must not be used as precise navigation coordinates.

- Position data: [OpenStreetMap / ODbL](https://www.openstreetmap.org/copyright), current station nodes queried through the [VK Maps Overpass instance](https://maps.mail.ru/osm/tools/overpass/), supplemented by the [helloGoni Geofabrik OSM extract](https://github.com/helloGoni/korea-isochrone-map/blob/main/data/transit-graph.json) built on 2026-06-21. Snapshot timestamps and source references are included in `metro-layout.json`. No third-party application code is copied.
- Capital area: [Seoul Metro cyberstation](https://www.seoulmetro.co.kr/kr/cyberStation.do), its Korean/English public station lists, and [Incheon Transit map](https://www.ictr.or.kr/main/railway/guidance/map.jsp). GTX-A's displayed sections remain disconnected within that line.
- Busan area: [Humetro cyberstation](https://data.humetro.busan.kr/homepage/cyberstation/map.do), including Lines 1–4, Busan–Gimhae LRT and Donghae Line. Same-name identities without a displayed transfer are separate.
- Daegu: [DTRO cyberstation](https://www.dtro.or.kr/front/dtro/cyberstation/station/cyberstation.do), including the Hayang extension.
- Daejeon: [Daejeon Transportation map](https://www.djtc.kr/kor/page.do?menuIdx=39), Line 1.
- Gwangju: [Gwangju Transit cyberstation](https://www.grtc.co.kr/cyber/), operating Line 1; construction-only lines are excluded.

`metro-core.js` contains graph and storage utilities; `metro-map.js` renders the interactive SVG; `metro.js` coordinates station selection and saving. Runtime dependencies: none. The map performs no live position or routing API calls and does not send trip data to a map service. Keep the checked network snapshot maintained when services change.

Run `npm test` from this source folder. Eighteen tests cover money conversion, legacy branch/loop paths, manual transfer order, connected routing, invalid selections, no empty/backtracking legs, complete map coverage, note preservation, storage limits and stale route detection. The existing native schema was also checked with a two-line route and an explicit transfer waypoint.
