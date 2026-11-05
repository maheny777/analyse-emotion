// Analyse d'émotion par image : tout s'exécute dans le navigateur (aucun serveur Python).
// Pipeline : image -> prétraitement (canvas) -> classification (transformers.js, ONNX)
//            -> interprétation (fichier Excel de référence) -> interface.
import { pipeline, env } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

env.allowLocalModels = false;           // le modèle vient du Hub Hugging Face
try { env.backends.onnx.wasm.numThreads = 1; } catch (_) { /* sans importance */ }

const MODEL = "Xenova/facial_emotions_image_detection";
const MAX_SIDE = 1024;
const LOW_CONFIDENCE = 0.40;
const EMOTIONS = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let classifier = null;
let reference = { emotions: {}, fer: [], sources: [], origin: "aucune" };
let lastBatch = [];

/* ------------------------------------------------------------------ */
/* Données de référence (Excel, avec JSON de secours)                  */
/* ------------------------------------------------------------------ */
async function loadReference() {
  try {
    if (typeof XLSX === "undefined") throw new Error("SheetJS indisponible");
    const res = await fetch("data/emotions_reference.xlsx");
    if (!res.ok) throw new Error("HTTP " + res.status);
    const wb = XLSX.read(await res.arrayBuffer(), { type: "array" });
    const rows = XLSX.utils.sheet_to_json(wb.Sheets["emotions_base"]);
    if (rows.length < EMOTIONS.length) throw new Error("feuille emotions_base incomplète");
    const emotions = {};
    for (const r of rows) {
      emotions[String(r.emotion).toLowerCase()] = {
        label_fr: r.label_fr, valence: r.valence, description: r.description,
        comportement: r.comportement_associe, profil: r.profil_expression,
      };
    }
    const fer = XLSX.utils.sheet_to_json(wb.Sheets["fer2013_stats"])
      .filter((r) => EMOTIONS.includes(r.classe))
      .map((r) => ({ classe: r.classe, train: r.train, test: r.test, total: r.train + r.test }));
    const sources = XLSX.utils.sheet_to_json(wb.Sheets["sources"]);
    return { emotions, fer, sources, origin: "Excel (data/emotions_reference.xlsx)" };
  } catch (err) {
    console.warn("Lecture Excel impossible, utilisation du JSON de secours :", err);
    try {
      const res = await fetch("data/emotions_reference.json");
      const j = await res.json();
      return { ...j, origin: "JSON de secours (data/emotions_reference.json)" };
    } catch (err2) {
      console.error(err2);
      return { emotions: {}, fer: [], sources: [], origin: "aucune (données non chargées)" };
    }
  }
}

function info(label) {
  return reference.emotions[String(label).toLowerCase()] || {
    label_fr: label, valence: "inconnue", description: "",
    comportement: "Non documenté.", profil: "Non documenté.",
  };
}

/* ------------------------------------------------------------------ */
/* Modèle                                                              */
/* ------------------------------------------------------------------ */
function setStatus(kind, text, pct) {
  const box = $("status");
  box.className = "status " + kind;
  $("status-text").textContent = text;
  if (typeof pct === "number") $("progress-bar").style.width = Math.round(pct) + "%";
  $("retry").hidden = kind !== "error";
}

function enableInputs(on) {
  $("file-single").disabled = !on;
  $("file-batch").disabled = !on;
}

async function loadModel() {
  enableInputs(false);
  setStatus("loading", "Chargement du modèle (environ 90 Mo, une seule fois)…", 0);
  const files = {};
  try {
    classifier = await pipeline("image-classification", MODEL, {
      progress_callback: (p) => {
        if (p.status === "progress" && p.file && p.total) {
          files[p.file] = { loaded: p.loaded, total: p.total };
          let l = 0, t = 0;
          for (const f of Object.values(files)) { l += f.loaded; t += f.total; }
          setStatus("loading", `Téléchargement du modèle… ${Math.round((l / t) * 100)} %`, (l / t) * 100);
        }
      },
    });
    setStatus("ready", "✅ Modèle prêt. Choisissez une image.", 100);
    enableInputs(true);
  } catch (err) {
    console.error(err);
    setStatus("error", "⚠️ Le modèle n'a pas pu être chargé (connexion ?). Détail : " + (err.message || err), 0);
  }
}

/* ------------------------------------------------------------------ */
/* Pipeline d'analyse                                                  */
/* ------------------------------------------------------------------ */
async function prepare(file) {
  // Prétraitement : décodage (EXIF respecté), réduction à MAX_SIDE, JPEG.
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale));
  canvas.height = Math.max(1, Math.round(bmp.height * scale));
  canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
  if (bmp.close) bmp.close();
  const blob = await new Promise((ok, ko) =>
    canvas.toBlob((b) => (b ? ok(b) : ko(new Error("Image illisible"))), "image/jpeg", 0.92));
  return URL.createObjectURL(blob);
}

async function analyze(file) {
  const url = await prepare(file);
  try {
    const raw = await classifier(url, { topk: EMOTIONS.length });
    const scores = {};
    for (const r of raw) scores[String(r.label).toLowerCase()] = r.score;
    const top = Object.keys(scores).reduce((a, b) => (scores[a] >= scores[b] ? a : b));
    return { name: file.name, url, scores, top, confidence: scores[top],
             info: info(top), reliable: scores[top] >= LOW_CONFIDENCE };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Affichage                                                           */
/* ------------------------------------------------------------------ */
function renderScores(res) {
  const sorted = Object.entries(res.scores).sort((a, b) => b[1] - a[1]);
  $("scores-single").innerHTML = sorted.map(([k, v], i) => `
    <div class="score-row ${i === 0 ? "top" : ""}">
      <span class="score-name">${esc(info(k).label_fr)}</span>
      <span class="score-bar"><span class="score-fill" style="width:${(v * 100).toFixed(1)}%"></span></span>
      <span class="score-val">${(v * 100).toFixed(1)} %</span>
    </div>`).join("");
}

function renderReport(res) {
  const i = res.info;
  return `
    <h3>Émotion dominante : ${esc(i.label_fr)} (${(res.confidence * 100).toFixed(1)} %)</h3>
    <ul>
      <li><strong>Valence :</strong> ${esc(i.valence)}</li>
      <li><strong>Indices visuels typiques :</strong> ${esc(i.description)}</li>
      <li><strong>Comportement associé :</strong> ${esc(i.comportement)}</li>
    </ul>
    ${res.reliable ? "" : '<p class="warn">⚠️ Confiance faible : résultat à interpréter avec prudence.</p>'}
    <p class="muted">Le modèle lit l'expression faciale visible, pas l'état intérieur de la personne.</p>`;
}

async function onSingle(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  $("report-single").textContent = "Analyse en cours…";
  $("scores-single").innerHTML = "";
  try {
    const res = await analyze(file);
    const img = $("preview-single");
    img.src = res.url; img.hidden = false;
    renderScores(res);
    $("report-single").innerHTML = renderReport(res);
  } catch (err) {
    console.error(err);
    $("report-single").innerHTML = `<p class="warn">⚠️ Erreur pendant l'analyse : ${esc(err.message || err)}</p>`;
  }
}

function aggregate(results) {
  const totals = {};
  for (const r of results) for (const [k, v] of Object.entries(r.scores)) totals[k] = (totals[k] || 0) + v;
  const rows = Object.entries(totals).map(([k, v]) => ({ k, mean: v / results.length }))
    .sort((a, b) => b.mean - a.mean);
  return rows;
}

async function onBatch(ev) {
  const files = [...ev.target.files];
  if (!files.length) return;
  lastBatch = [];
  $("export-batch").hidden = true;
  $("report-batch").innerHTML = "";
  $("batch-table-wrap").innerHTML = "";
  const errors = [];
  for (let i = 0; i < files.length; i++) {
    $("batch-progress").textContent = `Analyse ${i + 1} / ${files.length} : ${files[i].name}`;
    try { lastBatch.push(await analyze(files[i])); }
    catch (err) { errors.push(`${files[i].name} : ${err.message || err}`); }
  }
  $("batch-progress").textContent = `Terminé : ${lastBatch.length} image(s) analysée(s).`;
  if (errors.length) $("batch-progress").textContent += " Échecs : " + errors.join(" ; ");
  if (!lastBatch.length) return;

  $("batch-table-wrap").innerHTML = `<table><thead><tr><th>Fichier</th><th>Émotion</th><th>Confiance</th></tr></thead><tbody>${
    lastBatch.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.info.label_fr)}</td><td>${(r.confidence * 100).toFixed(1)} %</td></tr>`).join("")
  }</tbody></table>`;

  const agg = aggregate(lastBatch);
  const dom = info(agg[0].k);
  $("report-batch").innerHTML = `
    <h3>Profil d'expressions dominant : ${esc(dom.label_fr)}</h3>
    <p>${esc(dom.profil)}</p>
    <ul>
      <li>Images analysées : ${lastBatch.length}</li>
      <li>Comportement associé : ${esc(dom.comportement)}</li>
    </ul>
    <p class="warn">⚠️ Il s'agit d'un <strong>profil d'expressions</strong> observé sur ces images,
    et non d'un diagnostic de personnalité ou de caractère.</p>`;
  $("export-batch").hidden = false;
}

function exportBatch() {
  if (!lastBatch.length) return;
  const detail = lastBatch.map((r) => ({
    fichier: r.name, emotion: r.info.label_fr,
    "confiance_%": +(r.confidence * 100).toFixed(1),
  }));
  const profil = aggregate(lastBatch).map((r) => ({
    emotion: info(r.k).label_fr, "score_moyen_%": +(r.mean * 100).toFixed(1),
  }));
  if (typeof XLSX !== "undefined") {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "detail");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(profil), "profil");
    XLSX.writeFile(wb, "resultats_emotions.xlsx");
  } else {                                           // repli CSV
    const csv = "fichier;emotion;confiance_%\n" +
      detail.map((d) => `${d.fichier};${d.emotion};${d["confiance_%"]}`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "resultats_emotions.csv";
    a.click();
  }
}

function tableHTML(cols, rows) {
  const head = cols.map((c) => `<th>${esc(c.label)}</th>`).join("");
  const body = rows.map((r) => "<tr>" + cols.map((c) => {
    const v = r[c.key];
    if (c.link && /^https?:\/\//.test(v || "")) {
      return `<td><a href="${esc(v)}" target="_blank" rel="noopener">${esc(v)}</a></td>`;
    }
    return `<td>${esc(v)}</td>`;
  }).join("") + "</tr>").join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderData() {
  $("data-origin").textContent = "Source des données affichées : " + reference.origin;
  const emo = Object.entries(reference.emotions).map(([k, v]) => ({ emotion: k, ...v }));
  $("table-emotions").innerHTML = tableHTML([
    { key: "emotion", label: "Émotion" }, { key: "label_fr", label: "Libellé" },
    { key: "valence", label: "Valence" }, { key: "description", label: "Indices visuels" },
    { key: "comportement", label: "Comportement associé" },
  ], emo);
  $("table-fer").innerHTML = tableHTML([
    { key: "classe", label: "Classe" }, { key: "train", label: "Train" },
    { key: "test", label: "Test" }, { key: "total", label: "Total" },
  ], reference.fer);
  $("table-sources").innerHTML = tableHTML([
    { key: "reference", label: "Référence" }, { key: "usage", label: "Usage" },
    { key: "lien", label: "Lien", link: true },
  ], reference.sources);
}

function initTabs() {
  document.querySelectorAll(".tab").forEach((btn) => btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".panel").forEach((p) =>
      p.classList.toggle("active", p.id === "tab-" + btn.dataset.tab));
  }));
}

/* ------------------------------------------------------------------ */
/* Démarrage                                                           */
/* ------------------------------------------------------------------ */
initTabs();
$("file-single").addEventListener("change", onSingle);
$("file-batch").addEventListener("change", onBatch);
$("export-batch").addEventListener("click", exportBatch);
$("retry").addEventListener("click", loadModel);

reference = await loadReference();
renderData();
await loadModel();
