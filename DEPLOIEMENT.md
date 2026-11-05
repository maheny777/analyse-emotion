# Déploiement : Git -> Space Hugging Face (statique, gratuit)

## 0. Pré-requis
Git et Git LFS installés (`git lfs version`), un compte Hugging Face (et GitHub si demandé).

## 1. Créer le Space
huggingface.co -> New -> Space
- Name : `emotion-image-ia`
- SDK : **Static** (choisir « Blank »)
- Visibilité : Public (gratuit)

## 2. Créer un token
Settings -> Access Tokens -> New token -> rôle **Write** (`hf_...`).

## 3. Pousser le projet
```bash
git lfs install
git clone https://huggingface.co/spaces/VOTRE_USER/emotion-image-ia
# identifiant : votre nom d'utilisateur HF | mot de passe : le token hf_...

cp -r emotion-static/. emotion-image-ia/        # copier tout le projet (fichiers cachés inclus)
cd emotion-image-ia
git add .
git commit -m "Projet emotion IA (Space statique)"
git push
```
Le Space démarre en quelques secondes. Le modèle (~90 Mo) est téléchargé par le navigateur
à la première ouverture, puis mis en cache.

Remarque : le `README.md` du projet remplace celui créé par Hugging Face (c'est voulu : il contient
la configuration `sdk: static`).

## 4. Dépôt GitHub (consigne du projet)
```bash
cd emotion-static
git init && git lfs install
git add . && git commit -m "Projet emotion IA"
git branch -M main
git remote add origin https://github.com/VOTRE_USER/emotion-image-ia.git
git push -u origin main
```
Synchronisation automatique GitHub -> Space :
1. GitHub : Settings -> Secrets and variables -> Actions -> secret `HF_TOKEN`
2. Remplacer `USERNAME` et `NOM_DU_SPACE` dans `.github/workflows/sync.yml`
3. Chaque `git push` sur `main` met le Space à jour.

## 5. En cas de problème
- Page blanche : ouvrir la console du navigateur (F12) et lire l'erreur.
- « Le modèle n'a pas pu être chargé » : vérifier la connexion Internet, puis cliquer sur « Réessayer ».
- Push refusé pour fichiers binaires : `git lfs install` puis
  `git lfs migrate import --include="*.xlsx,*.png"` et repousser.
