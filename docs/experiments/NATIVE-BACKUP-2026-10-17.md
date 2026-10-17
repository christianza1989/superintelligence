# Vietinio profilio DB ir artefaktų atkūrimas

2026-10-17. Atskiras opt-in helper `platform/scripts/zero-native-backup.mjs` tikrina `native-mcp-local-v1` profilį. Tikro PostgreSQL 18.6 / Compose bandymo **8/8 PASS**, 103 canonical migracijos, 23 027 ms. [Redaguota ataskaita](NATIVE-BACKUP-2026-10-17.json) saugo tikslų image ID ir vykdytų šaltinių SHA-256. Tai sintetinė, šiam testui sukurta instaliacija su sustabdytais API/worker writer fixtures; pilnos produkto instaliacijos ar gyvo backup kvalifikacija iš to neseka.

Patikrinti running writer, svetimo Compose projekto, netuščio atkūrimo katalogo, svetimos DB scope, pakeisto blob ir nepatikimo manifesto digest atmetimai. Pilnas DB schema / įrašų / failo baitų round-trip išlaikė Artifact nuorodą ir hash. Pabaigoje pagal tikslias ownership žymas pašalintas tik šio bandymo Compose projektas. Mokamų modelių kvietimų 0.

Papildomi **32/32 offline** testai tikrina metadata, limits, symlink/hardlink, katalogų ir failų teises, papildomus failus, pakeistą SQL, tęstinumą bei neperrašomas ankstesnes kopijas. Per kodo peržiūrą atkurtas realus nested artifact mount atvejis: senas tikrintuvas priėmė mount, kuris paslėpė deklaruotą artefaktų katalogą. Originalus failing test išsaugotas; po pataisos tikrinimas atmeta visus mount po deklaruotu data bind. Qualifier cleanup turi atskirą 15 s deadline ir patikrina ir dalinai sukurtus nuosavus servisus; deadline ir dalinio start gedimų gyva injekcija šiame 8 atvejų rinkinyje neatlikta.

## Operatorius ir paleidimas

Linux operatorius pateikia privatų 0600 JSON failą už Git ir paketo ribų. Schema priima tik `profile`, `projectName`, `composeFile`, `envFile`, `dataDirectory`, `postgresContainerId`, `databaseUser`, `databaseName`. Data katalogas turi priklausyti dabartiniam UID ir būti 0700; tikrinami API/worker RW bind, tikslios Compose žymos ir sustabdyta writer būsena. SQL kopija iki 256 MiB, iki 512 Artifact įrašų ir 64 MiB susietų blob; failai 0600. Šie limitai nėra viso produkto storage retention politika.

```bash
node platform/scripts/zero-native-backup.mjs backup /private/operator.json /private/new-snapshot
node platform/scripts/zero-native-backup.mjs restore /private/operator.json /private/new-snapshot TRUSTED_MANIFEST_SHA256
```

Naudoti realius operatoriaus kelius. Manifesto SHA-256 iš backup rezultato saugoti atskirai nuo kopijos ir naudoti kaip trusted restore įvestį. Atkūrimo DB ir data katalogas turi būti tušti. Helper pats nestabdo ir nepaleidžia servisų, neskaito development `.env`, neeksportuoja host prenumeratos auth ir netrina ankstesnių kopijų. Kopijuojama visa Zero DB bei tik jos Artifact nuorodomis pasiekiami blob; tai privatūs programos duomenys, kurių negalima skelbti Git ar viešuose CI artefaktuose.

Po atkūrimo writer servisai lieka sustabdyti. Data katalogas publikuojamas atomic rename; prieš tęsiant būtina pagal operatoriaus Compose konfigūraciją **perkurti API/worker konteinerius**, kad jų bind būtų susietas su atkurtu katalogu. Tik tada tikrinti programos būseną ir tęsti darbą. Klaidos / unknown atveju writers palikti sustabdytus ir suderinti DB bei išsaugotą staging; nėra automatinio rollback po jau įvykusio DB restore.

Švaraus disposable bandymo paleidimas reikalauja jau vietoje esančio PG image; qualifier nieko nepullina:

```bash
export ZERO_NATIVE_BACKUP_POSTGRES_IMAGE_ID="$(docker image inspect --format '{{.Id}}' postgres:18.6)"
npm run qualify:native:backup
```

CI saugo tik redaguotą qualification JSON, įskaitant failures. DB dump, Compose slaptažodžiai, failų turinys ir privatūs raw logs į viešą artefaktą neįtraukiami. Paveldėti `platform/scripts/backup.sh` / `restore.sh` šio bandymo nekvalifikuoti; off-host, aktyvių kitų writer, fizinio disk-full, bendro footprint ir automatinio retention G1 vartai lieka atviri.
