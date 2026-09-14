# web/js/vendor/

Her ligger tredjepartskode som følger med nettstedet, i stedet for å
hentes fra en CDN ved hvert sidelast.

## supabase.js

Det offisielle Supabase-biblioteket, ferdig bygget (UMD).
**Versjon: 2.116.0**

Grunnen til at den ligger her og ikke lastes fra et nettsted:

* Menyen på siden forsvinner ikke om en CDN har en dårlig dag.
* Siden virker uendret om ti år, uten at en versjon har flyttet på seg.
* Du kan jobbe med nettsiden uten nett — bortsett fra selve databasen.

### Oppdatere den

```bash
npm install @supabase/supabase-js@latest
cp node_modules/@supabase/supabase-js/dist/umd/supabase.js web/js/vendor/supabase.js
```

Husk å oppdatere versjonsnummeret over. Filen er den uendrede
utgivelsen fra npm — den skal ikke redigeres for hånd.
