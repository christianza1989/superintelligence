# Pirmas gyvas Jev worker profilis

2026-10-17, 16:02:29–16:02:34 UTC. **Trys kūrimo conformance atvejai PASS.** Tai vieno riboto profilio veikimo patikra, ne greičio, kokybės ar kainos pranašumo tyrimas.

Oficialus System One endpoint `https://openrouter.ai/api/v1/systemone`, prašytas modelis `typesafe/jev-1.13`; tiekėjas visuose trijuose atsakymuose nurodė **TypeSafe / typesafe/jev-1.13-20260917**. Kiekvienas užsakymas turėjo vieną Choice klausimą ir tą patį mažą CSV / JSON / abstain rinkinį. Į Jev siųstas tik sintetinis užduoties tikslas ir tool aprašymai; vietinis duomenų failo turinys nebuvo perduodamas.

| Atvejis | Faktinis sprendimas ir rezultatas | Visas atvejo laikas | Input / output tokenai | Tiekėjo usage kaina USD |
|---|---|---:|---:|---:|
| CSV | csv.parse → tikras pinned d3-dsv vykdymas, expected rows sutapo | 1553 ms | 418 / 43 | 0.000017556 |
| JSON | json.normalize → tikras rekursinis raktų rikiavimas, expected JSON sutapo | 1450 ms | 417 / 43 | 0.000017514 |
| Netinkama 3D užduotis | abstained, nė vienas tool nevykdytas | 1278 ms | 426 / 44 | 0.000017892 |

Iš viso **3 dispatch attempts, 1261 input ir 130 output tokenų, 0.000052962 USD** pagal provider `usage.cost`. Visas kvalifikacijos etapas nuo report sukūrimo iki pabaigos truko **5148 ms**, neįskaitant ankstesnio dependency / DB setup. Atvejų laikai apima job enqueue/poll, worker, grant/credential patikras, public pricing patikrą, tool ir receipt; tai nėra gryna Jev inferencijos latencija. Cache tokenų šaltinis negautas — unknown. Coding modelio kvietimų šiame profilyje 0; native host prenumeratos sąnaudos į šią kainą neįeina.

## Autoritetas ir biudžetas

Naudotas esamas Graphile worker, versijuotas Artifact request/receipt, bendras SecretStore ir scoped generic UserModelCredential / SpaceModelPreference. Privatus operator profile nustatė vieną mokėtojo allocation ir routing lane visiems trims atvejams. Originalus principal ir jungties digest tikrinti prieš privatų skaitymą, rezervą, dispatch, tool ir sėkmės publikavimą. Renderer/tool įvestis nepateikia payer, modelio ar rakto.

Tas pats call ID susiejo kiekvieną DB account/lane rezervą, istorinį bendrą ledger rezervą, awaited `recordUsage` ir immutable receipt. Po užbaigimo pakartotas tas pats idempotency key grąžino tą patį job be naujo modelio kvietimo. Kiekvienam atvejui DB išsaugojo po vieną usage įrašą.

Prieš kiekvieną mokamą dispatch patikrinta [oficiali endpoint kainodara](https://openrouter.ai/api/v1/models/typesafe/jev-1.13/endpoints): prompt 0.000000042 USD/token, completion 0, context ne daugiau kaip 262144, papildomų nežinomų kainos laukų nepriimta. Vieno pilno konteksto teorinis input rezervas su apvalinimu 11011 USD mikro vienetų; rezervuota konservatyviai 100000. Šis datuotas vieno klausimo profilio įvertis nėra bendros provider sąskaitos garantija. [Oficialus modelio puslapis](https://openrouter.ai/typesafe/jev-1.13), [System One sąsaja](https://openrouter.ai/docs/guides/community/jev).

Istorinis **1 USD leidimas neatstatytas**. Septyni ankstesni 0.10 USD neaiškūs rezervai palikti; pridėti trys po 0.10 USD su tiksliais dabartiniais call ID. Ledger dabar turi 10 held_pending_reconciliation rezervų, iš viso **1 USD rezervuota**. Tai nėra teiginys, kad išleistas 1 USD. Nauji mokami bandymai šiuo ledger šiuo metu neleidžiami; žinomos trijų kvietimų sąnaudos automatiškai neatlaisvino rezervų. Privati pirminė ataskaita ir DB/artefaktų įrodymai išsaugomi už Git ribų.

## Neigiamos kontrolės ir ribos

Offline provider regresijos ir tikras PostgreSQL/Graphile tikrina schema / unknown ID / timeout, cap0, konkuruojančius worker su tuo pačiu account, revoked grants prieš privatų skaitymą ir po staging, usage sink failure, nežinomą usage bei crash-gap invocation replay be redispatch. API papildomai turi 12 tikrų BetterAuth/private-policy/encrypted-credential atvejų. Emuliuotas provider šiose kontrolėse aiškiai atskirtas nuo trijų gyvų teigiamų / no-fit kvietimų.

Trijų lengvų atvejų imtis nepatvirtina bendro selection tikslumo, kalbų palaikymo, sutaupymo ar geresnio coding. Užšaldytas B prieš B+Jev C palyginimas J3 dar neatliktas. Mokami fallback/child neįjungti. Nauja API jungtis, pilnas native host workflow, likę G0/G1/G2 ir viso MVP vartai turi atskiras patikras.

Pakartojimo įėjimai: `test:jev`, `test:jev:pricing`, izoliuotoje testinėje DB `test:jev:postgres` ir `test:jev:composition`. Pastarasis naudoja tik emuliaciją ir atskirą sintetinį ledger, mokamų kvietimų 0. `qualify:jev:live` reikalauja aiškaus `--live`, dedicated DB, privataus API binding ir originalaus istorinio ledger; vien komandos buvimas nesuteikia naujo cap.
