---
title: Analyse Emotion Image
emoji: 🧠
colorFrom: indigo
colorTo: purple
sdk: static
app_file: index.html
pinned: false
short_description: Analyse d'émotion par image (100 % navigateur)
---

# Analyse d'émotion et de comportement par image

Projet d'examen (IA). Le système estime l'**expression faciale visible** sur une image,
puis associe un comportement à l'émotion détectée à l'aide d'une base Excel.

**Space statique** : tout s'exécute dans le navigateur (HTML + JavaScript). Aucun serveur Python,
donc aucune erreur de build. Les images ne quittent pas l'ordinateur de l'utilisateur.

## Pipeline

![Pipeline](docs/pipeline.png)

1. Image choisie dans le navigateur
2. Prétraitement (décodage, réduction) avec un canvas
3. Classification par le modèle ONNX `Xenova/facial_emotions_image_detection` (transformers.js)
4. Interprétation avec `data/emotions_reference.xlsx` (Ekman 1992, FER-2013)
5. Interface : une image, ou profil sur plusieurs images avec export Excel

## Structure

```
index.html, style.css, app.js     application
data/emotions_reference.xlsx      base de données (Excel)
data/emotions_reference.json      copie de secours
docs/pipeline.png                 schéma du pipeline
tools/build_data.py               régénère l'Excel et le JSON
```

## Limites et éthique

L'expression faciale n'est pas l'état intérieur. Le « profil » sur plusieurs images décrit des
expressions, pas une personnalité. Projet pédagogique uniquement.
