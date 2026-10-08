import crypto from "node:crypto";
import fs from "node:fs/promises";

const dataPath = "data/subdivisions.json";
const topology = JSON.parse(await fs.readFile(dataPath, "utf8"));
const geometries = topology.objects.subdivisions.geometries;

const symbolTypes = [
    { property: "coat_of_arms", directory: "assets/subdivision-coats-of-arms" },
    { property: "flag", directory: "assets/subdivision-flags" },
];

for (const type of symbolTypes) await fs.mkdir(type.directory, { recursive: true });

const jobs = [];
for (const type of symbolTypes) {
    const byUrl = new Map();
    for (const geometry of geometries) {
        const symbol = geometry.properties[type.property];
        if (!symbol?.url) continue;
        if (!byUrl.has(symbol.url)) byUrl.set(symbol.url, []);
        byUrl.get(symbol.url).push(symbol);
    }
    for (const [url, symbols] of byUrl) jobs.push({ ...type, url, symbols });
}

function fileNameFromCommonsUrl(url) {
    return decodeURIComponent(new URL(url).pathname.split("/Special:FilePath/").pop());
}

function wikimediaUrls(url) {
    const fileName = fileNameFromCommonsUrl(url).replaceAll(" ", "_");
    const encodedName = encodeURIComponent(fileName).replaceAll("%2F", "/");
    const hash = crypto.createHash("md5").update(fileName).digest("hex");
    const original = `https://upload.wikimedia.org/wikipedia/commons/${hash[0]}/${hash.slice(0, 2)}/${encodedName}`;
    const isSvg = fileName.toLowerCase().endsWith(".svg");
    const thumbnailName = `330px-${encodedName}${isSvg ? ".png" : ""}`;
    const thumbnail = `https://upload.wikimedia.org/wikipedia/commons/thumb/${hash[0]}/${hash.slice(0, 2)}/${encodedName}/${thumbnailName}`;
    return [thumbnail, original];
}

for (const job of jobs) {
    job.downloadUrls = wikimediaUrls(job.url);
}

async function findExistingPath(job) {
    const hash = crypto.createHash("sha1").update(job.url).digest("hex").slice(0, 20);
    const candidates = await Promise.all(
        ["png", "jpg", "webp", "gif", "svg"].map(async extension => {
            const candidate = `${job.directory}/${hash}.${extension}`;
            try { await fs.access(candidate); return candidate; } catch { return null; }
        })
    );
    return candidates.find(Boolean) ?? null;
}

for (const job of jobs) {
    job.existingPath = await findExistingPath(job);
    if (job.existingPath) job.symbols.forEach(symbol => symbol.local_path = job.existingPath);
}
await fs.writeFile(dataPath, `${JSON.stringify(topology)}\n`, "utf8");

if (process.argv.includes("--existing-only")) {
    console.log(`Mapped ${jobs.filter(job => job.existingPath).length} existing symbols.`);
    process.exit(0);
}

function extensionFor(contentType, finalUrl) {
    if (contentType.includes("svg")) return "svg";
    if (contentType.includes("jpeg") || contentType.includes("jpg")) return "jpg";
    if (contentType.includes("webp")) return "webp";
    if (contentType.includes("gif")) return "gif";
    if (contentType.includes("png")) return "png";
    const extension = new URL(finalUrl).pathname.split(".").pop().toLowerCase();
    return ["svg", "png", "jpg", "jpeg", "webp", "gif"].includes(extension) ? extension : "png";
}

let completed = 0;
let failed = 0;
let lastCheckpoint = 0;

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function fetchWithBackoff(url) {
    for (let attempt = 0; attempt < 8; attempt++) {
        const response = await fetch(url, {
            headers: { "User-Agent": "FoldrajzJatek/1.0 (educational geography game)" },
        });
        if (response.status !== 429) return response;

        const retryAfterHeader = response.headers.get("retry-after");
        const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : Number.NaN;
        const delay = Number.isFinite(retryAfter)
            ? Math.min(retryAfter * 1000, 900_000)
            : Math.min(5_000 * 2 ** attempt, 120_000);
        console.log(`Wikimedia rate limit; retrying in ${Math.round(delay / 1000)} s.`);
        await wait(delay);
    }
    throw new Error("429 after retries");
}

async function checkpoint(force = false) {
    if (!force && completed - lastCheckpoint < 50) return;
    await fs.writeFile(dataPath, `${JSON.stringify(topology)}\n`, "utf8");
    lastCheckpoint = completed;
}

async function download(job) {
    const hash = crypto.createHash("sha1").update(job.url).digest("hex").slice(0, 20);
    let localPath = job.existingPath;
    if (!localPath) {
        for (const downloadUrl of job.downloadUrls) {
            try {
                const response = await fetchWithBackoff(downloadUrl);
                if (!response.ok) throw new Error(String(response.status));
                const extension = extensionFor(response.headers.get("content-type") ?? "", response.url);
                localPath = `${job.directory}/${hash}.${extension}`;
                await fs.writeFile(localPath, Buffer.from(await response.arrayBuffer()));
                break;
            } catch (error) {
                if (downloadUrl === job.downloadUrls.at(-1)) console.warn(`Failed: ${job.url} (${error.message})`);
            }
        }
    }

    if (localPath) job.symbols.forEach(symbol => symbol.local_path = localPath);
    else failed++;
    completed++;
    await checkpoint();
    if (completed % 100 === 0 || completed === jobs.length) console.log(`Symbols: ${completed}/${jobs.length}, failed: ${failed}`);
    await wait(1000);
}

let nextJob = 0;
async function worker() {
    while (nextJob < jobs.length) {
        const index = nextJob++;
        await download(jobs[index]);
    }
}

await worker();
await checkpoint(true);
console.log(JSON.stringify({ jobs: jobs.length, completed, failed }));
