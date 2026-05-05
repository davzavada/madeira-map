# Madeira — počasí a webkamery

Tichá mapa Madeiry — počasí a živé webkamery z pěti míst po ostrově
(Funchal, Calheta, Seixal, São Jorge, Machico). Postaveno jako čistě
statický web pro GitHub Pages.

Funkce:
- 5 webkamer rozprostřených po ostrově (jih, jihozápad, sever, severovýchod, východ) s živým YouTube/Netmadeira náhledem
- hodinové statické snímky archivované cronem na GitHub Actions — vždy je k dispozici aspoň obrázek s časovým razítkem, i když stream zrovna spadne
- detail s 4denní předpovědí, živou webkamerou a hodinovým grafem teploty + srážek (vše na jednu obrazovku)
- mapa má **vrstvu „weather overlay"** — barevné pole nad ostrovem podle počasí pro dnešní den. Sytá modrá = silný déšť, světlejší = mírný déšť, zlatá = slunno a teplo. Intenzita roste podle množství srážek, takže okamžitě vidíš, kam za hezčím
- dynamická favicon ikona se mění podle převažujícího počasí na ostrově (slunce / mrak / déšť / bouřka)
- iOS „liquid glass" design, světlý / tmavý mód automaticky podle systémového nastavení
- česky

* mapa: [Mapy.com](https://developer.mapy.com) (raster tiles)
* počasí: [Open-Meteo](https://open-meteo.com)
* webkamery: živé YouTube streamy z [madeira-web.com](https://www.madeira-web.com) a [netmadeira.com](https://www.netmadeira.com); hodinové statické snímky pořizované GitHub Actions

## Soubory

```
index.html              UI shell
style.css               iOS liquid-glass design tokens
app.js                  mapa, panely, grafy, dynamický favicon
data.js                 lokace + Mapy.com API klíč
snapshots/              hodinové snímky (přepisuje GitHub Actions)
weather/                lokální cache počasí (přepisuje GitHub Actions každých 30 min)
tools/snapshot.sh       skript co stáhne snímek z každé webkamery
tools/weather.sh        skript co stáhne počasí pro všechna místa
.github/workflows/snapshots.yml   cron každou hodinu (snímky)
.github/workflows/weather.yml     cron každých 30 min (počasí)
```

## Lokální spuštění

Stačí jakýkoliv statický server (kvůli `fetch('snapshots/index.json')`):

```sh
npx http-server . -p 8765 -c-1
# nebo
python3 -m http.server 8765
```

Otevři [http://localhost:8765](http://localhost:8765).

Pro ruční obnovu snímků:
```sh
bash tools/snapshot.sh
```

## Nasazení na GitHub Pages

1. **Vytvoř repo** a nahraj obsah složky:
    ```sh
    cd /cesta/k/projektu
    git init
    git add .
    git commit -m "init"
    git branch -M main
    git remote add origin git@github.com:USER/REPO.git
    git push -u origin main
    ```

2. **Zapni Pages** v Settings → Pages → Build and deployment → Source: `Deploy from a branch`, Branch: `main` / `(root)`.

3. **Povol Mapy.com origin**: jdi na [developer.mapy.com](https://developer.mapy.com), v nastavení svého API klíče přidej origin svého Pages URL (např. `https://USER.github.io`). Bez toho server vrací prázdné dlaždice.

4. **Povol commit z workflows**: Settings → Actions → General → Workflow permissions → vyber **Read and write permissions** a ulož. Bez toho hodinový cron nedokáže pushnout snímky zpátky.

Po prvním pushnutí spusť workflow ručně (Actions → "webcam snapshots" → Run workflow), nebo počkej do nejbližší hodiny.

## Přidávání / měnění míst

Edituj `data.js` — každý záznam:
```js
{
  id: "uniqueid",
  name: "Zobrazený název",
  region: "south" | "sw" | "west" | "nw" | "north" | "ne" | "east" | "far-east",
  tier: 1,                 // 1 = vždy zobrazit, 2 = zobrazit od zoom 11
  lat: 32.6, lon: -16.9,
  webcam: {                // nebo `webcam: null` + `kind: "info"` pro bod jen s počasím
    title: "Popisek",
    youtubeId: "abc123",   // YouTube live stream ID
    page: "https://..."    // URL původní webové stránky
  }
}
```

Pak přidej odpovídající entry do `tools/snapshot.sh` (formát `kind:id:src`):
```sh
ENTRIES+=( "yt:uniqueid:abc123" )            # YouTube — src je videoId
ENTRIES+=( "nm:uniqueid:netmadeira-slug" )   # Netmadeira — src je slug stránky
```

V `data.js` musí webcam objekt obsahovat odpovídající pole:
- `youtubeId: "abc123"` pro YouTube cam (panel ukazuje iframe)
- `netmadeiraSlug: "boaventura"` pro Netmadeira cam (panel ukazuje statický snímek)

## Designové poznámky

- **Liquid glass**: backdrop-filter blur+saturate, jemný horní lesklý okraj (refrakce), tenké světlé borders.
- **Barvy**: terakota (`--accent`) jen pro stav „vybraný / živě"; modrá (`--rain`) jen pro srážky. Pozadí je papírově teplé světlé / hluboce uhelně tmavé (auto dle prefers-color-scheme).
- **Typografie**: serif (`ui-serif` → New York / Iowan / Charter) pro nadpisy, system sans pro tělo, mono pro čísla. Žádné Google Fonts (rychlejší + méně tracking).
- **Atribuce Mapy.com**: logo má povinnou min-výšku 30px nad mapou — nesahej.
- **Ikona webu**: dynamicky podle převažujícího počasí ostrova (slunce / mraky / déšť / bouřka).

## Známá omezení

- **Webkamery**: živý YouTube embed selže, když stream zrovna není naživo.
  Frontend pak spadne na poslední hodinový snímek z `snapshots/` (s časovým razítkem).
- **Hodinový cron**: prvotní `snapshots/index.json` se commitne hned po prvním
  spuštění workflow. Do té doby app používá YouTube `mqdefault_live.jpg`
  fallback.
- **Dynamický favicon**: prohlížeče cachují, takže tab ikona se občas obnoví
  až po reloadu.

## Licence

MIT pro vlastní kód. Snímky webkamer patří jejich provozovatelům
(Madeira-Web / Netmadeira / WebcamTaxi). Mapová data © Seznam.cz a další.
