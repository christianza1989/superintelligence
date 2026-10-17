# Astra audito snapshot

2026-10-17, source commit `fe14bdd4fb9cd8805938e1169a4bd2d13961bb86`. [AUDIT](AUDIT.md), [rekomenduotas planas](ARCHITECTURE-PLAN.md), [kritinės peržiūros atsakymai](REVIEW-REPLIES.md), [EVIDENCE](EVIDENCE.json). Priimta kryptis yra [DECISIONS](../../DECISIONS.md), ne visas rekomendacijų tekstas.

Vieša kopija pašalina asmeninius host kelius. Originalai ir pilna maketų generacijos istorija išsaugoti vietiniuose artefaktuose; čia neįtrauktos credentials ar privačios sesijos. Source citatos aprašo nurodytą commit. [probe.mjs](probe.mjs) yra diagnostinis receptas, ne benchmark ir ne automatiškai vykdomas CI. [foundation log](foundation.log.txt), [context log](context.log.txt).

Auditas: 23 dokumentai perskaityti pilnai, 7 tikslinėmis dalimis, 72 tik inventorizuoti/antraštės. Tai sąmoningai nėra „viskas pilnai patikrinta“ ar saugumo sertifikatas. UI generacija yra atskiras konceptų priedas.

Public `probe.mjs` uses the current working directory as the checkout, requires exactly the recorded commit before importing source, and writes only to `.local/astra-audit-reproduction`. Its path setup was made portable for this copy; the diagnostic logic and recorded results were not rerun or relabelled. Reproduce only in a separate checkout of that snapshot with its dependencies prepared.

Sanitized logs use a `.log.txt` suffix so the repository log-ignore rule does not omit the linked evidence.
Public logs also normalize CRLF/trailing whitespace and remove ANSI color escapes; private originals retain their original formatting. Test outcomes and timings are unchanged.
