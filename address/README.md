# Address reference data

The supplied region, province, and city JSON files feed the attendance app's location choices. Run `node scripts/address-data.js` after changing these files; `npm run build` also regenerates `assets/address-data.js`.

The browser loads an approximately 88 KB region/city catalog. The barangay index and TypeScript service are retained as supplied source material and are not shipped to the frontend. The TypeScript test requires Vitest and is not part of the app's Node test suite.

Regions and cities appear as reference values in Standards. Custom values remain supported. Existing saved city names are preserved so holiday matching and historical attendance continue to use the same text. Duplicate municipality names include their province to distinguish them.

Employee forms filter holiday cities by region; store forms use the same reference. The employee region filter is inferred from the selected city, not stored as a new employee field. This integration does not populate wage amounts or implement regional wage rules. No database migration is required.
