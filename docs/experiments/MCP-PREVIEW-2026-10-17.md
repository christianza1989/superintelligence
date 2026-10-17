# MCP discovery preview ir pirmas native Codex ryšys

2026-10-17. Įgyvendintas vietinis read-only serveris ir tikrais naujo Codex pokalbio MCP kvietimais patvirtintas discovery ryšys. Tai nėra viso MVP, komponento integracijos ar palyginamo greičio/kainos įrodymas.

## Faktiniai įrodymai

| Patikra | Rezultatas ir riba |
|---|---|
| Native kliento kvietimai | zero_status, zero_search ir zero_inspect įvykdyti kaip MCP tools; shell/SDK imitacija nenaudota |
| Status probe | Serveris repositoryzero 0.1.0, schema 1.0.0; nonce grąžintas identiškas, checkedAt 2026-10-17T13:48:07.233Z |
| Katalogas | 796 įrašai, 2026-10-16 snapshot; SHA256 2938ad320a4ea4af68d4177fc5cb09fe40f505431c666c854b1a8a1f51011f15 |
| Search ir inspect | playwright → microsoft/playwright; source pin e139b837c20440925dafe0ca91735a003517a3bc; source-only, licenseApproved=false, runtimeTested=false |
| Host profilis | Windows desktop → WSL Linux STDIO; lokaliai stebėtas OpenAI.Codex paketas 26.1007.9446.0 ir Node 24.19.0. Tai vienas development profilis, ne visų versijų/OS palaikymas |
| Modelio naudojimas | Naujam pokalbiui pasirinktas GPT-6.1-sol/high; provider model receipt, tokenai ir tikslus prenumeratos mokestis neišgauti, todėl unknown |
| Darbo riba | Serveris discovery-only, execution backend unavailable. Projekto failų, paruošimo ar verify įrankių šis serveris neteikia |

Native įvykių ataskaitoje trijų tool kvietimų trukmės buvo 27/11/8 ms. Tai konkrečių tool įvykių metrika, ne bendras setup/modelio/workflow laikas ir ne greičio palyginimas. Pirmame probe negotiated protocol neišgautas; serverio SDK pin 1.30.0 nėra protocol version.

Po WSL aplinkos persikrovimo ankstesnio pokalbio trys kvietimai grąžino Transport closed. Šis FAIL išsaugotas; ankstesnis PASS nėra dabartinio transporto veikimo garantija. Aplinkos persikrovimo priežastis nenustatyta.

Atskirame naujame Codex pokalbyje visi trys tikri MCP kvietimai vėl PASS: serveris **0.1.1**, schema **1.1.0**, tikras initialize metu sutartas **protocol 2025-06-18**, checkedAt **2026-10-17T14:07:09.676Z**, tas pats katalogo hash ir 796 įrašai. Naujo nonce sutapimas patvirtintas. Tool įvykių trukmės 263/224/26 ms; tai nėra palyginamas modelio ar projekto laikas. Seno pokalbio transportas automatiškai neatkurtas; išbandytas naujas procesas, ne patvaraus job restart recovery.

Prijungimas yra projekto vietinėje konfigūracijoje, ne globalus kitų projektų pakeitimas. Privatūs keliai, sesijos duomenys ir visas pokalbio trace į Git neperkelti. Viešam A/B vis tiek reikia patikrinti A startup inventorių ir iš tiesų išjungti Zero metadata.

## Regresijos ir rastos klaidos

SDK transporto bei tikro proceso testai tikrina initialize/list/call, griežtą įvestį, visus katalogo ID, UTF-8 atsakymų ribas, source/no-fit faktus, EOF ir klaidingus paleidimo argumentus. Papildoma peržiūra aptiko ir regresijomis uždengė:

- klaidingo JSON atveju likusį atvirą stdin;
- stdout EPIPE, kuris anksčiau galėjo išspausdinti vietinių kelių stack;
- SDK nežinomo ilgo tool vardo atspindėjimą už atsakymo ribos;
- operatoriaus snapshot root /mnt leidimą, apeinant deklaruotą Windows mount ribą.

Nesėkmingi kūrimo bandymai išsaugoti vietiniuose vykdymo įrašuose. Pataisos nekeičia užšaldytų ankstesnių CLI kohortų. Naujas request-scoped observer turi atskirą 125 testų conformance: vienas callId prieš dispatch ir usage, lygiagrečių runs atskyrimas, onUsage apskaitos autoritetas, denial=0 dispatch. Tai OBS1, ne OBS2 trusted-account/budget integracija.

## Kas dar atvira

Linux snapshotter yra ribotas failų kopijavimo pagrindas; jam dar reikia tikro principal/grant/expiry/revocation ir MCP roots binding. Read-only failų teisės nėra hostile same-user izoliacija.

CSV paruošimo job naudoja tą pačią Graphile eilę ir versijuotus Artifact įrašus; atskirame testiniame PostgreSQL įrodytos paruošimo, dubliavimo ir atšaukimo baigtys. Tai nėra užbaigtas host projekto snapshot → integracija → nepriklausomas verify kelias. Application API papildomai patikrinta šešiais tikro BetterAuth/PostgreSQL/application worker testais: session cookie ir Bearer kelias, idempotency, bounded hash-checked artifact puslapiai, atšaukimas, svetimas/expired/revoked scope, worker authorization ir 0 model UsageRecord. Operator authorizer nepriskirtas pagal nutylėjimą: execution lieka blocked. Pilni crash/lease-expiry, staged-byte cleanup ir MCP/backend restart vartai atviri.

Plugin paketas, website install mygtukai, Claude Code ryšys, formalios native A/B poros ir pakartojama nauda dar neatlikti. [Vietinis setup](../MCP-SETUP.md), [MCP planas](../MCP-INTEGRATION.md), [native A/B metodas](../NATIVE-CODEX-BENCHMARK.md), [checkboxų būsena](../../ROADMAP.md).
