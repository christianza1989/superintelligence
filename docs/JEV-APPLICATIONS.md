# Jev rolė RepositoryZero

2026-10-17. Jev — siauras struktūrizuoto pasirinkimo adapteris po deterministinio retrieval. Jis nėra pagrindinis coding modelis ar naujas scheduler. Branduolys išlieka provider-neutral; naudotojo pasirinktam MVP profiliui reikia tikro Jev/OpenRouter ToolSelector.

| Vartas | Faktinė būsena | Priėmimas |
|---|---|---|
| J0 adapteris | Esamo worker schema/grant/usage/budget kontraktas ir neigiamos offline/PG kontrolės PASS | Shortlist-only IDs ir abstain nesuteikia leidimo; fallback/child išjungti |
| J1 pasirinktas profilis | typesafe/jev-1.13 vieno klausimo live profilis patikrintas; originalus 1 USD ledger dabar pilnai rezervuotas | Nauji mokami bandymai blocked iki patikimos reconciliacijos ar naujo aiškaus leidimo, ne automatinis cap reset |
| J2 live conformance | CSV, JSON ir prasmingas no-fit per tikrą Graphile worker 3/3 PASS | Tai trys kūrimo atvejai, ne bendras selection tikslumas ar naudos tyrimas |
| J3 palyginimas | Papildoma produkto nauda neįrodyta | Užšaldyto B prieš tą patį B+Jev C kokybė, aprėptis, klaidingi pasirinkimai, visas laikas ir kaina; priimtina sąžininga išvada „naudos nenustatyta“ |

Pirmas matuojamas darbas: vienam konkrečiam poreikiui iš mažo prasmingo paruoštų tools rinkinio pasirinkti vieną alternatyvą arba abstain. Kartu naudotini komponentai nėra klaidingai pateikiami kaip tarpusavyje nesuderinamos alternatyvos. Jev negali suteikti leidimo, pakeisti hard constraints ar padaryti source-only kandidatą vykdomu.

Repo relevance, konteksto fragmentų ir testų atranka — vėlesni atskiri profiliai. Automatinį pagrindinių coding modelių keitimą atidėti, kol yra palyginamų profilių matavimai. Score, confidence ir modelio savivertė nėra bendras repo kokybės įrodymas.

Kiekvienam dispatch tas pats call ID sieja request, rezervą, faktinį usage ir decision receipt. Account nustato trusted connection resolver. Mokėtojo account cap bendras visiems jį naudojantiems modeliams, routing turi papildomą ribą; rezervas nepakeičia tikros provider sąskaitos. Nepatvirtinti fallback/paid child keliai išjungti. Dabartinis `AgentRunModel.accountId` yra gateway laukas — ne universalus mokėtojo ID.

[Gyvo worker įrodymai ir ribos](experiments/JEV-WORKER-2026-10-17.md), [profilio kvalifikacija](ROUTER-EVALUATION.md), [metodas](CALIBRATION.md), [budget foundation ribos](BUDGET-FOUNDATION.md), [Astra patikslinimas](audits/2026-10-17-astra/REVIEW-REPLIES.md). Ankstesnis visas Jev source tyrimas su datuotais NOT_RUN išsaugotas [karantine](quarantine/README.md). Istorinis blocked nepaneigia naujo siauro live PASS; naujas PASS nesuteikia bendro viso MVP priėmimo.
