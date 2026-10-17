# Priimti architektūros sprendimai

2026-10-17. Šis trumpas žurnalas pakeičia senų alternatyvų statusus. Įgyvendinimo įrodymai — [IMPLEMENTATION](IMPLEMENTATION.md); checkboxų autoritetas — [ROADMAP](../ROADMAP.md). Astra rekomendacijos priimtos su žemiau nurodytomis ribomis, jos savaime nėra vykdymo rezultatas.

| ID | Priimtas sprendimas | Pasekmė ir riba |
|---|---|---|
| ADR34 / A01 | Rakazo exact-pin adaptacija; React, bendri UI paketai, Graphile/PostgreSQL ir esamas worker | Ankstesni ADR02/03/07 bei P0.0 bazės pasirinkimo alternatyvos pakeistos. Rakazo kvalifikacija, footprint ir fault vartai lieka atviri; Python/SQLite nėra lygiagretus produkto branduolys |
| A02 | Reuse kaip plonos funkcijos esamame vykdyme | Naujas brokerio CLI nėra pagrindinis produktas; universalus Gemini kontraktų prototipas nėra runtime pamatas. Naudingi invariantai perkeliami tik į tikrą vartotoją turintį kodą |
| A03 | Task ir Library — lygiaverčiai įėjimai | Žmogus gali naršyti be AI; search/filter/stars/Saved/Start project yra MVP. Compare — maža vėlesnė iteracija, Trending/Collections nėra pradžios priklausomybė |
| A04 | Discovery atviras source-only kandidatams, vykdymas tik paruoštam leistinam profiliui | Stars, source pin, licencijos faktas, runtime conformance ir outcome atskiri. Unknown gali reikšti „tirti“, bet nesuteikia execute teisių |
| A05 | Vietinis deterministic retrieval prieš mokamą atranką | Esamas lock/kodas → paruošti profiliai → receptai → katalogo faktai → ribotas external discovery. Mažas naujas kodas leidžiamas, kai reuse bendras kaštas didesnis |
| A06 | Request-scoped observer ir patikimas connection/account mapping | Vienas call ID rezervui/usage/receipt, onUsage išlieka išlaidų autoritetas. AgentRunModel.accountId yra gateway laukas, ne universalus mokėtojas. Unknown lieka konservatyvus hold |
| A07 | Provider-neutral branduolys, naudotojo pasirinktam MVP — tikras Jev ToolSelector | J0 adapteris, J1 profilis, J2 live worker conformance, J3 palyginimas skirtingi. Baseline ar visiškas abstain neuždaro pasirinkto Jev veikimo. Model routing vėliau |
| A08 | Mažas pirmas darbas ir lygiagretus offline įrodymas | Root offline CI, observer jungtis ir live-account įjungimas atskiri. Neprojektuoti invoice/refund platformos prieš pirmą vertikalę. Neapimti fallback/paid child keliai išjungti |
| A09 | Backend runner/verifier gamina įrodymus apie konkretų artefakto revision | Panaudojimas, funkcinis PASS, saugumas ir UX neprilyginami vienas kitam. Pradžiai bounded JSON artefaktai, ne šešios naujos universalios DB lentelės |
| A10 | Preview, techninis MVP, vieša beta ir native platinimas atskiri | CSV proof neuždaro 3 modulių; lieka G0/G1, 30 užduočių (24/30 ir ≥7/10 kiekvienoje srityje), 8 locale apimtis. REA/Treg ir G3A–G3D reikalingi beta; P4D atskiras |
| A11 | Kalibravimas vertina visos konfigūracijos kokybę, laiką, kainą ir nesėkmes | Nebelieka fiksuoto 50% pažado. CLI cache tokenai nėra unikalus input ar vienodai apmokestinami tokenai. Jev naudai reikia B prieš tą patį B+Jev C |
| A12 | Naujausia UI kryptis — santūri užduoties ir rezultato darbo erdvė + Library | Septyni maketai yra design concept. Pirmų šešių Tools nav įgyvendinant suvienodinti į Library. Esamus semantic tokens keisti tik per bendrą šaltinį, maketų spalvos dar neimplementuotos |

Ankstesni ADR01–ADR42 su visa argumentų istorija išsaugoti [karantine](quarantine/README.md). ADR39 Codex pasirinkimą pakeitė Claude prenumerata; ADR41 Sonnet ir ADR42 „cloud neturi CLI“ apibūdina senus bandymus, o ne dabartinę aplinką. Naujausi StockDesk eksperimentai naudojo Haiku 5.5/high, bet nėra šiuo metu vykdomo bandymo.

Nekeičiami principai: vienas autoritetingas scheduler; grants ir effect/recovery kontrolė; licencijų/source/model/data atskyrimas; provider-neutral ribos; apibrėžtas hostile lane, atskirtas nuo trusted local Docker; opt-in shared evidence ir atskiras trusted release kelias. Šis auditas jų nepašalina.
