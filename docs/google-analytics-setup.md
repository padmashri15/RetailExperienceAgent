# Google Analytics 4 Setup

## 1. Create or Open a GA4 Property

1. Open Google Analytics.
2. Go to Admin.
3. Create or select a GA4 property.
4. Under Data collection and modification, open Data streams.
5. Create or open a Web stream.
6. Copy the Measurement ID. It starts with `G-`.

Set it in `.env`:

```bash
GA4_MEASUREMENT_ID=G-XXXXXXXXXX
```

The browser client reads this public Measurement ID at Vite startup and sends shopper events directly with `gtag.js`. Restart `npm run dev` after changing it. For a static-only build, you can also set `VITE_GA4_MEASUREMENT_ID` to the same value.

## 2. Create a Measurement Protocol API Secret

1. In the same Web data stream, open Measurement Protocol API secrets.
2. Click Create.
3. Name it `brand-experience-agent-dev`.
4. Copy the Secret value.

Set it in `.env`:

```bash
GA4_API_SECRET=your_secret_value
```

## 3. Optional Dashboard Readback

The app can send events with only the Measurement ID and API secret. Add the reporting values only if you want the dashboard to merge GA4 Data API counts back into the app.

1. Enable Google Analytics Data API v1 in Google Cloud.
2. Create a service account.
3. Give the service account Viewer access to the GA4 property.
4. Copy the numeric GA4 property ID.
5. Add either `GA4_CLIENT_EMAIL` plus `GA4_PRIVATE_KEY`, or paste the service account JSON into `GA4_SERVICE_ACCOUNT_JSON`.

```bash
GA4_PROPERTY_ID=123456789
GA4_CLIENT_EMAIL=service-account@project.iam.gserviceaccount.com
GA4_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Enable these Google Cloud APIs in the same project as the service account:

- Google Analytics Data API
- Google Analytics Admin API, optional but useful for stream diagnostics

## 4. Restart and Verify

Restart the app:

```bash
npm run dev
```

Verify server status:

```bash
curl http://127.0.0.1:8787/health
```

Expected after Measurement Protocol setup:

```json
"googleAnalytics": {
  "measurementConfigured": true,
  "reportingConfigured": false
}
```

Expected after Data API setup:

```json
"googleAnalytics": {
  "measurementConfigured": true,
  "reportingConfigured": true
}
```

The browser loads GA4 `gtag.js` from the same Measurement ID so page views and ecommerce events appear in the standard GA4 web stream. The Measurement Protocol API secret remains server-only and is used only for diagnostics/server-originated events.

Verify the browser-side tag from the app console:

```js
window.brandExperienceGa
```

Expected browser status after a hard refresh and one product click:

```json
{
  "enabled": true,
  "initialized": true,
  "measurementId": "G-XXXXXXXXXX",
  "scriptRequested": true,
  "scriptLoaded": true,
  "eventCount": 1,
  "lastEventName": "select_item"
}
```

Validate the Measurement Protocol payload:

```bash
curl http://127.0.0.1:8787/api/admin/ga4/diagnostics
```

Expected validation result:

```json
{
  "validationMessages": []
}
```

Send one real diagnostic event:

```bash
curl -X POST http://127.0.0.1:8787/api/admin/ga4/diagnostics/test-event
```

Expected app send result:

```json
{
  "lastForwardStatus": {
    "ok": true,
    "httpStatus": 204
  }
}
```

If `validationMessages` is empty but `realtimeEvents` is still empty after sending demo events, check that:

1. `GA4_MEASUREMENT_ID` belongs to the same GA4 property as `GA4_PROPERTY_ID`.
2. `GA4_API_SECRET` was created under that exact Web data stream.
3. The GA4 Realtime screen is open for the same property.
4. The Google Analytics Data API is enabled for the service account project if the diagnostics response includes `realtimeError`.

The Google validation endpoint does not verify whether the API secret or Measurement ID are matched to the reporting property.

## Demo Events to Generate

1. Change Preference to Weather.
2. Click `View TrailForm All Weather Jacket in 3D`.
3. Change a colorway or surface finish.
4. Add the product to cart.
5. Ask a product question in chat.
6. Open Analytics dashboard and click Refresh.

GA4 Realtime should start showing events such as `preference_selected`, `product_impression`, `product_3d_view`, `product_customized`, `add_to_cart`, `begin_checkout`, `intent_detected`, and `governance_review`.

Browser ecommerce events use GA4 standard names where available: `page_view`, `view_item_list`, `view_item`, `select_item`, `add_to_cart`, and `begin_checkout`.
