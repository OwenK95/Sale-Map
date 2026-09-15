# Sales Map

A map-based prospecting tool for the sales team. It shows every restaurant and company we
service or want to service, color-coded by customer status, and lets you find new
restaurants in any area.

**No install or server needed.** It is a static web page: open `index.html` in a browser
or host it on GitHub Pages.

## Features

- **Find Restaurants** – search any city, ZIP, or address (or the current map view) for
  restaurants, fast food, cafes, bars and other food businesses within a chosen radius.
  Results come from OpenStreetMap. Add them to your list one at a time or all at once.
- **Add Customer** – manually enter a restaurant or company by name and address. The
  address is located on the map automatically, or you can click the map to place it.
- **Customer list** – filter by name, address, or status. Click a customer to jump to it on
  the map. Change status straight from the map pin's popup.
- **Statuses** (each has its own pin color):
  - Not a Customer
  - Talked To
  - Service Grease Trap (No Contract)
  - Service Oil (No Contract)
  - Service Grease Trap (Contract)
  - Service Oil (Contract)
  - Service Both Oil and Grease
- **Export / Import** – download the list as JSON (backup, sharing) or CSV (spreadsheet).
  Importing a JSON file merges it with what is already on the device.

## Where the data lives

Customers are saved in the browser on the device you are using (localStorage). They are not
sent to any server. To share the list with another salesperson or move it to a new device,
use **Export JSON** on one device and **Import JSON** on the other. Import merges by record,
so two people can each add customers and combine their files.

## Hosting on GitHub Pages

1. In the repository settings, open **Pages**.
2. Under *Build and deployment*, choose **Deploy from a branch**, pick the `main` branch
   and the `/ (root)` folder, then save.
3. The map will be available at `https://<your-username>.github.io/Sale-Map/`.

## Services used (all free, no API key)

- [Leaflet](https://leafletjs.com/) with OpenStreetMap map tiles
- [Nominatim](https://nominatim.org/) for turning addresses into map locations
- [Overpass API](https://overpass-api.de/) for finding restaurants in an area

These are community-run services with fair-use limits, which is why address lookups run at
one per second. If a search fails, wait a moment and try again.

## Project layout

```
index.html        page layout
css/styles.css    styling
js/statuses.js    the status list and colors (edit here to add or rename statuses)
js/storage.js     saving/loading customers, CSV export
js/geo.js         address lookup and restaurant search
js/app.js         map, lists, forms, and all interactions
```
