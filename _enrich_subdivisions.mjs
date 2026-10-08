import fs from "node:fs/promises";

const topologyPath = "data/subdivisions-topology.json";
const outputPath = "data/subdivisions.json";
const wikidataCachePath = "data/subdivision-wikidata.json";

const topology = JSON.parse(await fs.readFile(topologyPath, "utf8"));
const objectName = Object.keys(topology.objects)[0];
const geometries = topology.objects[objectName].geometries;
const countryData = JSON.parse(await fs.readFile("data/game_data.json", "utf8"));
const countries = countryData.objects.countries.geometries;
const countryByAlpha2 = new Map(
    countries
        .filter(country => country.properties?.codes?.alpha_2)
        .map(country => [country.properties.codes.alpha_2, country.properties])
);

let wikidataCache = {};
try {
    wikidataCache = JSON.parse(await fs.readFile(wikidataCachePath, "utf8"));
} catch {}

const qids = [...new Set(
    geometries
        .map(geometry => geometry.properties.wikidataid)
        .filter(qid => /^Q\d+$/.test(qid ?? ""))
)];
const missingQids = qids.filter(qid => !(qid in wikidataCache));

function chunks(items, size) {
    const result = [];
    for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
    return result;
}

async function fetchSparql(query) {
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
    for (let attempt = 1; attempt <= 5; attempt++) {
        const response = await fetch(url, {
            headers: { "User-Agent": "FoldrajzJatek/1.0 (educational geography game)" },
        });
        if (response.ok) return response.json();
        if (attempt === 5) throw new Error(`Wikidata request failed: ${response.status}`);
        await new Promise(resolve => setTimeout(resolve, attempt * 1500));
    }
}

let completed = 0;
for (const batch of chunks(missingQids, 70)) {
    const values = batch.map(qid => `wd:${qid}`).join(" ");
    const query = `
SELECT ?item ?itemLabel ?capital ?capitalLabel ?population ?flag ?coat WHERE {
  VALUES ?item { ${values} }
  OPTIONAL { ?item wdt:P36 ?capital. }
  OPTIONAL { ?item wdt:P1082 ?population. }
  OPTIONAL { ?item wdt:P41 ?flag. }
  OPTIONAL { ?item wdt:P94 ?coat. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "hu,en". }
}`;
    const result = await fetchSparql(query);
    for (const qid of batch) wikidataCache[qid] = {};
    for (const binding of result.results.bindings) {
        const qid = binding.item.value.split("/").pop();
        const current = wikidataCache[qid] ?? {};
        current.name = current.name ?? binding.itemLabel?.value ?? null;
        current.capital = current.capital ?? binding.capitalLabel?.value ?? null;
        current.population = current.population ?? (binding.population ? Number(binding.population.value) : null);
        current.flag_url = current.flag_url ?? binding.flag?.value?.replace("http://", "https://") ?? null;
        current.coat_of_arms_url = current.coat_of_arms_url ?? binding.coat?.value?.replace("http://", "https://") ?? null;
        wikidataCache[qid] = current;
    }
    completed += batch.length;
    await fs.writeFile(wikidataCachePath, `${JSON.stringify(wikidataCache)}\n`, "utf8");
    console.log(`Wikidata: ${completed}/${missingQids.length}`);
}

for (const geometry of geometries) {
    const source = geometry.properties;
    const wikidata = wikidataCache[source.wikidataid] ?? {};
    const parent = countryByAlpha2.get(source.iso_a2);
    const commonName = source.name_hu || wikidata.name || source.name_en || source.name;
    geometry.id = source.adm1_code || source.iso_3166_2 || String(source.ne_id);
    geometry.properties = {
        names: {
            common: commonName,
            native: source.name_local || source.name || commonName,
        },
        codes: {
            adm1: source.adm1_code || null,
            iso_3166_2: source.iso_3166_2 && source.iso_3166_2 !== "-99" ? source.iso_3166_2 : null,
            wikidata: source.wikidataid || null,
        },
        type: source.type_en || null,
        country: {
            alpha_2: source.iso_a2 || null,
            alpha_3: source.adm0_a3 || null,
            name: parent?.names?.common || source.admin,
        },
        continents: parent?.continents || [],
        center: Number.isFinite(source.latitude) && Number.isFinite(source.longitude)
            ? { lat: source.latitude, lng: source.longitude }
            : null,
        capital: wikidata.capital || null,
        population: Number.isFinite(wikidata.population) ? wikidata.population : null,
        flag: wikidata.flag_url ? { url: wikidata.flag_url, local_path: null } : null,
        coat_of_arms: wikidata.coat_of_arms_url ? { url: wikidata.coat_of_arms_url, local_path: null } : null,
    };
}

const usableGeometries = geometries.filter(geometry =>
    geometry.properties.names.common && geometry.properties.continents.length > 0
);
topology.objects[objectName].geometries = usableGeometries;
topology.objects = { subdivisions: topology.objects[objectName] };
await fs.writeFile(outputPath, `${JSON.stringify(topology)}\n`, "utf8");

const counts = usableGeometries.reduce((result, geometry) => {
    const properties = geometry.properties;
    result.capital += Boolean(properties.capital);
    result.population += Number.isFinite(properties.population);
    result.flag += Boolean(properties.flag?.url);
    result.coat_of_arms += Boolean(properties.coat_of_arms?.url);
    return result;
}, { total: usableGeometries.length, capital: 0, population: 0, flag: 0, coat_of_arms: 0 });
console.log(JSON.stringify(counts));
