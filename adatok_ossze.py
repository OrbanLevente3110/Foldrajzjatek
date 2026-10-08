import json
import os
countries_data_file = "data/countries-raw.json"
topology_file = "data/topology.json"
highest_point_file = "data/highest-points.json"
flags_dir = "assets/flags"
coats_of_arms_dir = "assets/coats-of-arms"
output_file = "data/game_data.json"

def normalize_ccn3(value) -> str:
    return str(value).strip().zfill(3)

def load_json(path):
    if not os.path.exists(path):
        print("Nincs ilyen fájl!")
        raise ValueError
    with open(path,"r",encoding="utf-8") as f:
        data = json.load(f)
        return data

def build_countries_lookup(countries):
    lookup = {}
    for c in countries:
        ccn3 = (c.get("codes") or {}).get("ccn3")
        if ccn3:
            lookup[normalize_ccn3(ccn3)] = c
    return lookup

def build_highest_points_lookup(highest_points):
    lookup = {}
    for c in highest_points:
        ccn3 = c.get("ccn3")
        if ccn3:
            lookup[normalize_ccn3(ccn3)] = c
    
    return lookup

def find_local_flag(a2):
    if not a2:return 
    filename = f"{a2.lower()}.svg"
    disk_path = os.path.join(flags_dir, filename)
    if os.path.exists(disk_path):
        return f"{flags_dir}/{filename}" 
    return None

def find_local_coat_of_arms(a2):
    if not a2:return
    for extension in ("svg", "png"):
        filename = f"{a2.lower()}.{extension}"
        disk_path = os.path.join(coats_of_arms_dir, filename)
        if os.path.exists(disk_path):
            return f"{coats_of_arms_dir}/{filename}"
    return None

def merge_data():
    countries = load_json(countries_data_file)
    print(len(countries))
    topology = load_json(topology_file)
    highest_points = load_json(highest_point_file)
    countries_lookup = build_countries_lookup(countries)
    highest_points_lookup = build_highest_points_lookup(highest_points)
    geometries = topology["objects"]["countries"]["geometries"]

    matched = 0
    unmatched = []

    for geometry in geometries:
        ccn3 = normalize_ccn3(geometry.get("id"))
        country_data = countries_lookup.get(ccn3)
        highest_point_data = highest_points_lookup.get(ccn3)

        if not country_data:
            unmatched.append({
                "id": geometry.get("id"),
                "topo_name": (geometry.get("properties") or {}).get("name"),
            })
            continue

        alpha_2 = (country_data.get("codes") or {}).get("alpha_2")
        coat_of_arms_path = find_local_coat_of_arms(alpha_2)
        geometry.setdefault("properties", {})
        geometry["properties"].update({
            "names": country_data.get("names"),
            "codes": country_data.get("codes"),
            "continents": country_data.get("continents"),
            "region": country_data.get("region"),
            "subregion": country_data.get("subregion"),
            "landlocked": country_data.get("landlocked"),
            "area": country_data.get("area"),
            "borders": country_data.get("borders"),
            "timezones": country_data.get("timezones"),
            "capitals": country_data.get("capitals"),
            "flag": country_data.get("flag"),
            "flag_local_path": find_local_flag(alpha_2),
            "coat_of_arms": {
                "local_path": coat_of_arms_path,
            } if coat_of_arms_path else None,
            "population": country_data.get("population"),
            "languages": country_data.get("languages"),
            "currencies": country_data.get("currencies"),
            "memberships": country_data.get("memberships"),
            "classification": country_data.get("classification"),
            "highest_point": {
                "name": highest_point_data.get("highest_point_name"),
                "elevation_m": highest_point_data.get("highest_point_elevation_m"),
            } if highest_point_data else None,
        })
        matched += 1
 
    return topology, matched, unmatched

def main():
    topology,matched,unmatched = merge_data()
    print("Helyes adatok: ",matched)
    print("Hibás adatok: ",unmatched)
    with open("data/game_data.json","w",encoding="utf-8") as file:
        json.dump(topology, file)
        file.write("\n")
if __name__ == "__main__":
    main()
