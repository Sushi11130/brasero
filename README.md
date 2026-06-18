# Brasero

Brasero est un salon prive pour parler entre potes, partager des fichiers, lancer des sondages et garder une flamme quand vous vous envoyez un message chaque jour.

## Ce qui existe

- Comptes par email et mot de passe avec Supabase Auth.
- Chat general en temps reel.
- Salons prives par groupe avec membres choisis.
- Vue admin sur les discussions visibles dans tous les salons, y compris les salons prives.
- Reactions rapides aux messages.
- Fichiers stockes dans Supabase Storage.
- Recherche dans les fichiers par nom, personne ou type.
- Sondages avec vote par utilisateur.
- Flammes quotidiennes: un message par jour augmente la serie.
- Admin: voir les utilisateurs, bloquer/debloquer le chat, voir les fichiers envoyes, changer le mot de passe d'un utilisateur.

Important: l'admin ne peut pas voir les mots de passe. C'est volontaire: un vrai site ne doit jamais stocker ni afficher les mots de passe en clair. L'admin peut seulement definir un nouveau mot de passe.

## Lancer en local

```bash
node server.js
```

Puis ouvre:

```text
http://localhost:3000
```

## Configurer Supabase

1. Cree un projet sur Supabase.
2. Va dans `SQL Editor`.
3. Copie tout le contenu de `supabase/schema.sql`.
4. Execute le script.
5. Va dans `Project Settings > API`.
6. Copie `Project URL` et `anon public key`.
7. Mets-les dans `public/config.js`.

Si tu avais deja execute une ancienne version du script, tu peux relancer `supabase/schema.sql`: il ajoute les nouvelles tables et colonnes sans supprimer tes donnees.

Exemple:

```js
window.BRASERO_CONFIG = {
  supabaseUrl: "https://xxxxxxxx.supabase.co",
  supabaseAnonKey: "ey..."
};
```

## Creer ton premier admin

1. Cree ton compte depuis le site.
2. Dans Supabase, va dans `SQL Editor`.
3. Lance cette requete en remplacant l'email:

```sql
update public.profiles
set role = 'admin'
where email = 'ton-email@example.com';
```

Reconnecte-toi ensuite au site: l'onglet `Admin` apparaitra.

## Activer le temps reel Supabase

Le script SQL ajoute les tables a `supabase_realtime`. Si Supabase affiche un avertissement, va dans:

```text
Database > Replication
```

Puis verifie que ces tables sont activees:

- `profiles`
- `rooms`
- `room_members`
- `messages`
- `message_reactions`
- `files`
- `polls`
- `poll_votes`

## Changer les mots de passe

Pour changer le mot de passe d'un autre utilisateur, l'app utilise:

- `functions/api/admin-reset-password.js` sur Cloudflare Pages.
- `SUPABASE_URL` comme variable Cloudflare.
- `SUPABASE_SERVICE_ROLE_KEY` comme secret Cloudflare.

La `service_role key` ne doit jamais etre mise dans `public/config.js`.

Pour tester cette route en local:

```powershell
$env:SUPABASE_URL="https://xxxxxxxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="ey..."
node server.js
```

## Publier sur Cloudflare Pages

Tu as deux options. La plus simple est GitHub + Cloudflare Pages.

### 1. Preparer le projet

Verifie que `public/config.js` contient bien:

```js
window.BRASERO_CONFIG = {
  supabaseUrl: "https://xxxxxxxx.supabase.co",
  supabaseAnonKey: "ey..."
};
```

Ne mets jamais la `service_role key` dans `public/config.js`.

### 2. Envoyer sur GitHub

Depuis GitHub Desktop ou le site GitHub:

1. Cree un nouveau repo.
2. Ajoute tous les fichiers du dossier.
3. Publie le repo.

Si tu installes Git plus tard, tu pourras faire:

```bash
git init
git add .
git commit -m "Initial Brasero"
git branch -M main
git remote add origin https://github.com/TON-COMPTE/brasero.git
git push -u origin main
```

### 3. Creer le site Cloudflare Pages

1. Va sur Cloudflare.
2. Ouvre `Workers & Pages`.
3. Clique `Create application`.
4. Choisis `Pages`.
5. Choisis `Import an existing Git repository`.
6. Connecte ton repo GitHub.
7. Dans `Set up builds and deployments`:
   - Framework preset: `None`
   - Build command: laisse vide
   - Build output directory: `public`
8. Clique `Save and Deploy`.

### 4. Ajouter les secrets Cloudflare

Dans ton projet Cloudflare Pages:

1. Va dans `Settings`.
2. Va dans `Variables and Secrets`.
3. Ajoute:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
4. Pour `SUPABASE_SERVICE_ROLE_KEY`, coche l'option d'encryption/secret.
5. Redeploie le site.

Le dossier `functions/` sera detecte par Cloudflare Pages pour l'endpoint admin.

### 5. Configurer les URLs Supabase

Dans Supabase:

1. Va dans `Authentication > URL Configuration`.
2. Mets ton URL Cloudflare dans `Site URL`.
3. Ajoute aussi ton URL dans les redirects autorises si Supabase te le demande.

Exemple:

```text
https://brasero.pages.dev
```

### 6. Tester apres publication

1. Ouvre l'URL Cloudflare.
2. Cree deux comptes.
3. Passe ton compte admin avec la requete SQL.
4. Connecte-toi en admin.
5. Cree un salon prive avec l'autre compte.
6. Envoie un message, une reaction, un fichier.
7. Va dans `Admin > Discussions` pour verifier que l'admin voit le salon.
8. Va dans `Admin > Fichiers envoyes` et teste la recherche.

## Idees a ajouter

- Messages epingles.
- Notifications quand un fichier est ajoute.
- Suppression de ses propres messages.
- Expiration automatique de certains fichiers.
- Badges: createur de sondages, meilleur streak, archiviste.
- Mode invitation avec code secret.
- Recherche dans les fichiers et messages.
- Mini calendrier d'evenements entre potes.

## Idees de noms

- Brasero
- CoinFeu
- La Table
- Cercle
- QG
- Bivouac
- Canape
- Relais
- Clique
- Agora
