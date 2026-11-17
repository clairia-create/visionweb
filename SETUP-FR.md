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


## 7. Activer AI Studio sans API payante

Cette première version utilise **Ollama sur ton propre ordinateur** au lieu d'une API IA payante. La génération fonctionne localement : aucune clé API OpenAI, carte bancaire ou facturation par génération n'est nécessaire.

### A. Installer Ollama sur Windows

1. Télécharge Ollama depuis le site officiel : https://ollama.com/download/windows.
2. Installe-le et ouvre l'application Ollama.
3. Ouvre PowerShell.
4. Télécharge d'abord le petit modèle capable de comprendre le texte et les images :

```powershell
ollama pull qwen3-vl:2b
```

Ce modèle fait environ 1,9 GB à télécharger. Qwen3-VL nécessite Ollama 0.12.7 ou une version plus récente. Ton ordinateur dispose de 16 GB de RAM, mais la capture montre que seulement 4,8 GB étaient disponibles au moment de la mesure. Ferme les applications dont tu n'as pas besoin avant de lancer le modèle. La génération peut être lente avec le processeur graphique Intel intégré.

Ne télécharge pas la version 4B pour le moment : elle demande davantage de mémoire.

### B. Utiliser le modèle dans VisionWeb

1. Ouvre le dashboard VisionWeb et connecte-toi.
2. Descends jusqu'à **AI Website Studio**.
3. Dans le champ **Local AI model**, laisse `qwen3-vl:2b`.
4. Clique sur **Check local AI**.
5. Quand le message indique que le modèle est prêt, écris ton idée et joins tes photos.
6. Clique sur **Create / refine with AI**.

Tu pourras essayer la version 4B plus tard uniquement si ton ordinateur dispose de mémoire libre suffisante.

### C. Important : utilisation depuis le site hébergé

Ollama doit fonctionner sur le même ordinateur que celui qui utilise ton dashboard administrateur. Pour un test local avec Live Server, Ollama autorise déjà les origines locales.

Lorsque le dashboard sera hébergé sur Cloudflare Pages, il faudra autoriser exactement l'adresse HTTPS de VisionWeb dans le réglage Ollama `OLLAMA_ORIGINS`, puis redémarrer Ollama. N'utilise pas un joker ouvert à tous les sites.

### D. Ce qui est gratuit et ce qui reste nécessaire

- Ollama et les modèles ouverts peuvent être utilisés localement sans payer de frais par requête.
- Le téléchargement du modèle utilise ta connexion Internet.
- La génération utilise la mémoire, le processeur ou la carte graphique de ton ordinateur, ainsi que de l'électricité.
- Les modèles locaux plus petits peuvent être moins performants que les grands services IA.
- Supabase et l'hébergement peuvent avoir leurs propres limites de forfait gratuit.

### E. Ce que cette première version fait et ne fait pas encore

- Elle crée et modifie des brouillons HTML privés.
- Elle conserve les photos originales dans le bucket Supabase privé.
- Elle sauvegarde la conversation et le brouillon.
- Elle affiche le résultat dans une prévisualisation isolée.
- Le bouton **Private Review** crée un lien client privé valable 30 jours. Le client peut approuver le site ou demander des changements.
- **Publish for Client** publie la version approuvée dans le bucket public `visionweb-client-sites` et fournit une URL publique Supabase.
- Les formulaires de réservation, commande et contact doivent être générés avec `data-visionweb-inquiry="booking"`, `"order"` ou `"message"` pour transmettre les demandes aux dashboards.
- Les notifications sont visibles dans l'application. Les envois par e-mail, SMS, WhatsApp ou push nécessitent encore des fournisseurs et des identifiants configurés.
- Le domaine personnalisé est enregistré dans le projet, mais son DNS doit être configuré séparément.
- **Publish to VisionWeb** reste un ajout au portfolio public distinct et doit être fait avec l'accord du client.

Aucune clé API IA ou information de paiement ne doit être ajoutée au code du navigateur.


## 8. Activer la gestion des clients, les revues privées et la publication

Après avoir exécuté `supabase/schema.sql` et la migration AI Studio `20261114090000_visionweb_ai_studio.sql`, exécute également le fichier :

```
supabase/migrations/20261117100000_visionweb_clients_publishing_inquiries.sql
```

Copie tout son contenu dans **Supabase → SQL Editor**, puis clique sur **Run**. Cette étape crée les profils clients, les liens de revue privés, le stockage des sites publiés, les demandes clients, les notifications et le compteur de visites.

### Ajouter un client
1. Connecte-toi à `admin.html`.
2. Clique sur **Manage clients**.
3. Crée la fiche du client avec son nom, son entreprise, son e-mail et son téléphone.
4. Pour activer son accès, crée son utilisateur dans **Supabase → Authentication → Users**.
5. Copie l'UUID de cet utilisateur et colle-le dans le champ **Connect account** de sa fiche client.
6. Envoie-lui le lien `client.html` et ses identifiants de connexion par un canal sûr. Ne lui demande jamais de partager son mot de passe.

### Créer, faire approuver et publier son site
1. Ouvre **Website Studio** dans le dashboard.
2. Sélectionne le client dans **Assign to client**.
3. Crée le site et vérifie son aperçu.
4. Clique sur **Client review** et envoie le lien privé au client.
5. Le client approuve le site ou demande des modifications sur `review.html`.
6. Recharge le projet dans le dashboard après approbation, puis clique sur **Publish client website**.
7. Le site est publié dans Supabase Storage. L'URL publique est affichée pour être copiée et partagée.

La publication utilise une URL publique Supabase Storage. Le champ **Client domain** permet d'enregistrer le domaine souhaité, mais le DNS et le routage du domaine doivent être configurés séparément chez le fournisseur du domaine/hébergement.

### Réservations, commandes et messages
Les pages générées peuvent inclure des formulaires avec `data-visionweb-inquiry="booking"`, `data-visionweb-inquiry="order"` ou `data-visionweb-inquiry="message"`. Les champs doivent inclure des noms reconnaissables comme `name`, `email`, `phone` et, pour les réservations, `date`. À la publication, VisionWeb connecte ces formulaires à la fonction sécurisée `submit_website_inquiry`. Les demandes sont visibles dans la boîte de réception de l'administrateur et dans le dashboard client.

Les notifications intégrées et les compteurs de visites sont enregistrés dans Supabase. Les e-mails, notifications WhatsApp/SMS et notifications push ne sont pas activés sans configuration de fournisseurs externes.
