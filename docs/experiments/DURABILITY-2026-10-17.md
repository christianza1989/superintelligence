# Patvarumo kvalifikacija: 50 apibrėžtų scenarijų

2026-10-17. Commit ff25a90 integruoja tikrą expired-lease galutinio įrašo pataisą ir vardinę 50 scenarijų matricą. **50/50 PASS**, papildomai 63 DB event unit testai bei db/testkit TypeScript patikros PASS. Tai dalis G1, ne pilnas jo priėmimas.

| Rinkinys | Scenarijų skaičius | Faktinis mechanizmas |
|---|---:|---|
| Esamas executor lifecycle | 21 | Tikras PostgreSQL, scripted runtime / fake connector, injekuotos patvarios būsenos, claim/fence/terminal/steering/cancel kontrolės |
| Esamas Graphile kontraktas | 7 | Tikras PostgreSQL ir worker, fake handlers, delayed replacement/cancel/backoff/exhaustion/retry; shutdown yra graceful |
| Papildomi authority / reconnect / effect / restore atvejai | 22 | 8 authority pjūviai, 4 event cursor atvejai, 4 fake effect kontrolės, 2 tikri child SIGKILL pjūviai, 4 restore kontrolės |

Du SIGKILL atvejai žudo tik šio bandymo child procesą prieš / po terminal SQL commit ir tikrina atomiškai išlikusią būseną. Jie neapsimeta PostgreSQL serverio ar viso scheduler proceso žūtimi. Kiti „crash“ būsenų scenarijai aiškiai naudoja injekuotą persisted būseną.

Restore scenarijai naudoja quiesced sintetinę DB, pg_dump ir jos artefaktų kopiją į šviežią DB. Tikrinama atkurtų nuorodų ir bytes/hash tapatybė, missing / changed blob bei foreign scope atmetimas. Tai ne production live backup.sh / restore.sh, off-host ar power-loss kvalifikacija.

## Rasta klaida ir išsaugotos nesėkmės

Pradinė tikra PG neigiama kontrolė parodė, kad pasibaigęs lease vis dar leido finalizeRun įrašyti terminal rezultatą. Pridėta galiojimo sąlyga prie esamo owner/fence CAS; po jos penki seni steering fixtures, kurie ranka nustatydavo running be lease expiry, teisingai nebegalėjo finalizuoti. Fixtures pataisyti pateikti finite live expiry, jų esminių assertions nesusilpninant. Pradinis red ir nutraukto batch įrodymai išsaugoti privačiai; naujas PASS nepakeičia jų originalių baitų. Vėlesnė peržiūra papildomai tikrina expiry per laukiamą row lock — tai atskira kontrolė, ne perrašyta ši 50 atvejų epocha.

Runner saugo tikslų source SHA, vietinio PG image ID, visus vardinius rezultatus, sintetinių run / attempt / effect / ordered event įrodymus ir failures. Tikrina tikslų vardiklį ir nepriima dalinio rezultatų rinkinio. Sukuria vieną pažymėtą disposable PG container, tikrina ownership prieš valydamas ir neliečia kitų DB. Mokamų modelių / tiekėjų kvietimų 0. Privatūs raw įrodymai ir vietiniai keliai į Git neperkeliami.

Paleisti iš paruošto Linux checkout: `npm run qualify:durability`. Šis opt-in testas naudoja Docker ir sugeneruotą fake konfigūraciją, neskaito development .env. Source runner: `platform/scripts/qualify-zero-durability.mjs`.

## Papildoma expiry / lock kontrolė

Atskiras 51-as tikras PostgreSQL bandymas parodė dar vieną klaidą: galiojimo laiką paėmus prieš blokuojantį UPDATE, laukiantis vykdytojas galėjo finalizuoti jau pasibaigus lease. Testas per `pg_stat_activity` patvirtina tikrą Lock laukimą dar galiojant lease, o užraktą paleidžia tik DB laikrodžiui peržengus expiry. Pradinis RED išsaugotas. Pataisa pirmiausia užrakina thread ir run eilutes esama tvarka, tada ima `clock_timestamp()` ir tikrina galiojimą laikydama run užraktą iki commit. Nauja atskira kontrolė **1/1 PASS**, terminal writes 0; pirminė 50 atvejų epocha nepakeista. Papildomai **67/67** DB event unit testai ir db/testkit types PASS. Paleidimas: `node platform/scripts/qualify-zero-durability.mjs --expiry-lock`.

## Likusi G1 apimtis

Dar atviri actual scheduler / DB crash ir fizinio disk-full / resource exhaustion pjūviai, nuoseklus live backup/restore bei ≤2 000 000 000 B bazės ir pikinio laikino disko matavimas. Vien 50 žalių testų šių vartų neuždaro. Tai viešai matomas kūrimo rinkinys, ne independent holdout ar visų gedimų garantija.
