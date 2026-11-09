# Adventure Desk

Turn an outreach or research list into a clear next-action queue.

- Builder: Vic (@VHG-NYU). Pod not yet confirmed.
- Product page and PRD: https://building-with-ai-f26.github.io/vhg5956-adventure-desk/
- App: runs locally. No hosted app or external messaging is required for Build 1.
- Source template: https://github.com/building-with-ai-f26/project-template

## Run the prototype
Python 3.12 or later, standard library only. No package installation required for the deterministic workflow.

    python prototype/app.py

Then open http://127.0.0.1:8765. Stop with Ctrl+C. If port 8765 is already occupied by the existing prototype, use `python prototype/app.py --port 8766` and open that port instead. Do not terminate unrelated processes.

Optional: Ollama on http://127.0.0.1:11434 with an installed model. No model is downloaded automatically. The app remains usable without it.

## Verify

    python -m unittest discover -s prototype -p "test_*.py" -v

44 unit/API tests cover qualification, evidence, duplicates, suppression, timing, local meetings, revisions, model-result validation and adventure isolation. Prior browser checks were performed separately with Edge on synthetic temporary databases. They are described in the product page; this repository does not claim a portable automated browser runner.

## Preview the product page

    python -m http.server 8780 --bind 127.0.0.1 --directory docs

Open http://127.0.0.1:8780. This serves only the static page and screenshots.

## Publish after approval
Create a public repository from the class template in `building-with-ai-f26`, named `<netid>-adventure-desk`; confirm the actual netid and owner first. Copy these prepared changes into that repository, commit with the builder's real configured identity, and push. Configure Pages: main branch, /docs. Verify the resulting page and repository URLs, then submit those two URLs in Icerynk. This preparation has not published or submitted anything.

Do not upload local databases, backups, credentials, private logs or unrelated files. `.gitignore` excludes runtime data. The public page must remain a showcase; do not expose the localhost Python server to the Internet.

## Scope
Four scoring dimensions; up to 50 new adventures; review-only prototype. No external email/calendar/CRM connections or autonomous actions. Matching names/domains share opt-out suppression. Scores and model output require human review. See the PRD for non-goals and unverified assumptions.
