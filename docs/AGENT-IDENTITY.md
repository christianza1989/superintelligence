# Oficiali RepositoryZero agentų tapatybė

2026-10-16. Naudotojo reikalavimas: sistemos parengti PR visur turi būti atpažįstami kaip **RepositoryZero agentų darbas**. **Tai būsimo publikavimo specifikacija: oficialus GitHub App/bot account dar nesukurtas, jokio išorinio PR šiame darbe nepateikta.**

## Vienas oficialus publisher

Agentai ruošia pataisą, testų įrodymus ir PR draft. Viena patikima publikavimo jungtis vykdo leistiną GitHub veiksmą, priskiria tikrą veikiančią tapatybę ir fiksuoja external effect. Ta pati schema taikoma RepositoryZero patobulinimams, upstream kodui, adapteriams, receptams ir atskirai leistiems dokumentacijos PR.

Numatytas pasirinkimas — **GitHub App**, kurio teisių ir instaliacijų scope tikrai leidžia konkretų veiksmą. Viešam upstream/fork keliui papildomai patikrinamos GitHub palaikomos teisės ir author semantika. Jei konkrečiam keliui reikalinga atskira tarnybinė bot paskyra, ją konfigūruoja savininkas; paprastas svetainės GitHub login tokios prieigos nesuteikia. Tikslaus app/account vardo prieinamumas dar netikrintas.

GitHub rodomas PR autorius yra realus autentifikuotas principal. Jei veiksmas atliekamas naudotojo tapatybe, neapsimetame, kad jį GitHub'e atidarė neegzistuojantis sistemos botas; RepositoryZero kilmė nurodoma apraše. Oficialus bendro projekto contribution lane naudoja konfigūruotą bendrą bot/App tapatybę. Jos nebuvimas ar netinkamas scope palieka PR draft būsenoje; skirtingų agentų asmeninės paskyros šio lane nepakeičia.

## Atpažįstamas ir naudingas PR

Agentų rolės gali būti `RepositoryZero Builder`, `RepositoryZero Reviewer`, `RepositoryZero Docs`. Tai AI rolės, ne teiginys apie tikrus samdomus darbuotojus ar atskiras GitHub paskyras. Kiekvienas PR turi aiškų pakeitimo tikslą ir tikrą validation, o kilmės žyma trumpa:

```text
Prepared by RepositoryZero agents.
Role: Builder · Review: Reviewer
Evidence: <public, non-sensitive verification reference>
```

Tai šablonas, ne jau pateiktas PR. Reviewer įrašomas tik jei peržiūra tikrai atlikta; modelio peržiūra nevadinama nepriklausomu saugumo auditu. Testų aprašas nurodo faktiškai vykdytą aprėptį, failed/skipped/NOT_RUN ir žinomas ribas. Role ar logotipas nesuteikia `verified` statuso ir nepakeičia upstream autoriaus/licencijos.

PR tekstas pirmiausia sprendžia konkretaus repo problemą. RepositoryZero kilmė netampa klaidinančia kokybės garantija ar reikalavimu upstream autoriui reklamuoti projektą. Privačios užduotys, prompts, vartotojų tapatybės, tokenai ir vietiniai keliai nekeliami į viešą PR; įrodymų nuoroda galima tik viešai tinkamam faktų paketui.

## Automatika ir atsekamumas

Naudotojas gali iš anksto pasirinkti contribution profilį: leidžiamus repo/fork, failų/klaidos kategorijas, testus, publikavimo ir kvotų ribas. Įgaliota rutina neapkraunama kiekvieno read/test patvirtinimu. Neperduotų teisių ar privataus turinio publikavimo šis profilis savaime nesuteikia.

Publisher gauna paruoštą pataisą, source/base SHA, pakankamus įrodymus ir paskirtą operation ID. Prieš publikavimą tikrina dabartinį target/base/grant bei dubliavimą. Neaiškus GitHub atsakymas nėra priežastis aklai atidaryti antrą PR; operacijos būsena suderinama su faktiniu GitHub rezultatu. Bot rašymo paslapčių nesuteikiame source build/test aplinkai.

GitHub App įsteigimas, installation/fork/PR conformance, tikras user-delegation autorystės atvaizdavimas ir publisher recovery testai dar neįgyvendinti. GitHub autoriaus apiforminimas ir publikavimo leidimai bus tikrinami konkrečiu oficialiai palaikomu keliu.

[Bendruomenės kokybės ir upstream indėlio ciklas](COMMUNITY-QUALITY.md) · [Autonomijos politika](AUTONOMY-AND-UPDATES.md) · [Partnerystės ir outreach](GROWTH-AND-OUTREACH.md).
