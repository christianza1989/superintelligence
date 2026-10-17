# RepositoryZero outreach šablonai

> **Planuojama produkto specifikacija · peržiūrėta 2026-10-17.** Aprašo siekiamą elgesį; schemų pavyzdžiai ir maketai savaime nėra įgyvendintos funkcijos. Daliniai foundation komponentai nekeičia viso vartų statuso. Datuotos įgyvendinimo pastabos žemiau nėra atnaujinta būsenos suvestinė; senos kainų/auth/source prielaidos tikrinamos prieš realų profilį. Dabarties autoritetas: [būsena](IMPLEMENTATION.md), [priimta architektūra](DECISIONS.md), [roadmapas](../ROADMAP.md).

2026-10-16. **DRAFT / NOT_SENT.** Angliški šablonai skirti vėlesniam tikrais faktais užpildytam, tikslingam kontaktui. `{...}` yra privalomas tikras laukas, ne sugalvojamas teiginys. Brand/domain dar nepatvirtinti. [Kampanijos ir leidimų taisyklės](GROWTH-AND-OUTREACH.md) privalomos prieš naudojimą; šiame darbe nėra realių gavėjų ar siuntimo.

## 1. Pirmas repo kūrėjo email

**Subject:** A working {specific_task} integration for {repo_name} — recipe and test results

Hi {maintainer_name_or_team},

I'm {real_sender_name}, working on RepositoryZero, an open project connecting AI tools through shared execution and verification.

We used {repo_name} {tested_version} to {specific_real_task}. The reproducible recipe, test conditions, results and limitations are here: {integration_evidence_url}. Your project and contributors are credited on the page.

Could you check whether the integration description represents your project accurately? If it is useful to your users, we can also prepare a small optional README integration badge in your preferred location. The badge links to this specific integration's verification record; it does not claim your endorsement of the entire platform.

There is no requirement to add a badge, star our repository, donate or promote us. If this is not relevant, no reply is needed and we won't follow up automatically. If you prefer no further contact, let us know via {simple_stop_route}.

{real_sender_name}
{role_and_project_url}
{required_sender_contact_details_for_selected_channel}

**Naudojimo sąlyga:** tikrai verified konkreti integracija. Jei yra tik planas, vietoj šio šablono trumpas co-design kvietimas aiškiai sako „we are evaluating an adapter“ ir neturi verified teiginio. Personalizacija remiasi tik gavėjo aiškiai paskelbtais ir patikrintais darbo faktais.

## 2. Pasirinktas README PR

**Title:** docs: add optional RepositoryZero integration link for {capability}

We have a working integration using {repo_name}@{tested_version} for {specific_task}.

This small documentation change adds {one_link_or_badge} at {maintainer_preferred_section}. It links to {integration_evidence_url}, which records the adapter version, tested platform, checks and current status. No project code, dependencies or build configuration changes are included.

The label means “RepositoryZero integration verified” for that documented scope. It is not a general certification of this repository or an endorsement by its maintainers. We can adjust the wording/location or close the PR if this does not fit your contribution policy.

Verification: {public_report_url}
Usage recipe: {reproducible_recipe_url}
Preview: {readme_preview_url}
Prior invitation / contribution-policy basis: {actual_basis_reference}

**Diff kryptis:** vienas maintainer pasirinktas badge arba integracijos link; jokio tracking pixel ar kitų reklamos blokų. Upstream fix PR, jei yra, atskiras. Kai įrodymų URL ar gavėjo pageidaujama vieta dar nežinomi, ruošiamas tik preview, ne išsiunčiamas PR.

## 3. Pirmas YouTube kūrėjo business email

**Subject:** Reproducible demo for your {actual_channel_topic} audience: {specific_result}

Hi {creator_name_or_team},

Your {actual_public_video_title_and_date} covered {specific_verified_point}. We built a demo that may be relevant to that audience: {one_sentence_real_result}.

RepositoryZero connects selected AI tools through a common execution and verification layer. This demo uses {actual_modules_and_versions}. Here's the {short_demo_duration} recording: {demo_url}; the runnable recipe, measured conditions and current limitations are here: {repro_url}.

If you would like to try it, we can provide {actual_available_support_or_synthetic_environment_with_limits}. You would choose your angle and assessment; there is no request for a positive review. {accurate_material_relationship_disclosure_or_no_payment_statement}.

Would a self-guided test or a technical walkthrough suit your channel? If neither is relevant, no reply is needed and we won't follow up automatically. Stop contact: {simple_stop_route}.

{real_sender_name}
{role_and_project_url}
{required_sender_contact_details_for_selected_channel}

**Naudojimo sąlyga:** tikras video, tikras auditorijos ryšys, parengtas produkto testas ir realiai prieinamas support. Šablonas neapsimeta ilgalaikiu žiūrovu ir neišgalvoja personalizacijos. Jei bendradarbiavimas mokamas, jo sąlygos įrašomos tik po atskiro konkretaus susitarimo; niekada nesiunčiama tuščia / dviprasmė relationship eilutė.

## 4. Sutikusio partnerio bendro pristatymo ruošinys

{repo_name} now has a {tested_capability} integration in RepositoryZero, verified on {platform_and_test_scope}.

Try the recipe: {recipe_url}
See the results and limitations: {evidence_url}
Explore or contribute: {project_url}

Built with {upstream_credit}. {precise_maintainer_involvement_if_explicitly_confirmed}.

**Naudojimo sąlyga:** partneris pasirinko konkretų tekstą / kanalą ir jo attribution/ženklų naudojimą. Maintainer confirmation ir apmokėtas bendradarbiavimas pateikiami tik savo tikra apimtimi. Reklaminis įrašas niekada nekeičia adapterio techninio statuso.

## 5. Creator brief ruošinys

| Laukas | Ką užpildyti prieš kvietimą |
|---|---|
| Auditorija ir epizodo kampas | Konkretus viešas kanalas/video ir viena patikrinama istorija |
|30–60s teaser | Tikros mūsų produkto medžiagos failas, data, parengties žyma |
|3–6min demonstracija | Faktinis input → vykdymas → result/validator, neslepiant ribų |
| Atkūrimas | Pinned source/packages/model/config, OS/hardware, setup/compute/API kaštai ir test account sąlygos |
| B-roll / assets | Rights-cleared kadrai/logos/screenshots, pernaudojimo sąlygos ir attribution |
| Kas dar neveikia | Dabartinė supported/unsupported matrica, failure atvejai ir kontaktas |
| Ryšys / apmokėjimas | Tikras material relationship ir viešo disclosure reikalavimas, jei taikoma |
| Kitas veiksmas | Self-guided test, savanoriškas walkthrough arba creator atsisakymas |

Open-rate pažadai, clickbait „you won“, išgalvota atrankos komisija, tariamas asmeninis santykis ir „pasaulio galingiausia“ be įrodymų į šiuos ruošinius neįtraukiami. Faktų neužpildytas draft negali pereiti į outbound brokerį.
