# Intercity timetable integration

Production currently uses the published 2026-11-01 Korail snapshot. No credential has been issued or activated. GitHub Pages is static; a separately hosted HTTPS gateway is needed for a private TAGO key.

1. Apply for https://www.data.go.kr/data/15098552/openapi.do (free TAGO TrainInfo).
2. Set `TAGO_SERVICE_KEY` in the server host's secret store, and `TRIPFLOW_ALLOWED_ORIGINS=https://queninkim.github.io`. Do not commit a key, put it in Pages files, a URL, or browser storage.
3. Deploy `server/timetable-gateway.mjs` through an HTTPS handler. It accepts Fetch API Request and returns Response; `server/api/timetable.mjs` provides GET-independent POST/OPTIONS handlers for compatible hosts.
4. Add a host-level shared rate limit and usage cap. In-process budgets (45 upstream calls/minute, 1,500/day) are defense in depth and are not distributed across isolates. CORS is not authentication. Choose host limits to fit the approved account's current quota.
5. Verify a real date/route, station ambiguity, all result pages, provider failures and quota responses, then set `dist/intercity-config.json` `timetableEndpoint` to that specific HTTPS endpoint and publish. No native rebuild is needed.

Only selected station names and travel date are sent. Trips, user notes, budgets, current location and expenses are not sent. City/station catalogs are cached one day, query results five minutes, pending duplicate requests coalesce. API URLs and error bodies with credentials are never returned. Input can't select an upstream host or method. Pagination is bounded and incomplete/changed responses fail. No retry loop runs automatically.

The official portal Swagger checked 2026-11-14 specifies **capitalized** operations under `https://apis.data.go.kr/1613000/TrainInfo`: `GetCtyCodeList`, `GetCtyAcctoTrainSttnList`, `GetStrtpntAlocFndTrainInfo`. The latter accepts depPlaceId, arrPlaceId and depPlandTime (YYYYMMDD). This differs from some older lowercase examples.

Free additional feeds, not activated in this release:
- Express bus https://www.data.go.kr/data/15098522/openapi.do
- Intercity bus https://www.data.go.kr/data/15098541/openapi.do
- Domestic aviation https://www.data.go.kr/data/15098526/openapi.do

Bus and flight booked-service input is functional without these keys. Distances entered from bookings are labelled as entered; no private-car speed or straight-line distance is substituted.
