# Jev ir tikras HTTP bibliotekos pernaudojimas

> **Palaikomas runbook / metodika · peržiūrėta 2026-10-17.** Komandų paskirtį ir istorinius rezultatus skirti nuo pilno produkto acceptance. Ši antraštė nepervertina senų kohortų. Dabarties autoritetas: [būsena](IMPLEMENTATION.md), [priimta architektūra](DECISIONS.md), [roadmapas](../ROADMAP.md).

Šis runbook aprašo istorinius SprintDesk/Sonnet profilius; naujausiam Haiku StockDesk taikomas [atskiras profilis](experiments/STOCKDESK-CALIBRATION.md), planų ir modelių nemaišyti. Šie atskiri kalibravimo profiliai lygina tą patį Claude Sonnet 5.5 / high iš tuščios darbo vietos su Jev šaltinių bei įrankių atranka ir bendros HTTP bibliotekos pernaudojimu. `zero-jev-reuse-claude-v1` biblioteką pateikia tik pasiekus Jev slenkstį. `zero-jev-http-claude-v1` naudoja iš anksto operatoriaus pasirinktą, patikrintą HTTP pagrindą, o Jev atrenka papildomus šaltinius ir įrankius. Užduotis, tikrintuvas, prenumeratos prisijungimas ir laiko ribos vienodi. Bendras profilis nenustato atskirų šių pakeitimų poveikių. Pilnas produkto runtime ir Auto nedalyvauja.

## Paruošimas

`npm run lab:jev-prepare` yra offline planas: neskaito rakto, nesijungia prie providerio ir nekuria programos.

Gyvam paruošimui operatorius per stdin perduoda privačią bendros jungties konfigūraciją su `provider: openrouter-systemone`, `model: typesafe/jev-1.13`, `enabled: true`, `roles: [repo_selection, tool_selection]` ir `apiKey`. Rakto į terminalo komandą ar Git rašyti nereikia. Gyvas kvietimas įjungiamas tik aiškiais argumentais:

```bash
npm run lab:jev-prepare -- --live --connection-stdin --budget-ledger /absolute/path/to/private-ledger.json
```

Operatorius turi iš anksto suteikti bendrą vienkartinį 1 USD ledger su `limitUsdMicros: 1000000`, jau rezervuota suma ir `invocations` istorija. Esamos istorijos negalima pakeisti tuščiu ledger kiekvienam bandymui. Failas turi būti įprastas, be symlink ir prieinamas tik savininkui. Viena užklausa rezervuoja 0,10 USD prieš dispatch; neaiškus atsakymas rezervo neatlaisvina. Failo užraktas neleidžia persidengiančių šio operatoriaus užklausų. Tai nėra kitų tos paskyros klientų išlaidų kontrolė.

Prieš siuntimą tikrinama konkretaus modelio OpenRouter endpoint kainodara: ne daugiau kaip 0,000000042 USD už input tokeną, output kaina 0, kontekstas iki 262144 tokenų ir ne daugiau kaip septyni klausimai. Konservatyvus rezervas viršija septynių pilnų kontekstų kainą pagal šią patikrintą ribą. Pasikeitusi kainodara stabdo paruošimą. Pakartotinio siuntimo nėra; API pateikta faktinė kaina ir nežinomos reikšmės saugomos atskirai.

Paruošimas gauna tik viešą bandymo užduotį ir ribotą šaltinių rinkinį. Jev negali pasirinkti kito coding modelio, suteikti leidimų ar atšaukti patikrų. `noul >= 0,7` yra iš anksto užfiksuota eksperimentinė atrankos taisyklė, ne išmatuotas patikimumo garantas. Neaiškūs šaltiniai nepatenka į kontekstą; neaiškus įrankių pasirinkimas palieka pilną rinkinį.

Pirmas realus paruošimas pasirinko keturis vietinius įrankius, nepasirinko papildomų šaltinių ir bibliotekai grąžino 0,69. Jo 0,7 slenkstis nekeistas, originalus planas išsaugotas; coding kohorta su šiuo planu nepaleista. Atskira `--library verified-http` paruošimo konfigūracija ir `jev-http` kohorta pažymi operatoriaus pasirinktą bendrą HTTP pagrindą. Tai nėra teiginys, kad biblioteką pasirinko Jev, ar ankstesnio plano perrašymas.

## Biblioteka

Hono ir jo Node serverio adapteris paimami iš konkrečių viešų Git commit, išvardytų `HTTP_LIBRARY_SOURCES` faile `platform/scripts/zero-lab-reuse.mjs`. Paruošimas nevykdo upstream diegimo skriptų. Esamas esbuild sukuria vieną ESM biblioteką tik su Node builtins; abu originalūs MIT notices išsaugomi. Tikrinamas tikras HTTP request atskirame non-root, network-none, read-only Docker konteineryje su resursų ir laiko ribomis.

Darbo vietoje gali atsirasti tik `vendor/http.mjs`, abi licencijos ir trumpas naudojimo aprašymas. Bibliotekoje nėra užduoties API, SQLite logikos, UI ar tikrintuvo fixture. Visų kopijuojamų failų dydžiai ir SHA256 tikrinami prieš kiekvieną porą; kelio traversal, symlink, prarastos licencijos ir pasikeitę baitai atmetami.

## Užfiksuota kohorta

Paruošimas išsaugo `plan.json` ignoruojamame `.artifacts/zero-lab/preparations/` aplanke. Jame užfiksuoti užduoties ir visų runnerio šaltinių hash, Jev atsakymas, įrankiai, kontekstas ir bibliotekos baitai. Jei po paruošimo pakeistas runneris, reikia naujo plano; ankstesni reportai išsaugomi.

```bash
npm run test:lab-reuse
npm run lab:cohort -- --mode jev --plan /absolute/path/to/plan.json
npm run lab:cohort -- --mode jev --plan /absolute/path/to/plan.json --live
```

Iš anksto pasirinktai patikrintai HTTP bibliotekai naudok atskirą paruošimą su `--library verified-http`, o jo planą perduok `--mode jev-http`. Profilis tikrina plano bibliotekos politikos atitiktį; skirtingi planai netampa ta pačia kohorta.

Trys poros vykdomos AB / BA / AB. Ta pati Jev atranka ir promptai užfiksuoti visai kohortai; pats modelio pasirinkimas tarp porų neperleidžiamas. Visi failai ir nesėkmės išsaugomi. Bibliotekos paruošimo, tinklo, kompiliavimo, tikrinimo ir Jev laikas visa suma pridedamas prie kandidato kohortos; kopijavimas patenka į atskiro trial laiką.

50 % tikslas reiškia bent perpus mažesnį visos kandidato kohortos darbo laiką, įskaitant paruošimą, kai visos šešios programos praeina patikras. Atskirai rodomas CLI API kainos ekvivalento ir tikros Jev kainos palyginimas. Tai nėra faktinės Claude prenumeratos kainos sutaupymas: jis lieka nežinomas. Nesėkminga ar neužbaigta kohorta neturi greičio pergalės ar įvykdyto tikslo. Vienas darbas dar nepatvirtina bendro sistemos pranašumo.
