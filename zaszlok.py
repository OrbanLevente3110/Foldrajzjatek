"""
Zászlókép-letöltő script
--------------------------
Beolvassa a korábban a fetch_countries.py-jal lementett countries-raw.json
fájlt, és minden országhoz ténylegesen letölti a zászló SVG-képét egy
helyi mappába - így a játék offline is meg tudja jeleníteni őket, nem
egy külső URL-re mutat.

Előfeltétel: a countries-raw.json már létezik (tehát a fetch_countries.py
már lefutott egyszer).

Használat:
    python fetch_flags.py
    A képek az assets/flags/ mappába kerülnek, {alpha_2}.svg néven
    (pl. assets/flags/hu.svg).
"""

import json
import os
import time
import urllib.error
import urllib.request

INPUT_FILE = "data/countries-raw.json"
OUTPUT_DIR = "assets/flags"

# Ugyanaz a böngésző-szerű fejléc-csomag, mint a fetch_countries.py-ban,
# mert nem tudni előre, hogy a zászlóképeket kiszolgáló szerver mögött is
# fut-e hasonló bot-védelem.
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/128.0.0.0 Safari/537.36"
    ),
    "Accept": "image/svg+xml,image/*,*/*;q=0.8",
}


def download_flag(url: str, dest_path: str) -> None:
    request = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(request) as response:
        data = response.read()
    with open(dest_path, "wb") as f:
        f.write(data)


def main():
    if not os.path.exists(INPUT_FILE):
        print(f"Nem található: {INPUT_FILE}. Futtasd előbb a fetch_countries.py-t.")
        return

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        countries = json.load(f)

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    ok, failed, skipped = 0, 0, 0

    for country in countries:
        alpha_2 = (country.get("codes") or {}).get("alpha_2")
        flag_url = (country.get("flag") or {}).get("url_svg")
        name = (country.get("names") or {}).get("common", "?")

        if not alpha_2 or not flag_url:
            print(f"Kihagyva (hiányzó kód vagy URL): {name}")
            skipped += 1
            continue

        dest_path = os.path.join(OUTPUT_DIR, f"{alpha_2.lower()}.svg")

        try:
            download_flag(flag_url, dest_path)
            print(f"Letöltve: {alpha_2} ({name})")
            ok += 1
        except urllib.error.HTTPError as e:
            print(f"Hiba {alpha_2} ({name}) zászlójánál: HTTP {e.code}")
            failed += 1
        except urllib.error.URLError as e:
            print(f"Hálózati hiba {alpha_2} ({name}) zászlójánál: {e.reason}")
            failed += 1

        time.sleep(0.1)  # udvarias kis szünet a kérések között

    print(f"\nKész! Sikeres: {ok}, hibás: {failed}, kihagyott: {skipped}")


if __name__ == "__main__":
    main()