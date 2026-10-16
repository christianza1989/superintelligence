# Jev pritaikymas RepositoryZero

2026-10-16. **Jev numatomas kaip pasirenkamas greitų struktūrizuotų sprendimų sluoksnis: įrankių, repo, konteksto ir coding darbo atrankai.** Tai praplečia pradinį tools-only panaudojimo planą. Dabartinis OpenRouter selector adapteris išbandytas offline; gyvas Jev, kainos ir sutaupymas dar nepatikrinti. [Pirminis protokolo tyrimas](ROUTER-EVALUATION.md), [nepriklausoma pritaikymo peržiūra](reviews/jev-use-cases-review.md).

## 1. Ką patvirtina šaltiniai

Oficialus [OpenRouter SystemOne SDK dokumentas](https://github.com/OpenRouterTeam/typescript-sdk/blob/4200d11265efd9e27916989f0ac013f64ef949d0/docs/sdks/systemone/README.mdx) nurodo SystemOne kelią ir `typesafe/jev-1.13` pavyzdį; tame pačiame call gali būti keli vardiniai klausimai. Oficialaus [TypeSafe SDK](https://github.com/typesafe-ai/typesafe-sdk-js/tree/b844cd1aca12855a5d24a2df52a1401c86e7d37a) tipai/builders aprašo bendrą `state` ir `choice`, `noul`, `score` klausimus. Tai source kontrakto galimybės, ne patvirtintas mūsų account/model/rate ar šių užduočių tikslumas.

- `choice` tinka rinktis pateikto rinkinio repo, failo, įrankio, testo ar agento ID. Aiškų `abstain` variantą įtraukiame patys į kriterijus.
- `noul` skirtas yes/no vertinimui; tikimybės negalima laikyti neklystančiu faktu ar atskiru leidimu.
- `score` yra rubrikos įvertinimas ir gali būti trupmeninis; ne objektyvus viso GitHub kokybės balas.
- Keli klausimai gali pasidalyti tuo pačiu `state`. Tai gali sumažinti pakartotinį kontekstą, bet kainos ir našumo nauda dar turi būti pamatuota; skirtingi grants/duomenų gavėjai ir nesusiję darbai nesuplakami į vieną request.

Jev nereikia suteikti visos programos kūrimo vaidmens, kad jis būtų naudingas programavimui. Struktūrizuotas pasirinkimas gali sumažinti pagrindiniam modeliui perduodamą informaciją ir nereikalingus jo žingsnius. Kodą, architektūrą ir pakeitimų argumentus rengia pagrindinis coding modelis; tikrą veikimą nustato build/test ir apibrėžtas acceptance.

## 2. Prioritetinės vietos

| Vieta | Kas daroma be modelio | Jev užduotis po filtrų | Kas lieka atskirai | Įgyvendinimo būsena |
|---|---|---|---|---|
| Įrankių atranka | Capability/schema, OS, grant, auth ir resursų filtrai | Pasirinkti tinkamą profilį iš mažo leidžiamo rinkinio arba susilaikyti | Vykdymo autorizavimas ir rezultato patikra | OpenRouter adapteris yra, offline PASS; live ir brokerio wiring dar laukia |
| Repo atranka naujam projektui | Kanoninės tapatybės, kategorija, source/pin, aiškūs licencijos/platformos apribojimai | Iš2–5kandidatų aprašų rinktis tolesnės analizės pagrindą pagal brief arba pažymėti neaiškumą | Pilna licencijos/API/maintenance analizė ir realus build/test; stars nėra teisingumo įrodymas | Serverio source-only helper ir10offline scenarijų PASS; tikras live smoke sustojo tinklo preflight prieš modelio dispatch |
| Dokumentacijos fragmentai | Versioned dokumentų indeksas ir lexical/struktūrinis retrieval | Įvertinti kelių ištrauktų fragmentų aktualumą konkrečiam klausimui | Išlaikyti privalomus kontraktus/šaltinius, išplėsti paiešką, jei trūksta įrodymų | Aukšto prioriteto tokenų taupymo eksperimentas; dar neįgyvendintas |
| Kodo failų atranka | Import/symbol graph, keliai, pakeisti failai ir tiesioginės priklausomybės | Parinkti aktualius failus iš jau ištraukto mažo rinkinio | Pagrindinis modelis skaito ir taiso kodą, gali paprašyti papildomo konteksto | Planuojama; Jev ne vienintelis failų matomumo filtras |
| Testų ir specialistų atranka | Pakeistų modulių priklausomybės ir privalomas regresijos rinkinys | Parinkti papildomą tikslinį testų profilį ar tinkamą agentą | Testų vykdymas, privalomos patikros ir bendras child biudžetas | Planuojama; Jev neatšaukia privalomų testų |
| Auto model | Prijungtos paskyros, modelių capability/context ir biudžeto filtrai | Plano žingsniui pasirinkti vieną leistiną modelio profilį arba abstain | Tikras modelio vykdymas, faktinės sąnaudos ir quality/eval; fixed pasirinkimas nekeičiamas | Serverio policy helper ir14offline scenarijų PASS; live Auto model ir UI dar nėra |
| Repo submission/tagging triage | Dedup, metadata, dydžio ir eilės ribos, jau žinomi deterministic atsakymai | Finansavimą turinčiai eilei pasiūlyti kategoriją/aktualumą ar needs-information | Galutinis admission/verified, namespace/teisių tikrinimas ir capacity | Viešo masinio intake paid cap0 išlieka |
| PR/veiksmo klasifikacija | Tikros trusted taisyklės, diff/scope ir privalomi vartai | Patariamasis triage, kuriai peržiūrai ar testui skirti darbą | Grants, merge/release/finansiniai sprendimai ir nepriklausomas vertinimas | Esamas Rakazo auto-review source yra; jo automatiškai neaktyvuojame |

Tai usecase planas, ne teiginys, kad visos šios funkcijos jau veikia. Pirmas išplėtimas — repo ir dokumentacijos atrankos palyginimas su paprastu indeksu; daugiau modelio rolės įjungiamos tik turint jų naudą patvirtinantį bandymą.

## 3. Dokumentacijos filtravimo ir tokenų taupymo eiga

**Žmogaus užklausa → vietinis indeksas → keli tinkami dokumentų fragmentai → leistas Jev aktualumo klausimas → tikslinis pagrindinio modelio kontekstas → atsakymas/kodas → patikra.**

Modeliui nesiunčiami visi katalogo repo, pilni README ar visa dokumentacija vien tam, kad jis juos išmestų. Pirmiausia retrieval atlieka pigų sumažinimą. Jev vertina tik tai užduočiai leistinus faktus/fragmentus, kurie dar turi semantinį neaiškumą. Paprastam exact vardui, paketo versijai ar jau žinomam kategorijos filtrui Jev kvietimo nereikia.

Atrinktas kontekstas turi source URL, exact SHA, failo/fragmento ribas ir retrieval coverage. Licencijos/kontrakto dalis, kurią reikia sprendimui priimti, nepašalinama vien dėl žemo modelio aktualumo. Nukirpta ar klaidingai atmesta informacija gali sugadinti rezultatą, todėl `missing`, `abstain` ir „reikia daugiau konteksto“ yra normalūs išėjimai.

Cache saugomas pagal source pin, fragmentus, klausimo/profilio versiją, modelį ir taikomą scope. Privačių projektų turinys ir išvados savaime nesidalija bendru cache. Provider prompt caching yra atskira technika su savomis sąlygomis/kaina; Jev klasifikacija ir failų cache jos neatstoja. Registry augimas nėra modelio pertreniravimas.

## 4. Kaip vartotojas jį prijungtų

Naudojama bendra modelių jungties konfigūracija su `fast_decision` role ir atskirai pasirinktais naudojimo profiliais: tool selection, repo selection, context relevance ir coding triage. Jev yra konkretus SystemOne providerio adapteris už šios ribos. Naujos provider-specific paslapčių aplinkos kintamųjų sistemos nekuriame. Ši role/profilių UI dar neįgyvendinta.

Naudotojo OpenRouter paskyra gali aptarnauti ir pagrindinį modelį, ir Jev, tačiau abiejų rezervai turi dalytis tuo pačiu tikru account limitu; kiekvienas kvietimas/repair/retry/child įskaičiuojamas. Role pasirinkimas nereiškia, kad jos biudžetas gali finansuoti viešą submission eilę. Serveris tikrina užduoties duomenų gavėją ir dabartinius grants prieš siuntimą, grąžintus IDs — pagal to request snapshot.

Esamas `zero-tool-selector.ts` jau turi pre-dispatch grant/reserve, input/output ir timeout ribas, abstain bei po pasirinkimo atliekamą revocation recheck. Jis dabar pernaudoja esamą Rakazo `readBodyCapped` reader, įskaitant užstrigusio atsakymo atšaukimą. Bendras `zero-systemone.ts` typed choice/noul/score transportas jau pernaudojamas tools, model ir repo selector helperiuose; jo25offline scenarijai PASS.

Rakazo `jev-auto-review.ts` yra naudingas esamas SystemOne/typed-choice pavyzdys, bet naudoja tiesioginį TypeSafe URL ir `TYPESAFE_API_KEY`; tai nėra paruošta naudotojo OpenRouter raktui skirta jungtis. Jo `pass/ask` semantika ir dabartinis rezervavimo kablio nebuvimas neperimami kaip mūsų finansinės ar permissions politikos pakaitalas.

## 5. Kaip pamatuosime, ar apsimoka

Lyginami trys profiliai su tais pačiais brief, repo/source pins, pagrindiniu modeliu ir rezultato acceptance:

1. Pagrindinis modelis su aiškiai apibrėžtu baziniu kontekstu.
2. Indeksas/struktūrinis retrieval be Jev.
3. Tas pats retrieval ir Jev semantinė atranka.

Rodome **visą** užduoties kainą: retrieval/API + Jev + pagrindinis modelis + papildomi kontekstai/taisymai/child/retry. Atskirai rodome kiekvieno modelio tokenus ir tarifus, o ne tiesiog sudedame skirtingų modelių tokenus kaip lygiavertę kainą. Vien bazinio ir Jev profilio palyginimas, praleidus paprastą indeksą, neleistų priskirti taupymo būtent Jev.

Svarbiausi rezultatai: užbaigta teisinga užduotis, reikalingų šaltinių nepraradimas, klaidingi atmetimai, pagrindinio modelio konteksto kiekis, faktinė bendra kaina ir end-to-end p50/p95 laikas. Atskirti cold/warm cache ir LT/EN pradines užduotis; kitų kalbų parengtis neišvedama vien iš UI vertimo. Nesėkmingi ir neaiškiai apmokestinti kvietimai lieka ataskaitoje.

Jev profilis naudingas, jei sutarta rezultato kokybė išlieka ir bendros sąnaudos ar laikas pagrįstai pagerėja prieš retrieval-only baseline. Skaitinio taupymo procento ar pasitikėjimo slenksčio iš anksto nepasirenkame kaip fakto.

- [x] Bendras kelių typed klausimų transportas iš esamų dalių, tikros response schemos ir ribotas kontekstas; patikrinta offline, live suderinamumas dar nepriimtas.
- [ ] Aktualūs OpenRouter model/entitlement/rates ir atskira account grant/biudžetų jungtis; provider receipts/reconciliation.
- [ ] Repo ir dokumentų atrankos fixtures su missing, klaidingai panašiais šaltiniais ir instrukcijų tekstu README.
- [ ] Be-Jev ir su-Jev kokybės/kainos/latency palyginimas pagal visą užduotį; be sugalvotų benchmarkų.
- [ ] UI rodo pasirinktą role/profilį ir realią būseną; prijungtas raktas nerodo dar neįgyvendintos funkcijos kaip ready.

Šie punktai detalizuoja esamus P0.26, P1.5/P1Q ir P2.14 darbus; jų neuždaro ir neprideda neriboto viešo paid intake. Mokamų Jev ir kitų provider calls šiame audite0.

Naudotojo papildytas Auto model reikalavimas taikomas ir OpenRouter, ir oficialiai palaikomai vieno teikėjo OAuth jungčiai, tik jų realiai leidžiamiems modeliams. [Jungtys ir kainodaros ribos](HOSTED-AND-BYOK.md), [tas pats promptas prieš CLI baseline](PAIRED-BENCHMARK.md).

## Dabartinis gyvo prijungimo statusas

Naudotojo pateikta jungtis saugoma tik ignoruojamoje privačioje konfigūracijoje, su repo atrankos role. `npm run check:jev-repo -- --live` realiai iškvietė connection preflight: tinklo tarpininkas OpenRouter nepasiekė, model dispatch attempts0. Rakto tinkamumas, modelio entitlement ir faktinė kaina dar nežinomi. Domeno leidimas išsaugotas tik cloud konfigūracijos juodraštyje; tai ne runtime pakeitimas.

Skriptas naudoja vieną fiksuotą public-source užduotį ir vienkartinį neatsinaujinantį ledger: daugiausia1model dispatch, jokių retry.0.10USD/16000tokenų rezervas yra konservatyvus vietinis rezervas, ne įrodytas provider invoice ceiling ar visų tos paskyros raktų spend enforcement. Dabartiniai coding eksperimentai naudoja oficialų Claude CLI su prenumerata; Codex auth ir OpenRouter/Jev lenktynės šiam etapui atidėtos. [Viena patikrinta Claude katalogo konteksto pora](CLAUDE-CALIBRATION.md) Jev naudos nematuoja. Kartotinius tikrus palyginimus valdys [Zero Lab](ZERO-LAB.md).
