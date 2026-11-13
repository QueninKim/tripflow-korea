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

## Whole subway network and station selection · web-8

**Subway maps** now opens the complete regional network, with all lines and stations visible together. Regions: Capital area (24 lines / 656 station identities), Busan area (6 / 147), Daegu (3 / 91), Daejeon (1 / 22), Gwangju (1 / 20). Shared sections use parallel line strokes. The original schematic follows broad geographic relationships, compresses distances and separates overlapping station markers; it is not a geographic map or a representation of track geometry.

Tap a station marker and assign **Start**, **Transfer**, or **End**. At dense positions, a nearby-station list resolves ambiguity. Korean/English search focuses the station on the map. Pinch, drag, wheel, zoom buttons, keyboard pan/zoom, **All**, and **Route** controls support exploration. Line-colour buttons emphasize a line while leaving the rest of the network visible. Search and named SVG station buttons provide an alternative to precise touch selection.

Static routing connects the selected stations using the checked operator line graph. Up to seven manually chosen transfer stations are followed in order, and each must be an actual change of line. Choices prioritize fewer transfers and then fewer station hops; up to three distinct connection suggestions are shown, without claiming they enumerate every possible route. Branches and the one-way Eungam loop are respected. Transfer selection is available only at interchange identities. The selected path now produces an automatic planning estimate, with an explicit train / transfer / waiting / walking breakdown. Live service status, fares, timetables and express stopping patterns are not connected.

Save the chosen route to a day's incoming movement. Existing routes remain readable and editable. Route metadata, optional ordered transfer station IDs, and a bilingual summary stay in the destination stop's versioned `note` block. Ordinary notes are preserved and the installed app's 2,000-character combined limit is enforced. This keeps bridge version 1 and needs no TestFlight update. Reordering places marks old routes for review. Backup/sharing and native JSON round-tripping retain the route and its selected transfers.

### Data and attribution

Operator line/station ordering remains the checked 2026-11-14 snapshot in `metro-data.json`. The original map layout is a separately published ODbL dataset in `metro-layout.json`, credited visibly in the map to **© OpenStreetMap contributors**. All 936 identities have a matched station position; no station, rail connection or missing geographic position is fabricated. Display positions are compressed and separated for the schematic, and must not be used as precise navigation coordinates.

- Position data: [OpenStreetMap / ODbL](https://www.openstreetmap.org/copyright), current station nodes queried through the [VK Maps Overpass instance](https://maps.mail.ru/osm/tools/overpass/), supplemented by the [helloGoni Geofabrik OSM extract](https://github.com/helloGoni/korea-isochrone-map/blob/main/data/transit-graph.json) built on 2026-06-21. Snapshot timestamps and source references are included in `metro-layout.json`. No third-party application code is copied.
- Capital area: [Seoul Metro cyberstation](https://www.seoulmetro.co.kr/kr/cyberStation.do), its Korean/English public station lists, and [Incheon Transit map](https://www.ictr.or.kr/main/railway/guidance/map.jsp). GTX-A's displayed sections remain disconnected within that line.
- Busan area: [Humetro cyberstation](https://data.humetro.busan.kr/homepage/cyberstation/map.do), including Lines 1–4, Busan–Gimhae LRT and Donghae Line. Same-name identities without a displayed transfer are separate.
- Daegu: [DTRO cyberstation](https://www.dtro.or.kr/front/dtro/cyberstation/station/cyberstation.do), including the Hayang extension.
- Daejeon: [Daejeon Transportation map](https://www.djtc.kr/kor/page.do?menuIdx=39), Line 1.
- Gwangju: [Gwangju Transit cyberstation](https://www.grtc.co.kr/cyber/), operating Line 1; construction-only lines are excluded.

`metro-core.js` contains graph and storage utilities; `metro-map.js` renders the interactive SVG; `metro.js` coordinates station selection, automatic duration and saving. Runtime dependencies: none. The map performs no live position or routing API calls and does not send trip data to a map service. Keep the checked network snapshot maintained when services change.

Run `npm test` from this source folder. Twenty-five tests cover money conversion, route connectivity, branches/loops, manual transfer order, complete map coverage, running-time calculations, wait/transfer changes, walking access, timeline projection, invalid inputs and timing snapshots. Native JSON round-tripping also preserves automatic minutes, timing options, the timing snapshot and ordinary notes.

## Automatic subway travel time

New routes default to **Calculate automatically**. Each route choice shows a total estimate. Saving the selected route writes its minutes to the existing incoming itinerary movement, so its arrival and all later arrival times update through the existing timeline calculation. Unknown earlier movements still propagate an unknown arrival. A live preview shows the destination arrival before saving. Draft changes do not write to the itinerary until Save.

The estimate includes train movement, initial waiting, transfer walking/waiting, station entry/exit and (when a movement is selected) walking between its places and the chosen stations. Walking access can be disabled explicitly. Waiting/transfer allowances are editable. A total-time manual mode remains available; legacy manually entered times are preserved until changed. Changing the path or the target movement restores automatic calculation. Editing a saved time in the ordinary stop editor changes its label and snapshot to manual. Removing an automatically timed subway route clears its derived travel minutes.

### Basis and practical limits

- **Busan Lines 1–4:** 110 adjacent intervals from [Humetro's published distance/time CSV, reference date 2025-03-25](https://www.data.go.kr/data/3033564/fileData.do). The `minutes:seconds` values are used as published in both directions. No extra dwell is added to those intervals. These are reference intervals, not live running times.
- **Other intervals:** physical station coordinates from OpenStreetMap (not the compressed diagram coordinates) feed a distance / acceleration / cruise model. This is a planning assumption, not an operator timetable or a measured duration. The UI identifies distance-model segments. Running time uses straight-line distance multiplied by a profile detour factor. Triangular motion is `2 * sqrt(distance / acceleration)`; otherwise it is `distance / cruiseSpeed + cruiseSpeed / acceleration`. Modelled intermediate stops add a dwell allowance.
- Assumed profiles in `metro-times.json`: metro 55 km/h cruise, light rail 50, commuter 80, rapid commuter 95, GTX 140; these are modelling parameters rather than claims about actual service speeds. Distance factors are 1.10–1.15, accelerations 0.65–0.80 m/s², and model dwell allowances 25–45 seconds.
- Default initial wait: 4 minutes. Per transfer: 5 minutes walking plus 3 minutes waiting. Station entry/exit: 2 minutes each. Outside walking: straight-line distance × 1.25 at 75 metres/minute. A place more than 15 km from its selected station requires correcting the stations, disabling outside walking, or entering a manual total.
- No live arrival, service disruption, last-train, crowding, holiday schedule or express/local stopping-pattern inference is made. A longer selected loop remains longer; the chosen path is never replaced simply to produce a shorter estimate.

Seconds are summed before rounding the total upward to whole minutes. The displayed component minutes are allocated so their sum equals the total. Invalid waiting/transfer values or missing timing data block automatic saving. Manual totals allow 0–2,880 whole minutes or an explicitly unknown duration.

`metro-time.js` handles estimation and an immutable timeline preview. `metro-times.json` publishes station coordinates, profiles, reference intervals and provenance under ODbL-1.0; Humetro's source permits unrestricted reuse. No new live routing API, key, server or tracking is introduced. All calculations run on the device.

Automatic time snapshots live in the versioned route note, with `mode`, total minutes, component seconds, profile version, options and operator/model interval counts. The installed native enum remains compatible; the web labels a matching snapshot **Auto estimate**, while a bilingual human-readable timing line survives the native offline view. Existing native code and TestFlight build are unchanged.

## Bus maps and readable subway view · web-9

The subway planner starts with **Large text · by line**. Each line is a scrollable station-order diagram with 17px station names, bilingual labels, interchange rings and connecting-line buttons. Tapping a station opens the same Start / Transfer / End controls as the full map. Line branches and directed tracks remain distinct. The existing **Whole network** view, its zoom/search controls, all five regions, saved routes and automatic time calculations remain available. Switching views preserves the route draft; the readable view returns to its scroll position and starts near the saved boarding station.

**Bus maps** adds on-device route planning for five regional snapshots. Counts distinguish unique displayed route numbers from directional services and variants:

| Region | Route numbers | Services / variants | Stop identities | Source snapshot |
|---|---:|---:|---:|---|
| Seoul | 718 | 718 | 12,897 | 2026-09-02 |
| Busan | 327 | 327 | 8,525 | 2026-11-14 |
| Daegu area | 164 | 495 | 5,214 | 2026-11-14 |
| Daejeon area | 138 | 279 | 3,453 | 2026-11-14 |
| Gwangju | 127 | 127 | 2,907 | 2026-11-14 |

Seoul contains the published Seoul routes, including village, night, airport and suburban stops of those services. It does not represent every Gyeonggi / Incheon route. Busan includes the official site's published city/village service variants. Daegu and Daejeon include adjacent-area services present in their official catalogs. Counts describe this snapshot, not a nationwide completeness claim. An absent reverse panel/empty direction is not invented. English UI retains official Korean stop names when the source supplies no English name; stop IDs/codes disambiguate locations. Busan's published English stop names are searchable.

### Bus interaction and storage

Search a route number, stop name or stop code. The canvas position diagram shows a selected route, or all published routes with the selected route emphasized. Lines connect stop coordinates in service order; they are not road geometry. Direction arrows and the next-stop name help confirm direction. Tap a marker or the accessible large-text stop list, then choose Start / Transfer / End. Nearby and opposite-side stops keep separate IDs. Up to four mandatory transfer stops are followed in order, with an actual change of buses there. Connections prioritize fewer changes, then estimated travel time, and show up to three different first-bus suggestions. They do not include a mixed bus/subway search.

The graph uses ordered route occurrences, so repeated stop IDs in loops cannot shortcut intermediate stops. Reverse travel requires an actual published sequence. Transfers can walk to another stop within 180 metres, shown explicitly in the route summary; this proximity model does not verify crossings, barriers or accessibility. Regional data loads only when opened. Map rendering, routing and timing run on the device, with no trip or location transmission to an external map API.

Saving a bus route applies the estimated incoming movement time and updates downstream itinerary arrivals. The preview includes the destination's revised arrival. Automatic time uses 18 km/h over 1.25× the straight-line inter-stop distance, plus 20 seconds per hop. Initial/transfer waits default to seven minutes and are editable. Transfer walking uses the same distance factor at 75 m/min plus a one-minute alighting/boarding allowance. Optional place-to-stop walking uses 1.25× straight-line distance at 75 m/min; it defaults on for a selected itinerary movement. Walking access beyond 15 km, invalid waits or totals outside 1–2,880 minutes block automatic saving. These are planning assumptions; traffic, real-time arrivals, timetables, first/last buses, fares and availability of night-only services are not inferred. A manual total or explicitly unknown duration remains available.

Bus metadata is stored in a `[TripFlow Bus v1]` note block. It contains the regional snapshot version, ordered route occurrence legs, explicit transfer IDs and a timing snapshot. `transit-note.js` preserves ordinary notes and replaces the previous bus/subway plan when the incoming movement's transit choice changes. Combined notes respect the installed app's 2,000-character limit. Manual time edits replace automatic labels; itinerary reordering invalidates durations and timing summaries, while route identities remain available for review/removal, including a route moved to the first place. Route changes are not saved until Save. Device persistence, JSON backups and text export include the chosen route. No native enum, bridge or TestFlight build change is required.

### Bus provenance

Only factual names, identities, coordinates and published stop ordering are distributed. No vehicle positions, vehicle registration plates, site keys, cookies or session tokens are included. Each dataset links its official source:

- [Seoul Open Data: bus route / stop sequence XLSX, 2026-09-02](https://data.seoul.go.kr/dataList/OA-1095/S/1/datasetView.do). Published order values are sorted; gaps in source sequence numbering are retained as the source's ordered list, without inventing missing stops.
- [Busan BIMS: route-by-stop download](https://bus.busan.go.kr/busanBIMS/StationInfo.asp), WGS84 coordinates and official English names.
- [Daegu official bus route guide](https://businfo.daegu.go.kr/ba/route/route.do?act=main&layout=mainNew), forward/backward service panels. The site's declared EPSG:5187 stop coordinates were converted to WGS84 with pyproj 3.8.0 (GRS80; always_xy). Circular services remain one-way when no reverse panel is published.
- [Daejeon Traffic Information Center](https://traffic.daejeon.go.kr/bus/), public route catalog and ordered Up/Down stop records. Duplicate rows from multiple vehicles at the same sequence position are deduplicated by the published stop sequence; live fields are discarded. Three empty Down lists remain absent.
- [Gwangju official bus information](https://bus.jeonnam-gwangju.go.kr/busmap/lineSearch), the 127 local services (`METRO_FLAG=0`) and their published stop order/coordinates. Linked external-city services are excluded.

The 40 automated tests cover existing money/subway behaviour and bus directionality, repeated stop occurrences, mandatory transfers, separate nearby platforms, source snapshot validation, timing, native-size notes, route replacement and dataset integrity in all five regions. UI checks cover Korean/English, phone/desktop layouts, actual map taps, saved transfer routes, automatic/manual times, preservation after reload, first-place stale-route controls and the original 656-station capital subway SVG. Native model round-trip compatibility is checked against the unchanged installed schema.
