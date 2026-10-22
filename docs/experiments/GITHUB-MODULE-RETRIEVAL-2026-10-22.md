# GitHub ir native modulių atrankos pataisa

2026-10-22, source / įdiegtas plugin **0.12.1, schema 1.13.1**. Tai development kvalifikacija prieš naują StudioDesk planų porą; ne programos integravimo ar kūrimo naudos įrodymas.

## Priežastis ir pakeitimas

Ankstesnė [0.11.1 pora](NATIVE-STUDIODESK-MODULE-PLANS-2026-10-22.md) negavo kandidatų. Reikalavimų frazės buvo jungiamos kaip privalomi GitHub raktažodžiai, o ilgesnės nei penkių žodžių frazės atmetamos. Paieškos tuštuma nebuvo Jev atsisakymas: modelis nebuvo kviestas.

[Dabartinis kelias](../MCP-MODULE-PLANNING.md) išsaugo pirminį poreikį, atpažintą projekto vardą pirmiausia ieško pavadinime, ribotai keičia nepakankamą užklausą ir sujungia vienodus HTTP search. Iki trijų repo tikrinami lygiagrečiai, todėl didelis pirmas repo neišstumia kitų. Modulio režimas skaito pinned root ir iki trijų aktualių submedžių, tada prioritetą teikia tikram kodui. Visas medis ar closure nepatvirtinamas. Viešumas, grant, tikslios tree/blob tapatybės, DNS/HTTPS, 12 s / 32 request / byte ribos lieka.

Native antraščių prototipai ir vieši C++ metodai tampa stebimais API faktais. Callback laukai nevadinami funkcijomis. Kelių parinkimas naudoja atskirus žodžius ir viešų įėjimo taškų heuristiką; `render` nebesutampa su `brender`, gramatiniai žodžiai neparankina katalogų. Jev shortlist pirmiausia apima skirtingus repo. Nėra StudioDesk ar atskirų projektų whitelist kode.

## Patikros prieš Jev

- **137/137** transporto, paieškos, modulio, receipt ir kliento offline kontrolės PASS.
- **36/36** tikros API/PostgreSQL/Graphile kontrolės su offline provider PASS; savas PostgreSQL sustabdytas.
- Adapters TypeScript ir Linux/Windows savarankiško paketo patikros PASS. 0.12.1 įdiegtas oficialia plugin CLI; native švaraus pokalbio patikra atskira.
- Gyva vienodų buvusių media frazių retrieval patikra per **7,228 s** atliko 3 search, perskaitė FFmpeg, GStreamer ir MLT pins bei aptiko du API vienetus: FFmpeg `libavcodec/avcodec.h`, MLT `src/mlt++/MltAnimation.h`. GStreamer aprėptis liko dalinė; šis faktas nėra jo modulio kvalifikacija. Dvi žemesnio rango repo apžiūros pasiekė bendrą request ribą; nesėkmės išsaugotos.

Trys ankstesni šios development iteracijos probe išsaugoti: atkurtos repo tapatybės, bet dar negauti moduliai; pirmų repo deadline išstūmė kitus; dalis API vietų buvo callback laukai. Jų rezultatai neperrašyti į PASS. Mokamų Jev kvietimų šiuose keturiuose tiesioginės paieškos probe buvo **0**. Tinkama repo tapatybė ar aptikta deklaracija dar nepatvirtina konkretaus vartotojo poreikio.

## Likę šios užduoties vartai

Tikras atskiras API/worker/Jev modulio pasirinkimas ir jo semantinė peržiūra dar laukia šio įrašo pirmo commit metu. Tik po jų leidžiama nauja natūrali StudioDesk A/B pora su nepakeistu promptu ir SPEC, sustojant po planų žmogaus peržiūrai. Cumulative mokamo profilio biudžetas neatstatomas; Jev input paliekamas auditui, bet neįtraukiamas į pagrindinį Codex tokenų palyginimą.
