# Luxo

Appli pour apprendre le luxembourgeois depuis le français, à installer sur l'écran d'accueil du téléphone. Elle fonctionne **sans réseau**.

Adresse : https://axelll57.github.io/luxo/

## Les fichiers, et à quoi ils servent

| Fichier | Rôle |
| --- | --- |
| `index.html` | La page de l'appli (structure). |
| `style.css` | L'apparence (couleurs, boutons, carte). |
| `app.js` | La logique : exercices, correction, répétition espacée, sauvegarde. |
| `lessons.json` | **Le contenu** : leçons, phrases, notes de grammaire. C'est le seul fichier à toucher pour ajouter des leçons. |
| `manifest.webmanifest` | La « carte d'identité » de l'appli (nom, couleurs, icônes) qui permet de l'installer. |
| `sw.js` | Le *service worker* : il garde une copie de tous les fichiers sur le téléphone pour le mode hors ligne. Contient le **numéro de version**. |
| `icons/` | Les icônes de l'écran d'accueil. |

## Ajouter des leçons

1. Ouvre `lessons.json` sur GitHub et clique sur le crayon (Modifier).
2. Dans une unité, ajoute une leçon dans `"lecons"` :
   ```json
   {"id": "T11", "commune": "Réimech", "commune_fr": "Remich", "carte": [136, 204], "etiquette": "droite", "theme": "Au travail", "items": [
     {"t": "w", "fr": "la réunion", "lu": "d'Reunioun", "g": "art"},
     {"t": "s", "fr": "Je suis au bureau.", "lu": "Ech sinn am Büro.", "g": "dativ"}
   ]}
   ```
   - `id` : unique, ne le change jamais ensuite (la répétition espacée s'en sert pour suivre chaque mot).
   - `carte` : position sur le dessin de la carte (x de 20 à 165, y de 15 à 235). `etiquette` : `bas`, `gauche` ou `droite`.
   - `t` : `"w"` pour un mot, `"s"` pour une phrase. Mets au moins 4 mots et 8 phrases.
   - Facultatif : `alt` (autres réponses acceptées), `afr` (autres traductions françaises), `n` (note), `g` (clé de grammaire), `gap` (mot à cacher), `v: 1` (forme à vérifier sur lod.lu).
3. Si la commune figurait dans `communes_a_venir`, retire-la de cette liste.
4. **Publie une nouvelle version** (section suivante), sinon le téléphone garde l'ancienne copie.

## Publier une mise à jour

1. Ouvre `sw.js`, change la ligne `const VERSION = '1.0.0';` (ex. `'1.0.1'`) et enregistre (« Commit changes »).
2. Attends 1 à 2 minutes que GitHub Pages republie.
3. Sur le téléphone, ouvre Luxo avec du réseau : un bandeau jaune « Nouvelle version disponible » apparaît. Touche « Mettre à jour ».

*Pourquoi changer la version ?* Le téléphone compare `sw.js` avec sa copie. Si rien n'a changé dans ce fichier, il considère qu'il n'y a rien de nouveau, même si `lessons.json` a changé.

## Ta progression

Elle est enregistrée sur le téléphone, dans l'appli installée (pas dans Safari). Fais **⋯ → Exporter** de temps en temps et garde le code dans une note : c'est ta copie de secours.
