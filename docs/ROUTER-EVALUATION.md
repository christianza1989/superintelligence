# Jev profilio kvalifikavimo protokolas

2026-10-17. **Produkto gyvas worker ToolSelector profilis nepriimtas.** Tai skiriasi nuo jau atliktų standalone Lab API bandymų. [J0–J3 apimtis](JEV-APPLICATIONS.md), [norminiai darbai](../ROADMAP.md) ir [dabartinė būsena](IMPLEMENTATION.md).

1. Užrakinti tikrą endpoint/model ID, SDK/transporto ir schemos versiją; tikrinti faktinę paskyros prieigą, o ne laikyti sename source minėtą `typesafe/jev-1.13` amžinai prieinamu produktu.
2. Patikima jungtis išsprendžia account/credentials. Prieš dispatch atomiškai rezervuoti account ir routing lane ribas; count apima retry/helper. Nežinomas usage lieka hold, nekainuoja tariamai 0.
3. Fiksuoti poreikio, kandidatų rinkinio ir grant revision. Hard filters taikomi prieš ir po sprendimo, pasirenkami tik pateikti IDs arba abstain. Nauja schema/revocation tikrinama prieš vykdymą.
4. Per esamą worker įrodyti bent vieną teisingą tikrą tool use ir prasmingą no-fit. Tikrinti timeout, invalid/duplicate/unknown IDs, missing connection, cap0 ir revoked grant. Emuliuotas provider tinka neigiamiems testams, bet neuždaro live vartų.
5. Įrašyti actual target, call ID, timing, raw/normalized usage ir atskirą source/decision/tool/verification receipt. Jev negamina savo galutinio PASS įrodymo.
6. Užšaldytas LT/EN ir planuotas EN/RU router/search rinkinys, atskiras holdout; kalbų palaikymą deklaruoti tik pagal išbandytą profilį. Cold/warm ir visas preparation+selection laikas atskirai.
7. B prieš C palyginti galutinį rezultatą bei klaidingus pasirinkimus, ne tik score ar sprendimo greitį. Neigiamas naudos rezultatas išsaugomas.

Pirmas live profilis gali būti tik vienas pagrindinis modelis ir Jev, be mokamų fallback/child. Jei juos leidžia, teisingas tikslinio account mapping ir atskiras rezervas tampa būtina išankstine priklausomybe. Laya ir model routing lieka vėlesni, ne MVP pradžios blokas.

Originalūs SDK/modelio source pin, tyrimo ribos ir senos aplinkos blokai išsaugoti [karantino manifeste](quarantine/README.md). Jie nėra naujas entitlement ar kainos patvirtinimas.
