"""Construit la base de données du projet (Excel + copie JSON de secours).

Sources publiques : Ekman (1992) et jeu de données FER-2013 (Goodfellow et al., 2013).
Usage :  python tools/build_data.py
"""
from pathlib import Path

import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

ROOT = Path(__file__).resolve().parent.parent
DATA_FILE = ROOT / "data" / "emotions_reference.xlsx"

EMOTIONS = [
    ("angry", "Colère", "négative",
     "Sourcils abaissés et rapprochés, regard fixe, mâchoire serrée.",
     "Tension et irritation ; réaction possible de confrontation ou de défense.",
     "Expressions de tension fréquentes dans ces images (contexte de frustration ou d'exigence)."),
    ("disgust", "Dégoût", "négative",
     "Nez plissé, lèvre supérieure relevée.",
     "Rejet ou aversion envers un stimulus ; tendance à l'évitement.",
     "Expressions de rejet dominantes dans ces images."),
    ("fear", "Peur", "négative",
     "Yeux écarquillés, sourcils relevés, bouche tendue.",
     "Vigilance accrue ; tendance à la prudence ou à la fuite.",
     "Expressions d'inquiétude ou de vigilance dominantes dans ces images."),
    ("happy", "Joie", "positive",
     "Coins des lèvres relevés, joues remontées, plis au coin des yeux.",
     "Ouverture sociale, approche, coopération.",
     "Expressions positives et ouvertes dominantes dans ces images."),
    ("sad", "Tristesse", "négative",
     "Coins des lèvres abaissés, paupières tombantes, sourcils inclinés.",
     "Retrait et baisse d'énergie ; besoin possible de soutien.",
     "Expressions de retrait ou de tristesse dominantes dans ces images."),
    ("surprise", "Surprise", "neutre",
     "Sourcils relevés, yeux grands ouverts, bouche entrouverte.",
     "Réaction à un événement inattendu ; attention tournée vers le stimulus.",
     "Expressions de réactivité dominantes dans ces images."),
    ("neutral", "Neutre", "neutre",
     "Visage au repos, sans contraction musculaire marquée.",
     "Calme, concentration ou absence d'expression marquée.",
     "Expressions calmes et posées dominantes dans ces images."),
]

# Statistiques publiées du jeu FER-2013 (dossiers train / test)
FER2013 = [
    ("angry", 3995, 958),
    ("disgust", 436, 111),
    ("fear", 4097, 1024),
    ("happy", 7215, 1774),
    ("neutral", 4965, 1233),
    ("sad", 4830, 1247),
    ("surprise", 3171, 831),
]

SOURCES = [
    ("Ekman, P. (1992). An argument for basic emotions. Cognition & Emotion, 6(3-4).",
     "Émotions de base (colère, dégoût, peur, joie, tristesse, surprise)",
     "https://doi.org/10.1080/02699939208411068"),
    ("Goodfellow et al. (2013). Challenges in Representation Learning: A report on three machine learning contests.",
     "Jeu de données FER-2013 (7 classes d'expressions faciales)",
     "https://arxiv.org/abs/1307.0414"),
    ("FER-2013 sur Kaggle", "Téléchargement du jeu de données (images 48x48)",
     "https://www.kaggle.com/datasets/msambare/fer2013"),
    ("Modèle dima806/facial_emotions_image_detection (Hugging Face)",
     "Modèle pré-entraîné de classification d'émotions (principal)",
     "https://huggingface.co/dima806/facial_emotions_image_detection"),
    ("Modèle trpakov/vit-face-expression (Hugging Face)",
     "Modèle pré-entraîné de secours",
     "https://huggingface.co/trpakov/vit-face-expression"),
]


def _style(ws, widths):
    header_fill = PatternFill("solid", start_color="1F3864")
    for cell in ws[1]:
        cell.font = Font(name="Arial", bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.font = Font(name="Arial", size=10)
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    for col, w in widths.items():
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "A2"


def build(path: Path = DATA_FILE) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    emotions = pd.DataFrame(EMOTIONS, columns=[
        "emotion", "label_fr", "valence", "description",
        "comportement_associe", "profil_expression"])
    fer = pd.DataFrame(FER2013, columns=["classe", "train", "test"])
    sources = pd.DataFrame(SOURCES, columns=["reference", "usage", "lien"])

    with pd.ExcelWriter(path, engine="openpyxl") as xw:
        emotions.to_excel(xw, sheet_name="emotions_base", index=False)
        fer.to_excel(xw, sheet_name="fer2013_stats", index=False)
        sources.to_excel(xw, sheet_name="sources", index=False)

    wb = load_workbook(path)
    _style(wb["emotions_base"], {"A": 12, "B": 12, "C": 11, "D": 48, "E": 52, "F": 58})

    ws = wb["fer2013_stats"]
    ws["D1"], ws["E1"] = "total", "part_du_total"
    n = len(FER2013)
    tot = n + 2
    for r in range(2, n + 2):
        ws[f"D{r}"] = f"=B{r}+C{r}"
        ws[f"E{r}"] = f"=D{r}/$D${tot}"
        ws[f"E{r}"].number_format = "0.0%"
    ws[f"A{tot}"] = "TOTAL"
    for col in "BCD":
        ws[f"{col}{tot}"] = f"=SUM({col}2:{col}{n + 1})"
    ws[f"E{tot}"] = f"=SUM(E2:E{n + 1})"
    ws[f"E{tot}"].number_format = "0.0%"
    _style(ws, {"A": 14, "B": 10, "C": 10, "D": 10, "E": 14})
    for cell in ws[tot]:
        cell.font = Font(name="Arial", size=10, bold=True)
    ws[f"A{tot + 2}"] = ("Source : statistiques publiées du jeu FER-2013 "
                         "(Kaggle / Goodfellow et al., 2013).")
    ws[f"A{tot + 2}"].font = Font(name="Arial", size=9, italic=True)

    _style(wb["sources"], {"A": 70, "B": 52, "C": 60})
    wb.save(path)
    return path


def export_json(path: Path = ROOT / "data" / "emotions_reference.json") -> Path:
    """Copie JSON de secours (utilisée si la lecture de l'Excel échoue dans le navigateur)."""
    import json
    emotions = {e[0]: {"label_fr": e[1], "valence": e[2], "description": e[3],
                       "comportement": e[4], "profil": e[5]} for e in EMOTIONS}
    fer = [{"classe": c, "train": a, "test": b, "total": a + b} for c, a, b in FER2013]
    sources = [{"reference": r, "usage": u, "lien": l} for r, u, l in SOURCES]
    path.write_text(json.dumps({"emotions": emotions, "fer": fer, "sources": sources},
                               ensure_ascii=False, indent=2), encoding="utf-8")
    return path


if __name__ == "__main__":
    print("Excel :", build())
    print("JSON  :", export_json())
    print("Pensez à recalculer l'Excel (LibreOffice) si vous modifiez les formules.")
