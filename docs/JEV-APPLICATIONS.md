# Jev rolė RepositoryZero

2026-10-17. Jev — siauras struktūrizuoto pasirinkimo adapteris po deterministinio retrieval. Jis nėra pagrindinis coding modelis ar naujas scheduler. Branduolys išlieka provider-neutral; naudotojo pasirinktam MVP profiliui reikia tikro Jev/OpenRouter ToolSelector.

| Vartas | Faktinė būsena | Priėmimas |
|---|---|---|
| J0 adapteris | Offline selector ir bounded response primityvai yra, bet tolesnė kvalifikacija atvira | Shortlist-only IDs, abstain, schema/timeout/grant kontrolės ir worker kontraktas |
| J1 pasirinktas profilis | Standalone Lab kvietimai buvo; produkto profilis dar nekvalifikuotas | Tikras connection/model/auth, patikimas account, baigtinis routing cap ir bendras account rezervas |
| J2 live conformance | Atvira | Worker sprendimas lemia tikrą leistino tool naudojimą; positive ir no-fit, timeout/schema/cap, usage receipts. Baseline, CLI rekomendacija ar visiškas abstain nepakanka |
| J3 palyginimas | Papildoma produkto nauda neįrodyta | Užšaldyto B prieš tą patį B+Jev C kokybė, aprėptis, klaidingi pasirinkimai, visas laikas ir kaina; priimtina sąžininga išvada „naudos nenustatyta“ |

Pirmas matuojamas darbas: vienam konkrečiam poreikiui iš mažo prasmingo paruoštų tools rinkinio pasirinkti vieną alternatyvą arba abstain. Kartu naudotini komponentai nėra klaidingai pateikiami kaip tarpusavyje nesuderinamos alternatyvos. Jev negali suteikti leidimo, pakeisti hard constraints ar padaryti source-only kandidatą vykdomu.

Repo relevance, konteksto fragmentų ir testų atranka — vėlesni atskiri profiliai. Automatinį pagrindinių coding modelių keitimą atidėti, kol yra palyginamų profilių matavimai. Score, confidence ir modelio savivertė nėra bendras repo kokybės įrodymas.

Kiekvienam dispatch tas pats call ID sieja request, rezervą, faktinį usage ir decision receipt. Account nustato trusted connection resolver. Mokėtojo account cap bendras visiems jį naudojantiems modeliams, routing turi papildomą ribą; rezervas nepakeičia tikros provider sąskaitos. Nepatvirtinti fallback/paid child keliai išjungti. Dabartinis `AgentRunModel.accountId` yra gateway laukas — ne universalus mokėtojo ID.

[Profilio kvalifikacija](ROUTER-EVALUATION.md), [metodas ir rezultatai](CALIBRATION.md), [budget foundation ribos](BUDGET-FOUNDATION.md), [Astra patikslinimas](audits/2026-10-17-astra/REVIEW-REPLIES.md). Ankstesnis visas Jev source tyrimas su datuotais NOT_RUN išsaugotas [karantine](quarantine/README.md). Jo senas „nėra rakto / live nebandyta“ netaikomas vėlesniems standalone Lab kvietimams, bet J2 vis dar atviras.
