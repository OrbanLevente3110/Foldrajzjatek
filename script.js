let countryTopology = null;
let subdivisionTopology = null;
let gameState = null;

const optionButtons = ["option_1", "option_2", "option_3", "option_4"].map(id => document.getElementById(id));
const nextQuestionButton = document.getElementById("next_question");

async function loadJson(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    return response.json();
}

async function main() {
    [countryTopology, subdivisionTopology] = await Promise.all([
        loadJson("data/game_data.json"),
        loadJson("data/subdivisions.json"),
    ]);
    const countries = countryTopology.objects.countries.geometries;
    const subdivisions = subdivisionTopology.objects.subdivisions.geometries;
    const setupButton = document.getElementById("game_setup_btn");
    const continentInputs = [...document.querySelectorAll('input[name="continent"]')];
    const classificationInputs = [...document.querySelectorAll('input[name="classification"]')];
    const modeInputs = [...document.querySelectorAll('input[name="game_mode"]')];
    const worldInput = document.getElementById("World");
    const individualContinentInputs = continentInputs.filter(input => input !== worldInput);
    const allSubdivisionCountriesInput = document.getElementById("subdivision_country_all");
    const subdivisionCountryOptions = document.getElementById("subdivision_country_options");
    const subdivisionCountrySearch = document.getElementById("subdivision_country_search");

    function selectedMode() {
        return modeInputs.find(input => input.checked)?.value ?? "countries";
    }

    function selectedContinents() {
        return individualContinentInputs.filter(input => input.checked).map(input => input.id);
    }

    function updateSubdivisionCountryOptions() {
        const previouslySelected = new Set(
            [...document.querySelectorAll('input[name="subdivision_country"]:checked')].map(input => input.value)
        );
        const continents = selectedContinents();
        const countryNames = [...new Set(
            subdivisions
                .filter(subdivision => subdivision.properties.continents.some(continent => continents.includes(continent)))
                .map(subdivision => subdivision.properties.country.name)
        )].sort((a, b) => a.localeCompare(b, "hu"));

        subdivisionCountryOptions.replaceChildren(...countryNames.map(countryName => {
            const label = document.createElement("label");
            label.className = "choice";
            const input = document.createElement("input");
            input.type = "checkbox";
            input.name = "subdivision_country";
            input.value = countryName;
            input.checked = previouslySelected.has(countryName);
            input.disabled = selectedMode() !== "subdivisions";
            input.addEventListener("change", () => {
                if (input.checked) allSubdivisionCountriesInput.checked = false;
                updateStartButton();
            });
            const text = document.createElement("span");
            text.textContent = countryName;
            label.append(input, text);
            return label;
        }));
        filterSubdivisionCountryOptions();
    }

    function filterSubdivisionCountryOptions() {
        const search = subdivisionCountrySearch.value.trim().toLocaleLowerCase("hu");
        [...subdivisionCountryOptions.children].forEach(label => {
            label.classList.toggle("hidden", !label.textContent.toLocaleLowerCase("hu").includes(search));
        });
    }

    function updateStartButton() {
        const hasContinent = continentInputs.some(input => input.checked);
        const hasQuestionType = [...document.querySelectorAll('input[name="question_type"]')]
            .some(input => input.checked && !input.disabled);
        const hasClassification = selectedMode() === "subdivisions" || classificationInputs.some(input => input.checked);
        const hasSubdivisionCountry = selectedMode() !== "subdivisions" ||
            allSubdivisionCountriesInput.checked ||
            [...document.querySelectorAll('input[name="subdivision_country"]')].some(input => input.checked);
        setupButton.disabled = !hasContinent || !hasQuestionType || !hasClassification || !hasSubdivisionCountry;
        document.getElementById("setup_error").classList.add("hidden");
    }

    function updateModeFields() {
        const subdivisionMode = selectedMode() === "subdivisions";
        document.querySelectorAll(".country-only").forEach(element => {
            element.classList.toggle("hidden", subdivisionMode);
            element.querySelector("input").disabled = subdivisionMode;
        });
        document.querySelectorAll(".subdivision-only").forEach(element => {
            element.classList.toggle("hidden", !subdivisionMode);
            element.querySelectorAll("input").forEach(input => input.disabled = !subdivisionMode);
        });
        document.getElementById("classification_fieldset").classList.toggle("hidden", subdivisionMode);
        classificationInputs.forEach(input => input.disabled = subdivisionMode);
        updateSubdivisionCountryOptions();
        updateStartButton();
    }

    worldInput.addEventListener("change", () => {
        individualContinentInputs.forEach(input => input.checked = worldInput.checked);
        updateSubdivisionCountryOptions();
        updateStartButton();
    });
    individualContinentInputs.forEach(input => input.addEventListener("change", () => {
        worldInput.checked = individualContinentInputs.every(item => item.checked);
        updateSubdivisionCountryOptions();
        updateStartButton();
    }));
    allSubdivisionCountriesInput.addEventListener("change", () => {
        if (allSubdivisionCountriesInput.checked) {
            document.querySelectorAll('input[name="subdivision_country"]').forEach(input => input.checked = false);
        }
        updateStartButton();
    });
    subdivisionCountrySearch.addEventListener("input", filterSubdivisionCountryOptions);
    document.querySelectorAll('input[name="question_type"], input[name="classification"]')
        .forEach(input => input.addEventListener("change", updateStartButton));
    modeInputs.forEach(input => input.addEventListener("change", updateModeFields));
    updateModeFields();

    setupButton.addEventListener("click", () => {
        const setup = getSetup();
        const entities = setup.mode === "countries"
            ? getQuestionCountries(countries, setup.continents, setup.classifications)
            : getQuestionSubdivisions(subdivisions, setup.continents, setup.subdivisionCountries);
        const started = startGame(entities, setup.questionTypes, setup.questionCount, setup.mode, entities);
        if (!started) {
            const error = document.getElementById("setup_error");
            error.textContent = "A kiválasztott országokban nincs elég adat ehhez a kérdéstípushoz. Válassz másik kérdéstípust, országot vagy több kontinenst.";
            error.classList.remove("hidden");
        }
    });

    document.getElementById("restart_button").addEventListener("click", () => {
        document.getElementById("game_div").classList.add("hidden");
        document.getElementById("game_setup_div").classList.remove("hidden");
    });
}

function getSetup() {
    const allContinents = ["Europe", "Asia", "Africa", "Oceania", "North America", "South America", "Antarctica"];
    let continents = allContinents.filter(continent => document.getElementById(continent).checked);
    if (document.getElementById("World").checked) continents = allContinents;
    const mode = document.querySelector('input[name="game_mode"]:checked').value;
    const questionTypes = [...document.querySelectorAll('input[name="question_type"]')]
        .filter(input => input.checked && !input.disabled)
        .map(input => input.id);
    const unMember = document.getElementById("un_member").checked;
    return {
        mode,
        continents,
        questionTypes,
        questionCount: Number(document.getElementById("question_count").value),
        subdivisionCountries: document.getElementById("subdivision_country_all").checked
            ? []
            : [...document.querySelectorAll('input[name="subdivision_country"]:checked')].map(input => input.value),
        classifications: {
            un_member: unMember,
            sovereign: document.getElementById("sovereign").checked || unMember,
            dependency: document.getElementById("dependency").checked,
            un_observer: unMember,
        },
    };
}

function getQuestionCountries(countries, continents, classifications) {
    const keys = Object.entries(classifications).filter(([, selected]) => selected).map(([key]) => key);
    return countries.filter(country =>
        country.properties?.continents?.some(continent => continents.includes(continent)) &&
        keys.some(key => country.properties?.classification?.[key] === true)
    );
}

function getQuestionSubdivisions(subdivisions, continents, countryNames = []) {
    return subdivisions.filter(subdivision =>
        subdivision.properties?.continents?.some(continent => continents.includes(continent)) &&
        (countryNames.length === 0 || countryNames.includes(subdivision.properties.country?.name))
    );
}

function startGame(entities, questionTypes, questionCount, mode, answerEntities = entities) {
    const supportedTypes = questionTypes.filter(type => isQuestionTypeAvailable(type, entities, mode, answerEntities));
    if (entities.length === 0 || supportedTypes.length === 0) return false;
    gameState = {
        mode,
        entities,
        answerEntities,
        questionTypes: supportedTypes,
        points: 0,
        correctAnswer: null,
        currentQuestion: 0,
        totalQuestions: questionCount,
        questionDecks: buildQuestionDecks(entities, supportedTypes, mode),
    };
    document.getElementById("game_setup_div").classList.add("hidden");
    document.getElementById("game_div").classList.remove("hidden");
    document.getElementById("answer_options").classList.remove("hidden");
    document.getElementById("result_panel").classList.add("hidden");
    nextQuestionButton.classList.add("hidden");
    updateGameHud();
    giveQuestion();
    return true;
}

function updateGameHud() {
    document.getElementById("question_progress").textContent = `${gameState.currentQuestion} / ${gameState.totalQuestions}`;
    document.getElementById("points_counter").textContent = gameState.points;
}

function finishGame() {
    clearMap();
    document.getElementById("question").textContent = "";
    document.getElementById("answer_options").classList.add("hidden");
    nextQuestionButton.classList.add("hidden");
    document.getElementById("result_text").textContent = `${gameState.points} / ${gameState.totalQuestions} pontot értél el!`;
    document.getElementById("result_panel").classList.remove("hidden");
}

function randomElem(items) { return items[Math.floor(Math.random() * items.length)]; }
function shuffle(items) { return [...items].sort(() => Math.random() - 0.5); }
function countryName(country) { return country.properties.names.common; }
function subdivisionName(subdivision) { return subdivision.properties.names.common; }
function subdivisionLabel(subdivision) { return `${subdivisionName(subdivision)} (${subdivision.properties.country.name})`; }
function hasGeometry(entity) { return entity.type === "Polygon" || entity.type === "MultiPolygon"; }

function getOptions(correctAnswer, possibleAnswers) {
    const unique = [...new Set(possibleAnswers)].filter(answer => answer !== correctAnswer);
    return shuffle([correctAnswer, ...shuffle(unique).slice(0, 3)]);
}

function similarNamedOptions(entity, candidates, nameGetter, valueGetter) {
    const answer = nameGetter(entity);
    const targetValue = Number(valueGetter(entity));
    const ranked = candidates
        .filter(candidate => nameGetter(candidate) !== answer)
        .sort((a, b) => {
            const distance = candidate => Math.abs(Math.log((Number(valueGetter(candidate)) + 1) / (targetValue + 1)));
            return distance(a) - distance(b);
        });
    return shuffle([answer, ...ranked.map(nameGetter).filter((name, index, names) => names.indexOf(name) === index).slice(0, 3)]);
}

function numericOptions(entity, candidates, valueGetter) {
    const value = Number(valueGetter(entity));
    const rankedValues = candidates
        .map(valueGetter)
        .filter(candidateValue => Number.isFinite(candidateValue) && candidateValue !== value)
        .sort((a, b) => Math.abs(Math.log((a + 1) / (value + 1))) - Math.abs(Math.log((b + 1) / (value + 1))));
    const values = [value, ...rankedValues.filter((item, index) => rankedValues.indexOf(item) === index).slice(0, 3)];
    return shuffle(values.map(item => new Intl.NumberFormat("hu-HU").format(item)));
}

function isQuestionTypeAvailable(type, entities, mode, answerEntities = entities) {
    if (mode === "subdivisions") {
        if (type === "capital") return entities.some(e => e.properties.capital) &&
            new Set(answerEntities.filter(e => e.properties.capital).map(e => e.properties.capital)).size >= 4;
        if (type === "population") return entities.some(e => Number.isFinite(e.properties.population)) &&
            new Set(answerEntities.filter(e => Number.isFinite(e.properties.population)).map(e => e.properties.population)).size >= 4;
        if (type === "parent_country") return entities.some(e => e.properties.country?.name) &&
            new Set(answerEntities.map(e => e.properties.country?.name).filter(Boolean)).size >= 4;
        if (type === "flag") return entities.some(e => e.properties.flag?.local_path || e.properties.flag?.url) &&
            new Set(answerEntities.filter(e => e.properties.flag?.local_path || e.properties.flag?.url).map(subdivisionLabel)).size >= 4;
        if (type === "coat_of_arms") return entities.some(e => e.properties.coat_of_arms?.local_path || e.properties.coat_of_arms?.url) &&
            new Set(answerEntities.filter(e => e.properties.coat_of_arms?.local_path || e.properties.coat_of_arms?.url).map(subdivisionLabel)).size >= 4;
        if (type === "map" || type === "outline") return entities.some(hasGeometry) &&
            new Set(answerEntities.filter(hasGeometry).map(subdivisionLabel)).size >= 4;
        return false;
    }
    if (type === "capital") return new Set(entities.filter(e => e.properties.capitals?.[0]?.name).map(e => e.properties.capitals[0].name)).size >= 4;
    if (type === "flag") return entities.filter(e => e.properties.flag?.url_svg).length >= 4;
    if (type === "coat_of_arms") return entities.filter(e => e.properties.coat_of_arms?.local_path).length >= 4;
    if (type === "population") return entities.filter(e => Number.isFinite(e.properties.population)).length >= 4;
    if (type === "area") return entities.filter(e => Number.isFinite(e.properties.area?.kilometers)).length >= 4;
    if (type === "highest_point_name") return entities.filter(e => e.properties.highest_point?.name).length >= 4;
    if (type === "highest_point") return entities.filter(e => Number.isFinite(e.properties.highest_point?.elevation_m)).length >= 4;
    if (type === "map" || type === "outline") return entities.filter(hasGeometry).length >= 4;
    return false;
}

function questionVariants(type, entity, mode) {
    const properties = entity.properties;
    if (mode === "subdivisions") {
        if (type === "capital" && properties.capital) return ["forward", "reverse"];
        if (type === "population" && Number.isFinite(properties.population)) return ["forward", "reverse"];
        if (type === "parent_country" && properties.country?.name) return ["forward", "reverse"];
        if (type === "flag" && (properties.flag?.local_path || properties.flag?.url)) return ["standard"];
        if (type === "coat_of_arms" && (properties.coat_of_arms?.local_path || properties.coat_of_arms?.url)) return ["standard"];
        if ((type === "map" || type === "outline") && hasGeometry(entity)) return ["standard"];
        return [];
    }
    if (type === "capital" && properties.capitals?.[0]?.name) return ["forward", "reverse"];
    if (type === "flag" && properties.flag?.url_svg) return ["standard"];
    if (type === "coat_of_arms" && properties.coat_of_arms?.local_path) return ["standard"];
    if (type === "population" && Number.isFinite(properties.population)) return ["standard"];
    if (type === "area" && Number.isFinite(properties.area?.kilometers)) return ["standard"];
    if (type === "highest_point_name" && properties.highest_point?.name) return ["standard"];
    if (type === "highest_point" && Number.isFinite(properties.highest_point?.elevation_m)) return ["standard"];
    if ((type === "map" || type === "outline") && hasGeometry(entity)) return ["standard"];
    return [];
}

function buildQuestionDecks(entities, questionTypes, mode) {
    return new Map(questionTypes.map(type => [
        type,
        shuffle(entities.flatMap(entity =>
            questionVariants(type, entity, mode).map(variant => ({ type, entity, variant }))
        )),
    ]));
}

function clearMap() {
    document.getElementById("map_svg").replaceChildren();
    document.getElementById("map_question").classList.add("hidden");
}

function showQuestion(text, options, correctAnswer, imageUrl = null, imageAlt = "") {
    clearMap();
    const element = document.getElementById("question");
    element.textContent = text;
    if (imageUrl) {
        const image = document.createElement("img");
        image.src = imageUrl;
        image.alt = imageAlt;
        image.width = 220;
        element.append(document.createElement("br"), image);
    }
    gameState.correctAnswer = correctAnswer;
    optionButtons.forEach((button, index) => {
        button.textContent = options[index] ?? "";
        button.disabled = false;
        button.classList.remove("answer--correct", "answer--incorrect");
    });
    nextQuestionButton.classList.add("hidden");
}

function unwrapRing(coordinates) {
    let previousLongitude = coordinates[0][0];
    return coordinates.map(([longitude, latitude], index) => {
        if (index > 0) {
            while (longitude - previousLongitude > 180) longitude -= 360;
            while (longitude - previousLongitude < -180) longitude += 360;
        }
        previousLongitude = longitude;
        return [longitude, latitude];
    });
}

function project([longitude, latitude]) {
    return [(longitude + 180) * (960 / 360), (90 - latitude) * (480 / 180)];
}

function getFeatureRings(feature, referenceLongitude = null) {
    const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
    return polygons.flatMap(polygon => polygon.map(ring => {
        const unwrapped = unwrapRing(ring);
        if (!Number.isFinite(referenceLongitude)) return unwrapped;
        const averageLongitude = unwrapped.reduce((sum, point) => sum + point[0], 0) / unwrapped.length;
        const longitudeShift = Math.round((referenceLongitude - averageLongitude) / 360) * 360;
        return unwrapped.map(([longitude, latitude]) => [longitude + longitudeShift, latitude]);
    }));
}

function createPath(feature, referenceLongitude = null) {
    const ringPath = coordinates => coordinates.map((point, index) => {
        const [x, y] = project(point);
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    }).join(" ") + " Z";
    return getFeatureRings(feature, referenceLongitude).map(ringPath).join(" ");
}

function featuresBounds(features, referenceLongitude = null) {
    const points = features.flatMap(feature => getFeatureRings(feature, referenceLongitude).flatMap(ring => ring.map(project)));
    return points.reduce((bounds, [x, y]) => ({
        minX: Math.min(bounds.minX, x),
        maxX: Math.max(bounds.maxX, x),
        minY: Math.min(bounds.minY, y),
        maxY: Math.max(bounds.maxY, y),
    }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

function circularMeanLongitude(features) {
    const longitudes = features
        .map(feature => feature.properties.center?.lng)
        .filter(Number.isFinite);
    if (longitudes.length === 0) return null;
    const sum = longitudes.reduce((result, longitude) => ({
        x: result.x + Math.cos(longitude * Math.PI / 180),
        y: result.y + Math.sin(longitude * Math.PI / 180),
    }), { x: 0, y: 0 });
    return Math.atan2(sum.y, sum.x) * 180 / Math.PI;
}

function distanceBetweenCenters(first, second) {
    if (!first || !second) return Infinity;
    const radians = Math.PI / 180;
    const latitudeDifference = (second.lat - first.lat) * radians;
    const longitudeDifference = (second.lng - first.lng) * radians;
    const firstLatitude = first.lat * radians;
    const secondLatitude = second.lat * radians;
    const haversine = Math.sin(latitudeDifference / 2) ** 2 +
        Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDifference / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function geographicClusters(features, maximumDistanceKm = 1400) {
    const remaining = new Set(features);
    const clusters = [];
    while (remaining.size > 0) {
        const first = remaining.values().next().value;
        const cluster = [];
        const queue = [first];
        remaining.delete(first);
        while (queue.length > 0) {
            const current = queue.pop();
            cluster.push(current);
            for (const candidate of [...remaining]) {
                if (distanceBetweenCenters(current.properties.center, candidate.properties.center) <= maximumDistanceKm) {
                    remaining.delete(candidate);
                    queue.push(candidate);
                }
            }
        }
        clusters.push(cluster);
    }
    return clusters.sort((first, second) => second.length - first.length);
}

function sameSubdivision(first, second) {
    return first.id === second.id ||
        first.properties.codes?.adm1 === second.properties.codes?.adm1;
}

function renderMap(targetEntity, outlineOnly) {
    const subdivisionMode = gameState.mode === "subdivisions";
    const topology = subdivisionMode ? subdivisionTopology : countryTopology;
    const object = subdivisionMode ? topology.objects.subdivisions : topology.objects.countries;
    const collection = topojson.feature(topology, object);
    const target = topojson.feature(topology, targetEntity);
    let backgroundFeatures = collection.features;
    let boundsFeatures = [target];
    let mainlandSubdivision = false;
    if (subdivisionMode) {
        const countryFeatures = collection.features.filter(feature =>
            feature.properties.country?.name === targetEntity.properties.country.name
        );
        const parentCountry = countryTopology.objects.countries.geometries.find(country =>
            country.properties.codes?.alpha_2 === targetEntity.properties.country.alpha_2 ||
            country.properties.names?.common === targetEntity.properties.country.name
        );
        const countryArea = parentCountry?.properties.area?.kilometers ?? 0;
        const clusterDistance = countryArea >= 2_000_000 ? 1400 : 800;
        const clusters = geographicClusters(countryFeatures, clusterDistance);
        const targetCluster = clusters.find(cluster => cluster.some(feature => sameSubdivision(feature, target))) ?? [target];
        const hasClearMainland = clusters[0].length > 1 && clusters[0].length / countryFeatures.length >= 0.8;
        mainlandSubdivision = hasClearMainland && targetCluster === clusters[0];
        backgroundFeatures = targetCluster;
        if (mainlandSubdivision && !outlineOnly) boundsFeatures = targetCluster;
    }
    const referenceLongitude = subdivisionMode ? circularMeanLongitude(boundsFeatures) : null;
    const bounds = featuresBounds(boundsFeatures, referenceLongitude);
    const width = Math.max(bounds.maxX - bounds.minX, 0.05);
    const height = Math.max(bounds.maxY - bounds.minY, 0.05);
    const fittedScale = Math.min(960 / (width * 1.35), 480 / (height * 1.35));
    const scale = subdivisionMode && mainlandSubdivision && !outlineOnly
        ? fittedScale
        : Math.min(subdivisionMode ? 80 : 14, fittedScale);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const namespace = "http://www.w3.org/2000/svg";
    const group = document.createElementNS(namespace, "g");
    group.setAttribute("transform", `translate(480 240) scale(${scale}) translate(${-centerX} ${-centerY})`);
    if (!outlineOnly) {
        backgroundFeatures.forEach(feature => {
            const path = document.createElementNS(namespace, "path");
            path.setAttribute("d", createPath(feature, referenceLongitude));
            path.setAttribute("class", "map-country");
            group.append(path);
        });
    }
    const targetPath = document.createElementNS(namespace, "path");
    targetPath.setAttribute("d", createPath(target, referenceLongitude));
    targetPath.setAttribute("class", outlineOnly ? "map-country map-country--outline" : "map-country map-country--target");
    group.append(targetPath);
    document.getElementById("map_svg").replaceChildren(group);
    document.getElementById("map_question").classList.remove("hidden");
}

function giveQuestion() {
    if (gameState.currentQuestion >= gameState.totalQuestions) {
        finishGame();
        return;
    }
    gameState.currentQuestion++;
    updateGameHud();
    let availableTypes = gameState.questionTypes.filter(type => gameState.questionDecks.get(type)?.length > 0);
    if (availableTypes.length === 0) {
        gameState.questionDecks = buildQuestionDecks(gameState.entities, gameState.questionTypes, gameState.mode);
        availableTypes = gameState.questionTypes.filter(type => gameState.questionDecks.get(type)?.length > 0);
    }
    const type = randomElem(availableTypes);
    const question = gameState.questionDecks.get(type).pop();
    if (gameState.mode === "subdivisions") giveSubdivisionQuestion(question, gameState.answerEntities);
    else giveCountryQuestion(question, gameState.answerEntities);
}

function giveCountryQuestion(question, countries) {
    const { type, entity: country, variant } = question;
    if (type === "capital") {
        const candidates = countries.filter(country => country.properties.capitals?.[0]?.name);
        const capital = country.properties.capitals[0].name;
        if (variant === "forward") {
            showQuestion(`Mi ${countryName(country)} fővárosa?`, getOptions(capital, candidates.map(c => c.properties.capitals[0].name)), capital);
        } else {
            const answer = countryName(country);
            showQuestion(`Melyik ország fővárosa ${capital}?`, similarNamedOptions(country, candidates, countryName, c => c.properties.area?.kilometers ?? 0), answer);
        }
        return;
    }
    if (type === "flag" || type === "coat_of_arms") {
        const candidates = type === "flag"
            ? countries.filter(country => country.properties.flag?.url_svg)
            : countries.filter(country => country.properties.coat_of_arms?.local_path);
        const answer = countryName(country);
        const imagePath = type === "flag"
            ? country.properties.flag_local_path ?? country.properties.flag.url_svg
            : country.properties.coat_of_arms.local_path;
        showQuestion(type === "flag" ? "Melyik ország zászlaja látható?" : "Melyik ország címere látható?", getOptions(answer, candidates.map(countryName)), answer, imagePath, "Ismeretlen ország jelképe");
        return;
    }
    if (type === "population" || type === "area") {
        const getter = type === "population" ? c => c.properties.population : c => c.properties.area?.kilometers;
        const candidates = countries.filter(country => Number.isFinite(getter(country)));
        const answer = countryName(country);
        const value = new Intl.NumberFormat("hu-HU").format(getter(country));
        showQuestion(`Melyik ország ${type === "population" ? "népessége" : "területe"} ${value} ${type === "population" ? "fő" : "km²"}?`, similarNamedOptions(country, candidates, countryName, getter), answer);
        return;
    }
    if (type === "map" || type === "outline") {
        const candidates = countries.filter(hasGeometry);
        const answer = countryName(country);
        showQuestion(type === "map" ? "Melyik ország látható kiemelve a térképen?" : "Melyik ország körvonala látható?", similarNamedOptions(country, candidates, countryName, c => c.properties.area?.kilometers ?? 0), answer);
        renderMap(country, type === "outline");
        return;
    }
    const candidates = countries.filter(country => country.properties.highest_point?.name);
    const answer = countryName(country);
    const getter = c => c.properties.highest_point.elevation_m;
    if (type === "highest_point_name") {
        showQuestion(`Melyik ország legmagasabb pontja ${country.properties.highest_point.name}?`, similarNamedOptions(country, candidates, countryName, getter), answer);
    } else {
        showQuestion(`Melyik ország legmagasabb pontja ${new Intl.NumberFormat("hu-HU").format(getter(country))} méter?`, similarNamedOptions(country, candidates, countryName, getter), answer);
    }
}

function giveSubdivisionQuestion(question, answerSubdivisions) {
    const { type, entity: subdivision, variant } = question;
    if (type === "parent_country") {
        const answerCandidates = answerSubdivisions.filter(subdivision => subdivision.properties.country?.name);
        const country = subdivision.properties.country.name;
        if (variant === "forward") {
            showQuestion(`Melyik országhoz tartozik ${subdivisionName(subdivision)}?`, getOptions(country, answerCandidates.map(item => item.properties.country.name)), country);
        } else {
            const distractors = answerCandidates.filter(item => item.properties.country.name !== country).map(subdivisionName);
            const answer = subdivisionName(subdivision);
            showQuestion(`Melyik közigazgatási egység tartozik ehhez az országhoz: ${country}?`, getOptions(answer, distractors), answer);
        }
        return;
    }
    if (type === "capital") {
        const answerCandidates = answerSubdivisions.filter(subdivision => subdivision.properties.capital);
        const capital = subdivision.properties.capital;
        if (variant === "forward") {
            showQuestion(`Mi ${subdivisionLabel(subdivision)} fővárosa vagy közigazgatási központja?`, getOptions(capital, answerCandidates.map(item => item.properties.capital)), capital);
        } else {
            const answer = subdivisionLabel(subdivision);
            showQuestion(`Melyik közigazgatási egység központja ${capital}?`, getOptions(answer, answerCandidates.map(subdivisionLabel)), answer);
        }
        return;
    }
    if (type === "population") {
        const answerCandidates = answerSubdivisions.filter(subdivision => Number.isFinite(subdivision.properties.population));
        const population = subdivision.properties.population;
        if (variant === "forward") {
            const answer = subdivisionLabel(subdivision);
            showQuestion(`Melyik közigazgatási egység népessége ${new Intl.NumberFormat("hu-HU").format(population)} fő?`, similarNamedOptions(subdivision, answerCandidates, subdivisionLabel, item => item.properties.population), answer);
        } else {
            const answer = new Intl.NumberFormat("hu-HU").format(population);
            showQuestion(`Mennyi ${subdivisionLabel(subdivision)} népessége?`, numericOptions(subdivision, answerCandidates, item => item.properties.population), answer);
        }
        return;
    }
    if (type === "flag" || type === "coat_of_arms") {
        const property = type === "flag" ? "flag" : "coat_of_arms";
        const answerCandidates = answerSubdivisions.filter(subdivision =>
            subdivision.properties[property]?.local_path || subdivision.properties[property]?.url
        );
        const answer = subdivisionLabel(subdivision);
        const imagePath = subdivision.properties[property].local_path ?? subdivision.properties[property].url;
        showQuestion(type === "flag" ? "Melyik közigazgatási egység zászlaja látható?" : "Melyik közigazgatási egység címere látható?", getOptions(answer, answerCandidates.map(subdivisionLabel)), answer, imagePath, "Ismeretlen közigazgatási egység jelképe");
        return;
    }
    if (type === "map" || type === "outline") {
        const answerCandidates = answerSubdivisions.filter(hasGeometry);
        const answer = subdivisionLabel(subdivision);
        showQuestion(type === "map" ? "Melyik közigazgatási egység látható kiemelve a térképen?" : "Melyik közigazgatási egység körvonala látható?", getOptions(answer, answerCandidates.map(subdivisionLabel)), answer);
        renderMap(subdivision, type === "outline");
    }
}

optionButtons.forEach(button => button.addEventListener("click", () => {
    if (!gameState || button.disabled) return;
    const isCorrect = button.textContent === gameState.correctAnswer;
    if (isCorrect) gameState.points++;
    updateGameHud();
    optionButtons.forEach(option => {
        option.disabled = true;
        if (option.textContent === gameState.correctAnswer) option.classList.add("answer--correct");
    });
    if (!isCorrect) button.classList.add("answer--incorrect");
    button.blur();
    nextQuestionButton.classList.remove("hidden");
}));

nextQuestionButton.addEventListener("click", () => {
    nextQuestionButton.blur();
    giveQuestion();
});

main().catch(error => {
    console.error(error);
    document.getElementById("game_setup_btn").disabled = true;
});

if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
        try {
            const registration = await navigator.serviceWorker.register("./service-worker.js");
            console.log("Service worker registered:", registration.scope);
        } catch (error) {
            console.error("Service worker registration failed:", error);
        }
    });
}
