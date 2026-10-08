# Subdivision data sources

- Boundaries and base attributes: Natural Earth, **Admin 1 – States, Provinces**, 1:10m. The geometry was simplified to 10% for browser performance. Natural Earth data is public domain.
- Hungarian/English names, capitals, population, flags and coats of arms: Wikidata, queried through the Wikidata Query Service on 2026-10-08.
- Flag and coat-of-arms images: Wikimedia Commons URLs returned by Wikidata. Each image keeps its Commons source URL in `data/subdivisions.json`; the license and attribution requirements on that image's Commons file page apply.

The generated `data/subdivisions.json` contains 4,566 named, continent-assigned records. Missing optional values are stored as `null`, and the game excludes those records from the corresponding question type.
