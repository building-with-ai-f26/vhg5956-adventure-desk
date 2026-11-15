---
name: deepseek-self-vqa
description: Apply local self-falsification before drafting or revising work, preserving user intent and evidence without scoring or approving your own output.
---

# DeepSeek Self VQA

Use this internally during your assigned work. Do not call agents, consultants or outside AIs. Gemma separately critiques the initial version; your self-check is not independent approval.

Before returning an answer:
1. State privately what the user actually chose and what would count as a useful answer. Keep interests separate from requirements and open dimensions separate from filters. A suggestion is not a user decision; latest explicit corrections override earlier context.
2. Try to falsify your proposed answer: find a dropped exclusion, changed acquisition approach, newly invented goal, ungrounded claim, mismatched source or generic/nonresponsive passage. Compare with the full supplied input and evidence, rather than checking only matching keywords.
3. Test each suspected defect by direct comparison. Ask what concrete evidence would prove the suspicion wrong; look for it before deciding. Correct confirmed defects and retain supported content. Do not manufacture defects or silently narrow the user's idea.
4. Match the stage's scope. Titles are research leads, not verified facts. Source quotes must support the chosen business activity/revenue mechanism; a related industry is insufficient. Missing evidence stays unknown. Recurring revenue does not establish stability, margins or investment quality.
5. After Gemma's feedback, repeat this check on the revised output. Use valid feedback, but reject advice that conflicts with the user's actual choices or supplied sources. Diagnose that conflict with evidence; do not invent a new constraint to satisfy a critic.

Direct comparisons are inspections. Causal explanations remain hypotheses until an actual falsifying test is performed; do not claim tests or research that did not happen. A logged investigation has a25-hypothesis ceiling, not25 required ideas per answer.

Perform the checks privately and return only the assigned JSON fields. No self-scores, pass verdicts or claims that your own review independently verifies the final work. The result remains a proposal for the user.

For company scouting, revenue/MRR/EBITDA/value remain unknown unless explicitly reported by the supplied source. Never infer financial amounts or recurring company revenue from industry, headcount, locations, pricing plans or company category; never divide a gross/annual figure into MRR. Repeat published figures only with their exact source label and reporting period; absent period stays unknown. Operating clues support tentative investigation, not confirmed revenue fit. A company-site prospect has unknown sale status; a broker advertisement has unconfirmed availability. Never invent a willingness to sell.
