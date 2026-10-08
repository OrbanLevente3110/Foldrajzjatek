"""
Wikidata legmagasabb pont lekérdező script
--------------------------------------------
Lekéri minden olyan Wikidata-entitás legmagasabb pontjának nevét és
magasságát, amihez tartozik ISO 3166-1 numerikus kód (ez ugyanaz a kód,
mint a TopoJSON és a REST Countries "ccn3" mezője) - tehát gyakorlatilag
minden ország/terület, amit eddig is használtunk.

Használat:
    python fetch_highest_points.py
    Az eredmény a data/highest-points.json fájlba kerül.

Megjegyzés a User-Agentről: a Wikimedia kéri, hogy a scriptek egyedi,
azonosítható User-Agentet küldjenek (ellentétben a REST Countries-nél
tapasztalt Cloudflare-védelemmel, ahol épp a böngésző-utánzás kellett).
Cseréld le a kontakt e-mail placeholdert a sajátodra.
"""

import json
import os
import urllib.parse
import urllib.request

ENDPOINT_URL = "https://query.wikidata.org/sparql"
OUTPUT_FILE = "data/highest-points.json"

USER_AGENT = "FoldrajziKvizAdatgyujto/1.0 (personal project; kontakt: @gmail.com)"

SPARQL_QUERY = """
SELECT ?iso_numeric ?countryLabel ?peakLabel ?elevation WHERE {
  ?country wdt:P299 ?iso_numeric.
  OPTIONAL {
    ?country wdt:P610 ?peak.
    OPTIONAL { ?peak wdt:P2044 ?elevation. }
  }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "hu,en". }
}
"""


def fetch_highest_points() -> list:
    params = {"query": SPARQL_QUERY, "format": "json"}
    url = f"{ENDPOINT_URL}?{urllib.parse.urlencode(params)}"

    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/sparql-results+json",
        },
    )

    with urllib.request.urlopen(request) as response:
        payload = json.loads(response.read().decode("utf-8"))

    results = []
    for row in payload["results"]["bindings"]:
        iso_numeric = row.get("iso_numeric", {}).get("value")
        if not iso_numeric:
            continue

        # A TopoJSON/REST Countries konvencióhoz igazítva 3 jegyre igazítjuk
        ccn3 = iso_numeric.zfill(3)

        elevation_raw = row.get("elevation", {}).get("value")

        results.append({
            "ccn3": ccn3,
            "country_name": row.get("countryLabel", {}).get("value"),
            "highest_point_name": row.get("peakLabel", {}).get("value"),
            "highest_point_elevation_m": float(elevation_raw) if elevation_raw else None,
        })

    return results


def main():
    print("Lekérdezés indítása a Wikidata felé...")
    data = fetch_highest_points()

    missing = sum(1 for d in data if not d["highest_point_name"])
    print(f"{len(data)} bejegyzés érkezett, ebből {missing}-nél nincs kitöltve a legmagasabb pont.")

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Kész! Mentve ide: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()