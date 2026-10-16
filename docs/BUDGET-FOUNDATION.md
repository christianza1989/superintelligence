# Pirmas patvaraus biudžeto pjūvis

2026-10-16. **Įgyvendintas ir su tikra vienkartine PostgreSQL išbandytas konservatyvus rezervavimo ledger. Mokamas Jev ar pagrindinio modelio vykdymas neįjungtas.** Tai [viso biudžetų brokerio](INTAKE-AND-BUDGETS.md) dalis, ne viso jo priėmimas.

## Kas veikia

`platform/packages/db/src/zero-budget.ts` saugo baigtinį bendros paskyros allocation ir atskirus darbų srautų (lane) allocation: kvietimų skaičių, USD mikro vienetus ir tokenų rezervą. Sumos yra sveikieji skaičiai, pinigai/tokenai — `bigint`; DB turi papildomas ribų patikras.

Prieš išduodant vienkartinį leidimą, vienas DB sandoris:

1. Užrakina bendrą account įrašą, po jo konkretaus lane įrašą.
2. Patikrina abiejų įrašų būseną ir visas tris ribas.
3. Įrašo globaliai unikalų invocation ID ir abu rezervų nurašymus.
4. Patvirtina sandorį; tik tada grąžina rezultatą.

Skirtingi workeriai ir DB connection pools naudoja tą patį paskyros užraktą. Pasikartojantis invocation ID visada atmetamas, net jei prašoma kita suma ar kita paskyra; ankstesnis leidimas negrąžinamas pakartotiniam dispatch. Dalinė SQL klaida atšaukia ir invocation, ir abu nurašymus. Prarastas commit patvirtinimas nesukuria naujo leidimo ar automatinio retry.

Rezervas neturi automatinio galiojimo pabaigos ar refund. `hold()` idempotentiškai pažymi išlaikomą rezervą, nedidina prieinamo likučio. Pakartotinis prisijungimas, sena įrašo data ar pakartotas pradinės konfigūracijos kūrimas likučio neatkuria. Konfigūracija yra insert-only; šis modulis neturi agento tool ar viešo HTTP veiksmo limitams kelti.

Sąsaja `{ invocationId, hold() }` struktūriškai tinka neaktyvaus Jev adapterio rezervavimo kabliui. Tai dar nėra visų modelių vykdymo kelių sujungimas su šiuo ledger.

## Kokios išlygos svarbios

- Tai **vienkartinis baigtinis allocation be automatinio atsinaujinimo**, ne dienos/mėnesio periodų sistema. Tai sąmoningai konservatyvus pirmas žingsnis; neaiškūs rezervai lieka sunaudoję limitą iki būsimos patikimos reconciliacijos.
- `accountId` turi ateiti iš patikimos jungties konfigūracijos ir žymėti tą pačią realią provider paskyrą visuose jos modeliuose/darbuose. Naujas savavališkas ID kiekvienai užduočiai apeitų tokios paskyros bendrą politiką. Tikras jungties susiejimas dar neįgyvendintas.
- Rezervavimo sumas dabar pateikia patikimas caller. Ledger riboja šiuos rezervus; vienas jis **neįrodo provider sąskaitos viršutinės ribos**. Reikia patikrintų tarifų/billing semantikos ir realių input/output/reasoning limitų prieš dispatch.
- Trūksta provider requestID/usage kvitų, saugios reconciliacijos, laiko langų, concurrency/lease/fence politikos ir visų mokamų pagrindinio modelio, retry, child, embedding bei routing kelių integravimo. Esami grants ir duomenų gavėjo patikra taip pat būtini atskirai.
- Rezervas neperduoda modelio paskyros paslapčių ir nesuteikia teisės vykdyti įrankio. Mokamų ryšių aktyvacija lieka uždaryta.

## Patikros įrodymai

`npm run test:budgets` per tą patį izoliuotą runnerį sukuria vienkartinę loopback PostgreSQL bazę, pritaiko migracijas, vykdo tiksliai6scenarijus ir pašalina tik savo bazę. Pagrindinė bazė ar jos volume neištrinami, modelių raktai neperduodami, mokamų kvietimų0.

- [x] Konkuruojančios rezervacijos iš dviejų pools neviršija bendro kvietimų limito, net kai naudojami skirtingi lane.
- [x] Lane/token ribos nepalieka account nurašymo; sintetinė SQL klaida po account update atšaukia abu nurašymus ir invocation.
- [x] Tas pats invocation ID per dvi paskyras suteikia tik vieną naują leidimą.
- [x] `hold()` ir rezervas išlieka po reconnect; pakartotas bootstrap ar sena data limito neatkuria.
- [x] Nekonfigūruotas, išjungtas ir nulinis allocation bei netinkamos sumos neatlieka nurašymo.
- [x] Konkuruojantys pinigų rezervai telpa į baigtinę paskyros ribą, įskaitant tikslų likutį.

DB ir adapterių TypeScript patikros PASS. Reconnect nėra pilno proceso, DB konteinerio ar Graphile crash-restart įrodymas. Visos produkto [MVP roadmapo](../MVP-ROADMAP.md) acceptance užduotys ir realios sąnaudos dar nepriimtos.
