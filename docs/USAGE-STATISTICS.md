# Vietinė ir bendra įrankių naudojimo statistika

> **Planuojama produkto specifikacija · peržiūrėta 2026-10-17.** Aprašo siekiamą elgesį; schemų pavyzdžiai ir maketai savaime nėra įgyvendintos funkcijos. Daliniai foundation komponentai nekeičia viso vartų statuso. Datuotos įgyvendinimo pastabos žemiau nėra atnaujinta būsenos suvestinė; senos kainų/auth/source prielaidos tikrinamos prieš realų profilį. Dabarties autoritetas: [būsena](IMPLEMENTATION.md), [priimta architektūra](DECISIONS.md), [roadmapas](../ROADMAP.md).

Plano 0.2 reikalavimas, 2026-10-16. **Suprojektuota, NOT_RUN**: counters, collection server ir dashboard dar nesukurti. Tikslas – matyti realų modulių / įrankių naudojimą, padėti atrankai ir viešai parodyti platformos ekosistemos augimą.

Naudojimo faktų pavertimas konkrečių versijų kokybės įrodymais ir upstream/RepositoryZero pataisų ciklas aprašytas [bendruomenės kokybės modelyje](COMMUNITY-QUALITY.md). Populiarumo skaitiklis savaime nesuteikia `verified`; abi projekcijos remiasi tais pačiais vykdymo faktais.

## 1. Du vaizdai

**Vietinis Usage:** naudotojo instaliacijoje skaičiuojami užduoties / projekto moduliai, tool calls, modelio usage, klaidos, trukmė ir žinoma kaina. Tai vietinio execution/effect/budget ledger projekcija; programa turi šiuos faktus darbų tęstinumui ir cap apskaitai. Vien vietinis skaitiklis nieko neviešina.

**Bendra svetainės statistika:** įjungus atskirą minimalios diagnostikos / usage sharing pasirinkimą, klientas siunčia ribotus dienos agregatus. Centriniai operatoriaus CI/canary/discovery vykdymai turi atskirą pažymėtą skaitiklį. Be pasirinkto klientų siuntimo negalime žinoti visų jų veiksmų; svetainė rodo matomos imties dydį ir aprėptį. Prisidėjimo režimas, produkto auto-update, donorystė ir usage sharing yra atskiri nustatymai.

## 2. Ką skaičiuojame

| Matmuo / metrika | Apibrėžimas |
|---|---|
| Modulis / capability / įrankis | Stabilūs vieši registry IDs ir release; bibliotekos įdiegimas nėra vartotojo tool call |
| Modeliai / gateway | Provider/method/model bendras viešas profilis, kai leista; Treg gateway call atskirtas nuo konkretaus catalog provider+endpoint ir jo semantikos |
| Tool pradžia ir baigtis | Loginio kvietimo skaičius, atskirai attempt/retry, succeeded/failed/canceled/blocked/unknown; ta pati retransmisija nesukuria antro įvykio |
| Naudoję klientai | Apytikslis opted-in aktyvių instaliacijų skaičius tame laikotarpyje, ne žmonių skaičius ir ne visų programos instaliacijų inventorius |
| Užduoties rezultatas | Verified/partial/failed tik pagal tikrą task validator; sėkmingas HTTP atsakymas nėra patikrinta užduoties sėkmė |
| Trukmė ir patikimumas | Histogram / mergeable bucket skaičiai ir imtis; p50/p95 skaičiuoti iš bendro pasiskirstymo, ne vidurkinant klientų p95; timeout/retry/failure atskirai |
| Kaina / usage | Vietoje actual tokens/API/compute ir šaltinis; viešai tik atskirai pasirinktas pakankamai agreguotas rodiklis su known/unknown aprėptimi, valiuta ir rate-card data |
| Laikotarpis |7d/30d/90d ir datuota since-start istorija; apibrėžimas / rinkimo versija bei paskutinis atnaujinimas |
| Vykdymo rūšis | Real user task / contributor improvement / synthetic eval / maintainer CI; šių srautų nemaišyti į vieną reklaminį naudojimą |

Treg katalogo search/get ir vykdomas endpoint call nėra tas pats. Vienas gateway request neskaičiuojamas kaip tūkstančiai panaudotų įrankių. Tool IDs turi serverio tapatybę ir schema versiją; privataus custom įrankio vardas neeksportuojamas. Tarp skirtingų užduočių / versijų populiarumas lyginamas tik su aiškiu vardikliu.

## 3. Viešas dashboard

- Populiariausi moduliai pagal opted-in aktyvias instaliacijas ir realius loginius kvietimus; du atskiri rūšiavimai.
- Augantys gebėjimai per7/30dienų su imties riba ir aiškia procento baze.
- Sėkmės / failure / retry / unknown pasiskirstymas su versija, OS grupe ir konteksto ribomis.
- Laiko ir, kai dalijamasi ir patikimai apskaityta, kainos intervalai. Nežinomas tarifas nerodomas kaip0.
- Instaliuotas / aktyvuotas / panaudotas modulis atskirai; installed count turi tik opt-in arba operatoriaus instaliacijų aprėptį.
- Source-only kandidatų ir runtime recommended modulių aiškus atskyrimas; stars, donorystė ir naudojimas nėra acceptance badge.

Puslapio antraštė yra „Naudojimas mūsų platformoje“ su duomenų aprėptimi. Ši imtis negali būti vadinama viso pasaulio AI tools naudojimo reitingu. Bendra sėkmė tarp skirtingų užduočių yra stebėtas rodiklis, ne sąžiningas įrankių kokybės benchmark; konkrečiai atrankai lieka vienodi domeno testai. Naujas retai naudojamas įrankis nėra automatiškai blogesnis.

## 4. Minimalus duomenų srautas

Execution ledger → vietinis daily aggregator → peržiūrimas allowlisted payload → batch upload su backoff → atskiras centrinis stats ingest → dedup / validation → agregatai → patikrintas public export → svetainė. Registry rekomendacijos ir merge/updater trust negauna teisių iš stats serverio.

Į payload nepatenka prompts, arguments/results turinys, source kodas, dokumentai, pilni URL, failų keliai, paskyrų vardai, el. paštas, credential ar project/task ID. Leidžiami vieši modulio/tool ID, bendra platformos grupė, dienos intervalas, rinkimo schemos versija, riboti counters/buckets ir pasirinktų metrikų flags. Klientas prieš upload gali parodyti tikslų payload ir valdyti sharing; išjungus nebesiunčia ir išvalo neperduotą buffer.

Replay/dedup naudoja report ID ir riboto laikotarpio pseudoniminę instaliacijos žymą. Ji nėra žmogaus tapatybė, bet tai **nėra įrodytas anonimiškumas**: galimas susiejimas ir tinklo metaduomenys aprašomi privatumo politikoje. Agreguoti skaičiai, pseudonimas ir IP adresas nėra sinonimai. Serveris neturi saugoti ilgalaikio IP kaip viešo naudotojo ID; ingress log retention ir prieiga aiškiai ribojama. Siūlomas pirminių report dedup langas30dienų, po jo lieka tik reikalingi dienos agregatai; faktinis retention užfiksuojamas prieš įjungimą.

Pseudonimų rotacija ir tik daily agregatai neleidžia pateikti tikslaus7/30/90dienų unikalių instaliacijų skaičiaus vien sudedant daily uniques. Rodomas aiškiai apytikslis įvertis pagal paskelbtą metodą arba „aktyvių instaliacijų dienos“; tikslaus period unique teiginio be tam tinkamo privatumo/protokolo sprendimo nėra.

Viešos smulkios eilutės slepiamos / jungiamos, kol nėra siūlomo bent20 besidalijančių instaliacijų slenksčio konkrečiam segmentui. Slėpimo slenkstis mažina atsekamumą, bet nesuteikia formalios anonimybės. Privačių / custom modulių vardai nepasirodo net pasiekus slenkstį. Viešai skelbiamas mažų imčių nebuvimas ir apytiksliai aktyvių klientų skaičiai, jei naudojama pseudonimo rotacija.

## 5. Tikslumas ir apsauga nuo išpūtimo

Report schemas, byte/counter bounds, idempotency/dedup ir server-side limits privalomi. Offline/sleep batch retransmisija nekeičia laikotarpio ir nedvigubina įvykių. Krentantis procesas tarp call start/result neperrašomas kaip sėkmė. Visų attempts ir loginių calls skaičius atskiriamas, kad retry audra neatrodytų naujų klientų augimu.

Po30dienų uždaromas report priėmimo / taisymo langas: per seni arba nepagrįstai ateities report nebesumuojami, todėl išvalyto dedup ID replay negali papildyti istorijos. Lango viduje tos pačios instaliacijos/periodo/rinkimo versijos report revision pakeičia ankstesnį agregatą su kontroliuojama delta, o ne prideda visą sumą dar kartą. Išskirtinis istorijos backfill turi operatoriaus patikrintą atskirą dataset revision ir viešą korekcijos žymą; modelis pats lango neatidaro. Tikslūs cutoff ir collision invariantai yra P2S kontrakto vartai.

Kliento atsiųstas skaitiklis yra **client-reported**; atvirą desktop klientą galima pakeisti, todėl jo signature ar installation token neįrodo realaus žmogaus darbo. Operator-controlled/canary faktai ir, jei prieinami, broker-observed įvykiai žymimi atskiru provenance. Rate limits ir anomalijų filtras mažina išpūtimą, bet negarantuoja Sybil-free rinkos reitingo. Publikuoti atmetimų metodą, duomenų vėlavimą ir reikšmingus backfill / metodikos pokyčius.

Agentai naudoja stats atrankos prioritetui, regression ir nenaudojamų modulių peržiūrai. Jie negali sumažinti acceptance, pašalinti duomenų ar padidinti savo compute biudžeto vien dėl didelio usage. Dashboard generavimo LLM nekeičia skaitiklių; skaičiuoja deterministinis aggregator, agentas tik rengia į faktus susietą santrauką.

## 6. Roadmap ir priėmimas

- [ ] P1S: vietinis module/tool/model usage ledger ir dashboard, sutampa su tikrais task/effect/budget įrašais.
- [ ] P1S: loginiai calls vs retries ir succeeded/failed/unknown, faktiškai žinoma kaina; Treg gateway/catalog/endpoint atskyrimas.
- [ ] P2S: aiškus opt-in, payload preview, viešų ID allowlist, private/secret canary ir retention konfigūracija.
- [ ] P2S: batch/replay/dedup, offline/restart, invalid reports ir bounded ingest; local task nenutrūksta dėl stats outage.
- [ ] P2S: server aggregate ir viešas dashboard su min sample/provenance/coverage; synthetic CI neišpučia real user top.
- [ ] GW1: svetainės counters ir tekstas atitinka tą pačią faktinę versijuotą agregatų ataskaitą; nėra išgalvoto global market claim.

Pradinis oficialus puslapis gali rodyti „duomenys dar nerenkami“ arba tik aiškiai pažymėtą operatoriaus testų imtį. Nulinė ar neegzistuojanti naudotojų imtis nepakeičiama demonstraciniais skaičiais. Viešos usage lentelės atsiranda su realia įgyvendinta apskaita, ne vien šiuo planu.
