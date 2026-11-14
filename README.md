# TripFlow Korea · Web presentation

English and Korean travel planner for the TripFlow Korea iPhone app. A buildless website: publish the contents of `dist/` at an HTTPS URL. No user trips, expenses, API secrets or Apple credentials are part of this source.

The iPhone shell provides a versioned `tripflow` bridge for on-device storage, Apple Maps place search, route estimates, map markers, reference exchange rates, sharing and conservative payment-message parsing. The website provides the interface and itinerary / expense editing. Existing native trips use the same JSON schema and storage file.

Ordinary interface/content changes require only a website deployment. Update `VERSION`, `version.json` and asset query versions together. The app checks on reopening and when returning to the foreground; it waits while a dialog is open. Native capability changes or bridge incompatibility require an app update. Keep bridge version 1 compatible with installed apps.

On Safari or desktop, trips are stored in localStorage. Browser data and app data are separate. Web place search uses Photon's public demo endpoint on explicit submission, with caching and a per-client interval. App place search uses Apple Maps first and falls back to Photon after an error or a 14-second deadline. No service worker is installed. Export a backup before clearing browser data or uninstalling the app.

Public geocoding service: https://github.com/komoot/photon (reasonable-use demo, no availability guarantee). Production scale requires a dedicated search service. Reference exchange rates: https://frankfurter.dev. External maps and directions open Kakao Maps. Automatic public transport routing uses the bundled regional snapshots locally; it has no live traffic, arrival or timetable API.

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

## Combined bus + subway journeys · web-10

**Bus + subway** in My Trip / Essentials and **Combined journey** on an incoming itinerary movement open a section composer. Choose bus and subway sections on their existing interactive maps, then join them into one saved journey. Bus → subway → bus and subway → bus → subway are supported in all five existing regions. Existing single-mode routes can be imported as the first section. Each section can be edited, removed or moved earlier. Nearby station/stop suggestions seed the next section's boarding point; Korean/English labels and published stop codes remain available.

This is a **user-directed composition workflow**, not an automatic end-to-end mixed-mode route search. Existing bus/subway pickers still suggest connections within their own mode. Their pick mode returns a section to the composer and never separately saves it to the itinerary. Cancelling a picker returns to the draft, and closing the draft preserves the existing saved movement.

The unified position map shows selected rides and dashed grey walking connectors. Distinct bus-platform and subway identities remain separate. Each walking transfer shows its straight-line distance and estimated walking time; default allowed transfer distance is 1,000 metres, editable from 300 to 3,000 metres. Entrance locations, crossings, physical barriers and accessibility are not verified. Nearby suggestions use the same explicit straight-line radius. Source snapshots, coverage and licensing are unchanged from web-9; subway positions remain attributed to OpenStreetMap.

The whole-journey estimate includes bus rides, train rides, waiting, walking between sections, and station entry/exit. Place access is applied only at the two outer journey endpoints. Defaults are seven minutes per bus wait, four minutes when entering the subway, three minutes waiting and five minutes walking for an internal rail interchange. All are editable. External walking is estimated at 1.25× straight-line distance and 75 m/min; boarding a transfer bus adds one minute. Internal rail changes stay inside the station; station entry/exit is charged only where the journey actually enters/leaves the rail network. Explicitly continuous rides are merged so splitting a ride in the composer does not add another wait. Ride models/reference intervals remain those described above. Components are summed in seconds and rounded together; displayed component minutes sum to the total.

Saving requires at least one bus and one subway ride, valid published directions and connected transfer points, with at most eight final vehicle legs. The estimate updates the incoming movement and later arrival times, with a preview before saving. An entered total, including an explicitly unknown duration, remains available. Live traffic, arrivals, timetables, first/last service, fares and automatic eligibility for night-only routes are not connected.

`[TripFlow Mixed v1]` notes retain compact typed bus/rail legs, snapshot identities, timing options and a bilingual summary. The combined native limit remains 2,000 characters. Bus/subway/mixed route replacements preserve ordinary notes. Manual edits and itinerary reordering clear automatic timing labels appropriately. No native bridge/model change or TestFlight upload is required.

Validation: **54 calculation/data/storage tests** and **12 DOM interaction checks** pass. The interaction runner executes the real app and picker code with a simulated DOM and stubbed canvas; it checks import, cancellation, section edits, nearby boarding seeds, a three-section journey, persistence/reload, manual totals, single-mode save prevention and removal. It does not verify browser rendering, touch geometry or visual layout. Browser layout QA was unavailable for this release. The unchanged installed native model decodes/re-encodes the mixed plan, transfer and timing snapshot, and ordinary note.

From the source folder, run `pnpm install --ignore-scripts`, `pnpm test`, and `pnpm test:flows`. Happy DOM 21.0.4 is a pinned test-only dependency; the published app remains buildless with no runtime package dependencies.

## Automatic endpoint directions · web-11

**Automatic directions** in My Trip / Essentials, or **Auto route** on an itinerary movement, opens a place-to-place planner. Selecting departure and destination starts the search. Use itinerary/starter places or explicitly search a new place through the existing Apple Maps / Photon providers. The planner automatically connects published bus directions, subway rides and walking transfers. It can recommend bus → subway → bus, subway → bus → subway, a single mode, or direct walking when that is faster. The existing manual section composer remains available.

The first result minimizes estimated seconds under the displayed walking radii and transfer limit. Dijkstra search considers every eligible boarding point, preserves repeated bus-stop occurrences and direction, and uses actual line connections. Defaults: 800 m access radius, 400 m external transfer radius, at most four transfers, and direct-walk comparison up to 1,500 m. Bus-to-bus walks are capped at 180 m. Up to six rides / five transfers can be selected in settings. Alternatives vary the first service or departure mode; they are not an exhaustive ranking of every possible route. Search limits/timeouts produce an explicit error rather than a falsely certified shortest route.

Bus rides use the existing distance model rounded per hop to seconds. Rail rides use operator reference intervals where available and the existing distance model elsewhere. Waiting allowances, station entry/exit, transfer walks and place access are included. Timing components sum exactly before rounding the total to minutes. This `auto-transit-v1` snapshot is retained with the route. Waiting times and radii can be adjusted; edits invalidate the previous recommendation until recalculated. Explicitly named night/commute services are excluded by default, with an opt-in setting. Other operating hours are not validated.

Coverage remains the five published regional snapshots described above: capital rail plus Seoul bus services, Busan, Daegu, Daejeon and Gwangju. Intercity routing and complete Gyeonggi/Incheon bus coverage are absent. Live traffic/arrivals, first/last service, service calendars, express stopping patterns, fares and accessibility are not connected. Walking is a distance-based estimate using station centres / stop coordinates; entrances, roads, crossings and barriers are not verified. The UI describes results as estimates and displays these limits and source dates.

The selected result shows a combined position map, ride directions, stop codes, walking transfers and total/breakdown. Saving replaces a matching itinerary movement and updates later arrivals. Otherwise it appends the chosen journey to that day; the earlier itinerary → new departure duration remains unknown unless the departure is already the last place. Ordinary notes, money snapshots, expenses and budgets are preserved. A failed storage write rolls back changes. `[TripFlow AutoTransit v1]` stores at most six typed legs, source identities and timing options in the existing note field, within the native 2,000 UTF-16 character limit. Walking-only results use the existing native `walking` mode. No native bridge, schema or TestFlight update is required.

Routing normally runs in a module Web Worker and never sends coordinates to an external route provider. Endpoint changes and cancellation terminate the worker; late results are discarded. A local fallback handles environments without module workers. New-place search is a separate explicit network request with its existing geocoder privacy/availability constraints.

Validation: **69 calculation/data/storage tests**, **12 existing manual-composer DOM checks**, and **18 automatic-planner DOM checks** pass. Synthetic routes are cross-checked with an independent exhaustive candidate enumeration; all five real regions produce independently re-quoted matching totals. Tests cover direction, repeated platforms, transfer/walking bounds, wait changes, saved notes, stale workers, cancellation, direct walking, English/Korean, storage rollback and new-place append behaviour. The unchanged native model round-trips both automatic transit and walking plans. DOM/canvas-stub tests do not verify rendered browser layout, touch geometry or physical iPhone behaviour; those checks were unavailable for this release. Run `pnpm test:auto-flows` for the new interaction checks.

## 실시간 도착정보 신청 · 준비 상태

**현재 공개 홈페이지는 web-13 버스·지하철 통합 검색·실제 지도 표시·예상시간 방식입니다. 실시간 도착정보는 적용하지 않았습니다.** 인증키가 없는 상태이며, `server/`의 중계·계산 코드는 배포 전 준비본입니다. 키 발급, 서버 연결, 정류소·노선·방향 매핑 및 실제 응답 검증이 끝나야 실시간 경로를 켤 수 있습니다. 기존 앱·홈페이지의 일정과 경비는 변경하지 않았습니다.

### 먼저 신청할 두 가지

1. **서울 지하철:** [서울 열린데이터광장 인증키 신청](https://data.seoul.go.kr/together/mypage/actkeyMain.do)에 로그인하고 **실시간 지하철용 인증키**를 신청합니다. 일반 인증키와 구분합니다. 사용할 데이터는 [서울시 지하철 실시간 도착정보](https://data.seoul.go.kr/dataList/OA-12764/A/1/datasetView.do)입니다. 공식 안내상 기본 하루 1,000회 제한이 있으며, 운영 서비스의 활용사례 등록·승인 후 제한 해제를 신청할 수 있습니다. [공식 이용 안내](https://data.seoul.go.kr/together/guide/useGuide.do), [공식 FAQ](https://data.seoul.go.kr/together/notice/faqList.do).
2. **서울 버스:** [서울특별시 버스도착정보조회 서비스](https://www.data.go.kr/data/15000314/openapi.do)에 공공데이터포털 계정으로 로그인하고 **활용신청**합니다. 비용은 무료로 안내되어 있습니다. 승인 상태와 일반 인증키를 마이페이지에서 확인합니다.

신청서에서 사용할 내용:

- 서비스명: **TripFlow Korea**
- 서비스 주소: **https://queninkim.github.io/tripflow-korea/** (실제 웹페이지 주소)
- 활용목적: **외국인 대상 국내 여행플래너의 버스·지하철 실시간 도착정보와 환승 경로 추천**
- 유형 선택란이 있다면 웹서비스를 기준으로 입력합니다. 실제 화면의 필수 항목·승인 조건을 따릅니다.

인증키 값은 채팅에 보내지 않습니다. 서버의 비공개 환경변수 `SEOUL_SUBWAY_KEY`, `SEOUL_BUS_KEY`에 등록합니다. 소스, `dist/`, 공개 GitHub 저장소, 앱 설정의 공개 입력란에 넣지 않습니다. 발급 완료 여부만 알려주면 서버 연결과 등록 단계를 이어갈 수 있습니다.

### 다른 지역 버스

공공데이터포털에서 다음 무료 API도 각각 활용신청합니다. 같은 포털 키가 표시되더라도 각 서비스 이용 승인 여부를 확인해야 합니다.

- [국토교통부(TAGO) 버스도착정보](https://www.data.go.kr/data/15098530/openapi.do)
- [국토교통부(TAGO) 버스노선정보](https://www.data.go.kr/data/15098529/openapi.do)
- [국토교통부(TAGO) 버스정류소정보](https://www.data.go.kr/data/15098534/openapi.do)

TAGO의 제공 도시는 도시코드 조회로 확인합니다. 현재 앱의 지역별 정류소·노선 ID와 TAGO ID를 대조해야 하므로 정류소명이나 노선번호만으로 연결하지 않습니다. 미지원 도시는 예상시간을 유지합니다. TAGO 버스 키로 지역 지하철 실시간 도착정보가 제공된다고 가정하지 않습니다. 수도권 외 지하철은 운영사별 실제 제공 여부와 인터페이스를 추가 확인해야 합니다.

### 준비된 코드와 남은 검증

`server/arrival-gateway.mjs`는 서버 비밀키로 서울 지하철·서울 버스·TAGO 버스 요청을 구성합니다. 고정 공급자 주소, 입력 검사, 8초 요청 제한, 15초 캐시, 동시 동일 요청 합치기, 오류 시 키 비노출, 출처 반환이 포함됩니다. `server/api/arrivals.mjs`는 연결 후 사용할 Vercel Node 함수 진입점이며, 서버 프로젝트 루트는 `server/`입니다. 서버는 아직 배포되지 않았고 Vercel 연결도 확인되지 않았습니다. 앱의 기존 GitHub Pages 주소를 유지하면서 API만 별도로 둘 수 있습니다.

서울 공식 명세의 HTTP 주소에서 공개 지하철 샘플은 형식 검증에 성공했고, 버스 주소는 인증키 누락 응답을 반환했습니다. 두 서울 호스트의 HTTPS 요청은 이 환경에서 시간 초과되었습니다. 실제 키가 있는 호출, 서버 배포 환경에서의 공급자 연결 및 전송 방식은 재검증해야 합니다. 앱에서 중계 서버로의 연결은 HTTPS를 사용합니다. 공개 샘플은 실제 서비스 인증키 검증을 대체하지 않습니다.

`server/live-wait.mjs`는 정류소까지 도보와 앞 구간 이동시간을 계산한 뒤 탈 수 있는 다음 차량을 선택하는 순수 계산 모듈입니다. 90초보다 오래된 정보, 반대 방향·미확인 ID·종착지/정차 패턴 미검증 정보는 실제 도착정보로 취급하지 않습니다. 오늘의 현재 출발에만 적용하고 미래·지난 날짜 일정에는 모델 대기를 유지합니다. 후보 재정렬은 전체 네트워크의 실시간 최단을 보장하지 않으므로 `provided-candidates`, `certified:false`를 명시합니다. 현재 전역 경로 탐색기에 연결되지 않았습니다.

실제 활성화 전에 남은 작업: 인증키·서버 연결, 전체 정류소/노선/운행방향/종착지 매핑 검증, 전역 탐색의 시간 의존 대기 반영, 현재 출발과 예정 일정 구분 UI, 구간별 실시간/예상 표시와 조회시각·재조회 처리, 저장 스냅샷/네이티브 검증, 실제 응답으로 전 구간 테스트, 브라우저·아이폰 검증. 현재 캐시와 호출량 제한은 서버 인스턴스 단위이므로 공개 활성화 전 공유 캐시·전역 공급자 호출 제한을 추가해야 합니다. CORS는 인증이나 전역 호출 제한을 대신하지 않습니다.

준비본 검증: 새 서버/계산 테스트 **14개 통과**, 기존 계산·자료·저장 테스트 69개를 포함해 총 **83개 통과**. 실시간 운영 연동 완료를 뜻하지 않습니다. 배포 상태와 준비본 상태는 `Deployment.json`과 `RealtimeStaging.json`에서 구분합니다.


## Unified Directions entry · web-12

The standard **Directions / 길찾기** button on an itinerary movement opens the built-in bus/subway search. **Search directions / 이동경로 검색** in My Trip and **Bus & subway directions / 버스·지하철 길찾기** in Essentials open the same planner. Departure and destination are prefilled for an itinerary movement. Both bus and rail are compared together without selecting a transport mode first. The duplicate Auto route action is removed from each stop; individual map buttons and the manual section editor remain available. The standard action stays in the app; an explicitly labelled Kakao Maps link is available after the results.

The existing web-11 engine, source coverage, timing model and native save contract are unchanged. Direct walking, a single mode or a mixed route can win by estimated total time. Saving applies the selected movement duration and later arrival times, or appends a newly chosen journey using the existing append rules. The main Directions button also opens this combined comparison when the sample movement was previously marked walking.

The real-time integration prototype in `server/` remains disconnected. The user's current request is handled by the existing regional datasets and estimated waits; API key registration and a new backend are not required for this combined-search release.


## Road and track route map · web-14

Automatic directions and the manual bus/subway composer now trace official bus road shapes and OpenStreetMap rail track corridors rather than joining stop/station centres. Bus is blue, subway is purple with a white track pattern, and dashed walking links are explicitly labelled position references, not pedestrian navigation.

Select a suggested alternative to reveal its larger map, or use **View selected route map**. Saving opens a dedicated large map. Every saved route card has **View route map**, which loads the exact stored sections without running a new route search. Each numbered section can frame its own geometry. This includes saved automatic, manually combined, bus-only and subway-only journeys. Closing the map preserves itinerary, expense and budget data. Korean/English labels are supported. The requested “내 속도로, 더 가까이” intro was removed.

`journey-shapes-{region}.json` is lazy-loaded once per region. Bus data is matched to the exact ordered stop occurrence (including repeated stops and both directions). Displayed subsections are cut from provider geometry, never replaced with generic car directions. Source breaks remain separate polylines. Subway adjacent-station paths use only ways belonging to the selected line's OSM route relations; reverse travel uses the mapped corridor in reverse, not a claim of precise boarding platform geometry. Coordinate strings use polyline encoding at six decimal places with at most 1.5 m geometric simplification.

Missing source sections stay blank with a per-service coverage notice, while stops remain visible. A failed source request displays a retry notice; late responses cannot replace a different/closed map. A missing map library displays an unavailable notice rather than a straight-line route diagram. Geometry and basemap loading statuses are separate.

Full provenance, relation IDs and regional counts: `JourneyShapeSources.json`; public readable attribution and coverage: `dist/route-shape-sources.html`. Rail-derived geometry is © OpenStreetMap contributors, available under ODbL-1.0. Original bus data rights remain with the listed transport agencies. The source-package scripts in `scripts/` process a local `data-cache/journey-shapes/` cache; raw downloads are excluded from deployment and the source archives. Build-time Daegu conversion requires pyproj. Fetch official bus data, obtain OSM relation tags/complete relations with the documented public APIs, then run `python3 scripts/build-shapes.py` from this folder. OSM queries must be sequential and cached.

The basemap is interactive OpenStreetMap raster tiles with visible attribution and normal caching. Leaflet 1.9.4 is vendored under BSD-2-Clause; `MapVendors.json` pins its sources, byte counts and SHA-256 hashes. No service worker, offline tile bundle, bulk tile downloading or cache-busting tile URL is used. Browser/native foreground website checks load web-14 without a new TestFlight build; bridge version remains 1.

Road/rail geometry does not verify today's operating service, live arrival times, road closures, fares, station entrances, pedestrian crossings or accessibility. Time estimates and route choice use the existing local model; geometry changes do not alter the saved timing schema. Physical iPhone testing remains separate from browser mobile viewport checks.

Validation: `pnpm test` checks calculations, source geometry, missing gaps, repeated stop occurrence, reverse track geometry, cancellation, escaping and map adapter behavior. `pnpm test:auto-flows` and `pnpm test:flows` cover save/reopen of exact routes, dedicated saved maps, manual editing, failure recovery, bilingual UI, persistence and preserving financial data. Actual browser checks cover street tiles, curved roads/rails, alternative selection, automatic large map opening, saved map reopening, section framing, zoom and mobile/desktop sizing.

## Current location and embedded place maps · web-15 / iPhone 0.2.1 (5)

Every embedded journey or place map offers **My location**, showing a blue dot and a metre-based accuracy circle after an explicit tap. **Depart from my location** in combined directions, **Start here** on a journey map, and **Route from my location** on a place map use a fixed position snapshot as the departure. Moving the live dot does not silently change the selected route; request departure again to reroute. A saved departure follows the existing device-only itinerary schema.

Place detail, itinerary place maps, the whole-day map, and Essentials' map action stay within TripFlow's embedded OpenStreetMap/Leaflet map. The optional Kakao route link was removed. Offline native place-map links also use the embedded native map rather than an external mapping app. Source/copyright links and ticket-booking links remain ordinary external references.

Location acquisition starts only after a location action, shares one browser watch across visible maps, stops after the final map/request closes, and suspends when the page is hidden. Permission denial, unsupported browsers, timeouts, stale coordinates and aborted requests have explicit states; none substitutes a location. Coordinates stay in memory unless the user explicitly saves a route; they are not written to logs, geocoded externally, or published with the site. Visible OSM tiles load the displayed area under the existing tile policy.

The iPhone shell adds NSLocationWhenInUseUsageDescription and optional bootstrap.features.location. New bridge commands currentLocation and stopLocation return one foreground Core Location fix and cancel it. A visible map refreshes native fixes every 10 seconds; it does not enable background tracking. Bridge version and saved-trip schema remain 1. Existing 0.2.0 shells get an update notice for location actions instead of invoking an unsupported capability. **One TestFlight update to 0.2.1 (5) is required to enable iPhone location permission.** Ordinary website changes continue through the hosted URL afterward.

Tests cover explicit-start permission behavior, shared watching and cleanup, native cancellation, stale/invalid fixes, denial guidance, blue dot/accuracy radius rendering, fixed-departure routing and saving, ignored late fixes, embedded map actions and financial-data preservation. Browser QA uses clearly labelled simulated public landmark coordinates without requesting the owner's real position. Physical iPhone GPS accuracy has not been measured here.
