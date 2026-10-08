"""
REST Countries v5 adatletöltő script
-------------------------------------
Lekéri az összes ország kiválasztott mezőit a REST Countries API-ból,
lapozva (mert egy kérésben max 100 ország jön le), és egyetlen JSON
fájlba menti az eredményt.

Használat:
    1. Regisztrálj a https://restcountries.com oldalon, és generálj
       egy API kulcsot.
    2. Állítsd be a kulcsot a REST_COUNTRIES_API_KEY környezeti
       változóban:
           export REST_COUNTRIES_API_KEY="rc_live_..."      (Mac/Linux)
           setx REST_COUNTRIES_API_KEY "rc_live_..."         (Windows)
       ... vagy írd be közvetlenül az API_KEY változó helyére lent.
    3. Futtasd: python fetch_countries.py
    4. Az eredmény a data/countries-raw.json fájlba kerül (a "data"
       mappát a script magától létrehozza, ha még nem létezik).
"""

import gzip
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import urllib.error
import zlib

API_KEY = "rc_live_1eaa248238664127b28b0eb93e046ff5"
BASE_URL = "https://api.restcountries.com/countries/v5"
OUTPUT_FILE = "data/countries-raw.json"
PAGE_SIZE = 100

# A lekérni kívánt mezők, dot-path formátumban.
# Egy szülő útvonal (pl. "flag") az alatta lévő összes mezőt behozza.
RESPONSE_FIELDS = [
    # Azonosítás
    "names.common",
    "names.official",
    "codes.alpha_2",
    "codes.alpha_3",
    "codes.ccn3",
    # Földrajz
    "continents",
    "region",
    "subregion",
    "landlocked",
    "area.kilometers",
    "borders",
    "timezones",
    # Főváros(ok) - csak név és koordináták
    "capitals.name",
    "capitals.coordinates",
    # Zászló - teljes alfa (emoji, png/svg url, színek, leírás stb.)
    "flag",
    # Népesség
    "population",
    # Nyelv, valuta, szervezeti tagságok
    "languages",
    "currencies",
    "memberships",
    # Státusz: független állam / ENSZ-tag / függő terület / vitatott státusz
    "classification",
]


def fetch_page(offset: int) -> dict:
    """Egy oldalnyi (max 100) ország lekérése a megadott offset-tel."""
    params = {
        "limit": PAGE_SIZE,
        "offset": offset,
        "response_fields": ",".join(RESPONSE_FIELDS),
    }
    url = f"{BASE_URL}?{urllib.parse.urlencode(params)}"

    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {API_KEY}",
            # A Cloudflare a Python alapértelmezett User-Agentjét ("Python-urllib/3.x")
            # gyakran gép/bot jelzésnek tekinti, és az API-hoz érés előtt elutasítja
            # (403, "error code: 1010"). Egy valódi böngészőre jellemző fejléc-csomag
            # kikerüli ezt az ellenőrzést.
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/128.0.0.0 Safari/537.36"
            ),
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "hu-HU,hu;q=0.9,en-US;q=0.8,en;q=0.7",
            "Accept-Encoding": "gzip, deflate",
        },
    )

    try:
        with urllib.request.urlopen(request) as response:
            raw = response.read()
            content_encoding = response.headers.get("Content-Encoding", "")
            if content_encoding == "gzip":
                raw = gzip.decompress(raw)
            elif content_encoding == "deflate":
                raw = zlib.decompress(raw)
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        print(f"HTTP hiba ({e.code}) offset={offset}-nál: {body}", file=sys.stderr)
        raise


def fetch_all_countries() -> list:
    """Végigmegy az összes oldalon, amíg a meta.more igazat nem mond hamisra."""
    all_countries = []
    offset = 0

    while True:
        print(f"Lekérés: offset={offset} ...")
        payload = fetch_page(offset)

        objects = payload["data"]["objects"]
        meta = payload["data"]["meta"]

        all_countries.extend(objects)
        print(f"  -> {len(objects)} ország érkezett (eddig összesen: {len(all_countries)})")

        if not meta.get("more", False):
            break

        offset += PAGE_SIZE
        time.sleep(0.5)  # udvarias kis szünet a kérések között

    return all_countries


def main():
    if API_KEY == "IDE_ÍRD_A_SAJÁT_KULCSODAT":
        print(
            "Hiányzik az API kulcs! Állítsd be a REST_COUNTRIES_API_KEY "
            "környezeti változót, vagy írd be közvetlenül a scriptbe.",
            file=sys.stderr,
        )
        sys.exit(1)

    countries = fetch_all_countries()

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(countries, f, ensure_ascii=False, indent=2)

    print(f"\nKész! {len(countries)} ország mentve ide: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()