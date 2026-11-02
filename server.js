const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, "profiles.json");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ---- JSON-file database ----
function readProfiles() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    return [];
  }
}
function writeProfiles(list) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(list, null, 2));
}

// ---- String helpers ----
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function titleCase(str) {
  return str
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function initials(name) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

function colorFor(name) {
  const hash = crypto.createHash("md5").update(name).digest();
  const hue = (hash[0] * 360) / 255;
  return `hsl(${Math.round(hue)}, 65%, 50%)`;
}

function normalizeUrl(link) {
  const l = link.trim();
  if (!l) return null;
  const withProto = /^https?:\/\//i.test(l) ? l : "https://" + l;
  try {
    const u = new URL(withProto);
    if (!["http:", "https:"].includes(u.protocol)) return null;
    return u.href;
  } catch {
    return null;
  }
}

// ---- Server-side processing ----
function processForm(body) {
  const name = titleCase((body.name || "").trim());
  const bio = (body.bio || "").trim();
  const skills = [
    ...new Set(
      (body.skills || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.slice(0, 30))
    ),
  ].slice(0, 12);
  const links = (body.links || "")
    .split(/[\n,]+/)
    .map(normalizeUrl)
    .filter(Boolean)
    .slice(0, 5);
  return { name, bio, skills, links };
}

// ---- Dynamic HTML card ----
function renderCard(p) {
  const skills = p.skills
    .map((s) => `<span class="skill">${escapeHtml(s)}</span>`)
    .join("");
  const links = p.links
    .map((l) => {
      const host = new URL(l).hostname.replace(/^www\./, "");
      return `<a href="${escapeHtml(l)}" target="_blank" rel="noopener noreferrer">${escapeHtml(host)}</a>`;
    })
    .join("");
  return `
<article class="card">
  <div class="avatar" style="background:${p.color}">${escapeHtml(p.initials)}</div>
  <h2>${escapeHtml(p.name)}</h2>
  <p class="bio">${escapeHtml(p.bio)}</p>
  ${skills ? `<div class="skills">${skills}</div>` : ""}
  ${links ? `<div class="links">${links}</div>` : ""}
</article>`;
}

// ---- Routes ----

// Create profile: process form, store in DB, return HTML card
app.post("/profiles", (req, res) => {
  const data = processForm(req.body);

  if (!data.name || !data.bio) {
    return res.status(400).send('<p class="error">Name and bio are required.</p>');
  }
  if (data.name.length > 60 || data.bio.length > 300) {
    return res.status(400).send('<p class="error">Name or bio is too long.</p>');
  }

  const profile = {
    id: crypto.randomUUID(),
    ...data,
    initials: initials(data.name),
    color: colorFor(data.name),
    createdAt: new Date().toISOString(),
  };

  const all = readProfiles();
  all.push(profile);
  writeProfiles(all);

  res.status(201).send(renderCard(profile));
});

// List stored profiles as HTML cards (newest first)
app.get("/profiles", (req, res) => {
  const cards = readProfiles()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(renderCard)
    .join("");
  res.send(cards);
});

// JSON view of the stored records
app.get("/api/profiles", (req, res) => {
  res.json(readProfiles());
});

app.listen(PORT, () => {
  console.log(`Profile Card app running on port ${PORT}`);
});
