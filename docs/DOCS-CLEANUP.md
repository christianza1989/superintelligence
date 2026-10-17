# Dokumentų sutvarkymo ataskaita

2026-10-17. Source atskaita: `fe14bdd4fb9cd8805938e1169a4bd2d13961bb86`. Šis pakeitimas sutvarko dokumentų autoritetą ir navigaciją; produkto runtime nepakeistas.

- Priimta Astra audito kryptis, papildomai aptartos MVP/beta ribos, mažesnis pirmas runtime darbas, Jev pasirinkto profilio ir naudos skirtumas bei savarankiška Library.
- 25 failai: pakeisti planai, tyrimai/recenzijos ir 2 ankstesni UI konceptai išsaugoti [karantine](quarantine/README.md). Kiekvieno originalo baitai, dydis ir SHA-256 tikrinami; senus Markdown originalus žymi `.snapshot.txt`.
- Trys modelių bandymų ataskaitos perkeltos į [experiments](experiments/README.md), rezultatai ir failures nepakeisti. Senos „aktyvus / NOT_RUN“ frazės aiškiai priklauso aprašytai epochai. Užšaldyti benchmark fixtures ir masininiai rezultatai neperrašyti.
- Dabarties įėjimai: [indeksas](README.md), [būsena](IMPLEMENTATION.md), [sprendimai](DECISIONS.md), [planas](../PLAN.md). Ateities specifikacijos paliktos su aiškiu planavimo statusu. Inherited platform dokumentai, source pins, licencijos ir notices išlaikyti.
- Visi 244 ankstesni roadmap task ID išsaugoti. Bazės/UI alternatyvų pasirinkimą pakeitė priimtas Rakazo sprendimas; kvalifikavimo vartai lieka. Pridėti maži pirmi darbai ir L1–L5. MVP generuojamas iš tų pačių ID/būsenų, kad sąrašai neišsiskirtų.
- Septyni nauji UI maketai paskelbti kaip konceptai. Demonstraciniai stars, tests ir kainos nėra produkto įrodymai; tikri ankstesni foundation screenshotai išsaugoti.
- Svetainės dokumentų navigacija rodo dabartinį įėjimą, statusą ir datuotus rezultatus. Source export įtraukia root AGENTS, kad ateities užduotys perskaitytų tinkamą pradžią.

Patikros atliktos: **98/98 foundation**, svetainės build PASS, Astro check **0 errors / 0 warnings / 1 esama inline-script hint**, dokumentų tikrintuvas **59 Markdown / 552 vietinės nuorodos / 265 unikalūs ID / 70 sinchronizuotų MVP darbų / 25 originalų hash**. Keturi tyčiniai gedimai aptikti: MVP drift, duplicate ID, karantino pakeitimas ir missing link. Naršyklėje peržiūrėtas 1440 px ir 390 px dokumentų puslapis, 23 nuorodos, be horizontalaus overflow ar page errors; 7 pagrindiniai Markdown exports HTTP 200. `npm run check:docs` tikrina MVP sinchronizaciją, ID išsaugojimą, vietinius dokumentų failų taikinius ir visų karantino originalų hash. Nuorodų fragmentai ir išoriniai URL šia komanda netikrinami. Produkto end-to-end, provider sąskaitos ir native OS šiuo dokumentų pakeitimu nekvalifikuojami.

Source export smoke praėjo: 2339 failai, apie 64,3 MB nesuspausto authored source, apie 33,4 MB archyvas; credentials neįtraukti pagal exporter patikras. Patvirtinta, kad pakete yra root AGENTS, .rgignore, docs tikrintuvas ir karantino manifestas. Tai source paketas, ne installer ar G0 viso runtime footprint matavimas.
