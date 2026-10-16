# Papildomi kandidatai ir licencijos blokai

## Inbox Zero — vertingas email produkto etalonas

Tyrimas **2026-10-16, Europe/Kiev**. Būsena: **source-available / reference-only / license-blocked** numatytam besąlygiškam open-source platinimo modeliui. Šis įrašas neįskaitomas į100 atrinktų projektų ar veikiančių integracijų skaičių. [Pilna struktūrinė kortelė](../../catalog/supplemental.json).

1. **Pavadinimas:** [elie222/inbox-zero](https://github.com/elie222/inbox-zero), skaitytas SHA `f482190a12aa5708f67d64a4f088b96d7029741f`.
2. **Paskirtis:** AI el. pašto asistentas ir atskirai naudojamas Gmail/Outlook klientas.
3. **Naujas gebėjimas:** taisyklių pagrįstas rūšiavimas, atsakymų juodraščiai, gijų kontekstas, priminimai, priedų tvarkymas ir email darbo eigos.
4. **Užduotis:** „Sintetiniame inbox suklasifikuok laiškus ir sukurk atsakymų juodraščius, nieko nesiųsdamas.“
5. **Kodėl svarbus:** vartotojo radinys užpildo email sritį ir turi vietinius provider, billing bei LLM emuliatorius. Emuliatoriai leidžia planuoti bandymus be tikros pašto dėžutės; dabartiniame tyrime jų nepaleidome.
6. **Alternatyva:** mūsų plonas Gmail API / Microsoft Graph adapteris. Jis būtų siauresnis ir lengvesnis, bet reikėtų kurti threading, token refresh, webhook/notification ir idempotency dalis.
7. **Integracija:** oficialus MCP HTTP kelias arba atskiras vartotojo teisėtai naudojamas servisas. Atskiras procesas nepanaikina produkto licencijos sąlygų. Kodo kopijavimas į mūsų core dabar neplanuojamas.
8. **Kalbos, OS, priklausomybės:** TypeScript, Next.js, Prisma/PostgreSQL, Redis/Upstash modelio adapteris, Turborepo; README vietinei plėtrai nurodo macOS arba Linux/Windows WSL, Node 24 ir pinned pnpm. Web/Electron prieinamumas aprašytas autorių; native iOS source pagal README dar neviešas.
9. **Resursai:** tikri CPU/RAM/disko minimumai nepatikrinti; pilnos app/DB/cache/emuliatorių aplinkos kaštas turi būti pamatuotas. Projektuojamas testinis rezervas4 CPU/8 GiB nėra upstream minimumas ar matavimo rezultatas.
10. **Licencija:** root LICENSE turi AGPLv3tekstą ir **papildomas komercinio monetizavimo bei enterprise sąlygas**. Monetizuoti programą/paslaugą ar įtraukti į parduodamą produktą reikia rašytinio leidimo; organizacijoms su 5ar daugiau nurodyto verslo naudojimo dalyvių aprašytas enterprise reikalavimas. Išimtys personal/education/research ir mažesnėms organizacijoms nurodytos tame pačiame tekste. Tai žymime `LicenseRef-Inbox-Zero-commercial-enterprise-restricted`, ne įprasta AGPL-only OSI licencija.
11. **Išoriniai reikalavimai ir kaina:** tikram Gmail/Outlook darbui OAuth ir provider paskyros, pasirinktas modelis, saugojimas ir operatorius; mokamos funkcijos ir teisės tikrinamos atskirai. Vietinis emuliatorius pagal autorius nereikalauja tikrų API raktų, bet atsakymai canned ir nematuoja modelio kokybės. Kainos šiuo metu nepatvirtintos.
12. **Brandos požymiai:** perskaityti README/LICENSE/package.json/CI šaltiniai ir konkretūs MCP/provider/confirmation/send įėjimai; jų buvimas neįrodo naujausių testų sėkmės ar visų formatų suderinamumo.
13. **Apribojimai:** email tekstas yra nepatikima įvestis; scopes ir tikri provider OAuth leidimai gali būti platesni už vieno MCP tool leidimą; autentiškas mailbox draft jau yra išorinis write, pending chat patvirtinimas dar nėra išsiųstas laiškas.
14. **Sudėtingumas:** didelis dėl OAuth, jautraus turinio, webhook/batch/idempotency, atskirų draft/send kelių, pilnos app eksploatavimo ir licencijos sprendimo.
15. **Prioritetas ir balas:** P2 reference tyrimui; licencijos fit **0/10** numatytam besąlygiškam platinimo modeliui. Kitų dokumentinio fit dalių skaičiai saugomi papildomame JSON; jie nepanaikina šio bloko. Source/API faktų pasitikėjimas vidutinis, runtime žemas/NOT_RUN.
16. **Šaltiniai:** [README](https://github.com/elie222/inbox-zero/blob/f482190a12aa5708f67d64a4f088b96d7029741f/README.md), [pilnas LICENSE](https://github.com/elie222/inbox-zero/blob/f482190a12aa5708f67d64a4f088b96d7029741f/LICENSE), [MCP HTTP route](https://github.com/elie222/inbox-zero/blob/f482190a12aa5708f67d64a4f088b96d7029741f/apps/web/app/mcp/route.ts), [nepriklausoma kodo peržiūra ir likę šaltiniai](../reviews/architecture-independent.md).

### Pirmas būsimas email profilis

- [ ] Patikrinti licencijos ir konkretaus vartotojo naudojimo modelio tinkamumą arba pasirinkti nuosavą ploną provider adapterį.
- [ ] Offline/sintetiniai laiškai, be tikro siuntimo ir be realių klientų duomenų.
- [ ] Tikslus MCP tool discovery ir `mcp:read`/`mcp:write`/`mcp:send` atskyrimas.
- [ ] Atskirai audituoti tikrus Gmail/Graph OAuth scopes; read-only tool UI nesumažina provider tokeno teisių.
- [ ] Draudžiamas `send_mail` ir visi netiesioginiai send/unsubscribe/archive keliai read/draft profilyje, kol nėra atitinkamo grant.
- [ ] Testuoti draft sukūrimą kaip write su receipt, idempotency ir read-back.
- [ ] Tikram siuntimui atskira paskyros/gavėjo/turinio patvirtinimo patikra ir `unknown_after_timeout` reconciliacija; neaiškaus send aklai nekartoti.
- [ ] Prompt injection, private-data export, token revocation, restart ir duplicate-delivery testai.

Abiejų agentų bendra išvada: verta tirti email UX ir domeno sprendimus; bazinio produkto priklausomybei reikia išspręsti licencijos ir leidimų modelį. Integracijos ir susirašinėjimas su šiuo projektu ar paslaugomis šiame darbe neatlikti.
