# VisionWeb 2026 — Guide de configuration

Cette version contient deux espaces séparés :

- **Boutique publique (`index.html`)** : les visiteurs consultent les projets publiés, voient leur prix en USD et demandent à les acheter par WhatsApp.
- **Espace administrateur (`admin.html`)** : toi seule peux ajouter, modifier, publier, dépublier ou supprimer tes projets après connexion.

Le site ne collecte pas de paiement. Il n'y a ni carte bancaire, ni checkout, ni passerelle de paiement. Le bouton **Get This Website** ouvre WhatsApp avec le nom du projet, son prix et la demande du client.

## Avant de commencer

Tu dois avoir un compte Supabase et un nouveau projet consacré à VisionWeb. Ne réutilise pas le projet d'une autre application comme VerifyMail : garde les bases de données séparées.

## 1. Créer la base de données

1. Ouvre le tableau de bord Supabase et crée un nouveau projet nommé `visionweb`.
2. Ouvre **SQL Editor**.
3. Ouvre le fichier `supabase/schema.sql` de ce dossier.
4. Copie tout le contenu du fichier dans SQL Editor et exécute-le.

Ce script crée la table des projets, la liste des administrateurs, les règles de sécurité (RLS) et le stockage public des images d'aperçu. Les visiteurs non connectés peuvent seulement lire les projets publiés. Seuls les comptes inscrits dans la liste des administrateurs peuvent ajouter, modifier ou supprimer des projets.

## 2. Créer ton compte administrateur

1. Dans Supabase, ouvre **Authentication → Users**.
2. Ajoute un utilisateur avec ton adresse email professionnelle `clairaria3@gmail.com` et choisis un mot de passe fort.
3. Confirme l'adresse email dans le tableau de bord si Supabase le demande.
4. Copie l'UUID de cet utilisateur dans la liste des utilisateurs.
5. Retourne dans **SQL Editor** et exécute cette commande en remplaçant le texte entre apostrophes par l'UUID copié :

```sql
insert into public.visionweb_admins (user_id)
values ('PASTE_AUTH_USER_UUID_HERE');
```

Cette autorisation est essentielle : créer un utilisateur Auth ne lui donne pas automatiquement les droits d'administrateur. Ne partage jamais ton mot de passe.

## 3. Connecter le site à Supabase

1. Dans Supabase, ouvre **Project Settings → API** (le nom de la page peut être **API Keys** dans la nouvelle interface).
2. Copie le **Project URL**.
3. Copie la clé **publishable** (ou l'ancienne clé publique `anon` si c'est celle que ton projet affiche).
4. Ouvre `supabase-config.js` dans le dossier VisionWeb et remplace les deux valeurs d'exemple :

```js
window.VISIONWEB_SUPABASE_CONFIG = {
  url: "https://YOUR-PROJECT-REF.supabase.co",
  anonKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"
};
```

La clé publishable/anon est conçue pour être utilisée dans un navigateur **avec les règles RLS activées**. N'ajoute jamais une clé `service_role`, une clé secrète ou un mot de passe dans ce fichier. Le fichier est visible par les visiteurs.

## 4. Tester le site

Pour tester localement, ouvre le dossier avec VS Code et lance un serveur local (par exemple l'extension Live Server). Ouvre ensuite :

- `index.html` pour voir la boutique publique.
- `admin.html` pour te connecter à ton tableau de bord.

Mets le contenu du dossier à la racine de ton repository GitHub. Pour publier la boutique, connecte ensuite ce repository à un hébergeur statique comme **Cloudflare Pages**. Pour ce projet HTML/CSS/JavaScript sans compilation, choisis la branche `main`, laisse la commande de build vide (ou utilise `exit 0` si demandé) et indique le dossier racine du repository comme dossier de sortie. Voir le guide officiel : https://developers.cloudflare.com/pages/get-started/git-integration/.

## 5. Ajouter tes sites web

1. Ouvre `admin.html` sur ton site publié.
2. Connecte-toi avec l'email et le mot de passe de ton compte autorisé.
3. Clique sur **Add a project**.
4. Ajoute le nom, la catégorie, la description, une image (fichier ou URL), le prix USD, ce qui est inclus et le lien de démonstration si disponible.
5. Laisse **Publish this project** activé pour le rendre visible, ou désactive-le pour garder le projet en brouillon.
6. Enregistre. Le projet apparaît dans la boutique publique s'il est publié.

Les images téléversées sont stockées dans le bucket public `visionweb-project-images`. Taille maximale : 5 MB. Formats acceptés : JPG, PNG, WebP et AVIF.

## 6. Parcours du client

1. Le client parcourt la collection et filtre les projets.
2. Il ouvre un projet, découvre sa description, son prix, les éléments inclus et le lien de démonstration s'il existe.
3. Il clique sur **Get This Website**.
4. WhatsApp s'ouvre avec un message prérempli qui contient le nom du projet et son prix.
5. Tu réponds au client et vous convenez directement de la méthode de paiement.

WhatsApp VisionWeb : **+257 66 532 541**  
Email : **clairaria3@gmail.com**

## À savoir

- Les projets enregistrés dans l'espace administrateur sont stockés en ligne dans Supabase : ils ne dépendent pas du navigateur sur lequel tu les as ajoutés.
- Un projet en brouillon n'est pas visible pour les clients.
- Le site n'accepte pas d'argent automatiquement et ne stocke aucune donnée de carte bancaire.
- Le dashboard est protégé par Supabase Auth et les règles RLS de la base de données. N'ajoute que ton propre compte à `visionweb_admins`.
- Le dépôt GitHub contient le code du site. Les projets et images sont gérés dans Supabase : tu n'as donc pas besoin de modifier `projects.js` à chaque ajout.
