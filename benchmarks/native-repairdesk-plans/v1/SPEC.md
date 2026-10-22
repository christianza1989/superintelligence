# RepairDesk

Noriu vietinės naršyklėje veikiančios programos nedidelei remonto dirbtuvei. Tai turi būti vientisa kasdienio darbo sistema, kurioje klientų registracija, remontas, dalys ir atsiskaitymas naudoja tuos pačius duomenis.

Reikalingos galimybės:

- Klientų ir jų įrenginių registras, kontaktai, serijos numeriai, ankstesni remontai ir paieška.
- Remonto užsakymai: gedimo aprašas, būsenų lenta, atsakingas meistras, prioritetas, terminas, komentarai ir nuotraukų ar dokumentų priedai. Užsakymas turi aiškią pakeitimų istoriją.
- Darbų, sugaišto laiko ir panaudotų dalių apskaita. Dviejų sandėlių atsargos, priėmimai, išdavimai, perkėlimai ir perspėjimas apie mažus likučius. Dalis negali būti nurašyta du kartus ar išleista daugiau, negu turima.
- Sąmatos patvirtinimas, galutinis užsakymo dokumentas, mokėjimo būsenos ir galimybė pateikti arba išsaugoti klientui skirtą PDF. Tai vidaus dirbtuvės dokumentas; mokėjimų internetu nereikia.
- CSV importas klientams, detalėms ir pradiniams likučiams: prieš patvirtinimą matomos klaidos ir pakeitimai, neteisinga partija nieko nekeičia, pakartotas toks pats importas nedubliuoja duomenų. CSV eksportas pagal pasirinktus filtrus.
- Visos darbo vietos atsarginė kopija ZIP formatu, įskaitant priedus. Atkuriant tikrinamas kopijos formatas ir vientisumas; bloga kopija negali sugadinti veikiančios duomenų bazės.
- Vietinės paskyros su administratoriaus ir meistro vaidmenimis. Meistrui neprieinami paskyrų ir atsarginių kopijų administravimo veiksmai. Autorizacija turi veikti serverio pusėje.
- Suvestinė su vėluojančiais remontais, užsakymų būsenomis ir sunaudotomis dalimis. Bendra paieška klientuose, įrenginiuose ir užsakymuose.
- Patogi sąsaja kompiuteryje ir telefone, darbas klaviatūra, suprantamos klaidos ir tuščios būsenos. Išsaugoti duomenys bei priedai išlieka po programos ir kompiuterio perkrovimo.

Programa turi veikti šiame kompiuteryje be mokamų API, debesies paslaugų ar išorinio prisijungimo tiekėjo. Technologijas parink pagal šią užduotį. Darbo metu būtinas internetas netinka. Jei trūksta detalių, plane aiškiai išvardyk prielaidas, sudėtingas vietas ir siūlomą pirmos veikiančios versijos apimtį. Neišmesk reikalavimų tyliai vien tam, kad juos būtų lengviau įgyvendinti.

Šiame etape reikia tik pilno įgyvendinimo plano. Programos failai dar nekuriami; įgyvendinimas prasidės tik po mano plano peržiūros.
