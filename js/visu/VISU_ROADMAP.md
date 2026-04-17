# VISU — Roadmap créative

---

## POLISH (problèmes identifiés)

- **KickFlash — gradient radial** (`effects/KickFlash.js:19-21`)  
  Trois `addColorStop` → bloom diffus. Remplacer par un flash uniforme plat. L'impact doit être brutal, pas rayonnant.

- **Needle glow pass** (`VisuCanvas.js:932-939`)  
  Double tracé lineWidth=4 / alpha×0.2 avant le sharp line = glow simulé. Supprimer. Garder seulement le sharp line rouge.

- **Chord halos** (`VisuCanvas.js:385-393`)  
  Anneaux qui s'expandent à chaque chord:trigger. Effet de bloom visuel. Remplacer par un flash ponctuel plat au centre COF.

---

## BONES — système rythmique circulaire

### Persistence oscilloscope
Les N dernières frames du waveform circulaire persistent en décroissance d'opacité.  
Frame courante : alpha 0.4. Frames précédentes : 0.12 → 0.06 → 0.02.  
Signature Tektronix P31 phosphore directe. Le signal laisse une trace — mesure dans le temps, pas snapshot.

### Step dots
Les steps actifs du pattern dessinés comme marques 2×2px sur leurs anneaux respectifs.  
Le playhead les survole. Coïncidence playhead/dot → flash blanc vif instantané.  
Les steps inactifs : absence (pas de case vide visible).  
La grille de percussion se lit directement sur la géométrie circulaire.

---

## HUMAN — couche transversale plein écran

### Noise drift field
Champ de pixels épars sur tout le canvas.  
Human=0 : immobile, grille parfaite.  
Human=1 : dérive lente, aléatoire, brownienne.  
Densité et vitesse pilotées par le curseur human amount.  
La tension machine/humanité lisible dans le mouvement ambiant.

### Machine ghost vs human real
À chaque step humanisé (Humanizer), dessiner pendant 2 frames un trait entre :
- la position temporelle exacte (là où la machine aurait frappé)
- la position réelle (là où le son est parti)

Un écart visible entre l'idéal et le vécu. Plus l'humanizer est fort, plus les écarts sont grands.  
Ce n'est pas un état sur le ring — c'est un **delta** entre deux états.

---

## COLOR — espace harmonique cumulatif

### Resonance bridge
Quand la note de basse en cours appartient à l'accord actif : une ligne fine relie le step basse actif (sur le bass ring) au nœud COF correspondant.  
Disparaît quand la basse est dissonante.  
Lien visuel direct entre les deux espaces harmoniques.

### Chord burn-in
Le polygone COF de l'accord s'épaissit progressivement à chaque fois que cet accord est joué (via TemporalMemory).  
Un accord entendu 20 fois est brillant et épais. Un accord joué une fois est fin.  
La structure tonale de la session se révèle par accumulation.
