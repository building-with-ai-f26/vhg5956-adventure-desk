# San Diego commercial real estate research demo

This is a research hypothesis, not a verified reproduction of Commercial Pacific Properties' acquisition strategy. All three properties are fictional, not listings. All numerical scores are illustrative. Financial thresholds are not known.

From the repository root run:

    python demo/create_cre_demo.py
    python prototype/app.py --port 8767 --db cre-demo-runtime/desk.sqlite3

Open http://127.0.0.1:8767 and select San Diego CRE - research hypothesis. The generator refuses to overwrite an existing database. It creates an isolated workspace, preserving your existing app data. Alternatively create a Research interviews adventure using san-diego-cre-profile.json and preview/import san-diego-cre-fictional.csv.

Open a property to see missing diligence and suggested next steps. The first three criteria describe hypothetical fit; Evidence confidence is a separate displayed criterion. The existing overall score still blends all four: it is a triage score, not a calibrated investment recommendation. Low evidence confidence must not be mistaken for diligence completed. No financial underwriting, automatic discovery, contact lookup, outreach, offers or transactions occur.

Use blank domain values and unique property IDs: multiple properties can share a brokerage, and using its domain would incorrectly deduplicate them.

The earlier Google-career CSV is retained as a clearly fictional alternative example, not the current showcase.
