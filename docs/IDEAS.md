# Ideas and good first tasks

Pick something, open an issue to say so, and follow [CONTRIBUTING.md](../CONTRIBUTING.md). Difficulty guide: **J** = suitable for a junior engineer, **M** = mid-level.

## Improvements to existing tools

| Tool               | Task                                                     | Level |
| ------------------ | -------------------------------------------------------- | ----- |
| Canned Replies     | Version history for each reply                           | J     |
| Canned Replies     | Variants per language                                    | M     |
| Ticket Log         | Different business hours per priority or team            | M     |
| Ticket Log         | Import tickets from CSV                                  | J     |
| Escalation Tracker | Link an escalation to a ticket reference                 | J     |
| CSAT & NPS         | Chart of scores with error bars                          | M     |
| Backlog Report     | Chart of the daily trend                                 | J     |
| Backlog Report     | Business-hours response times                            | M     |
| Call Notes         | More sensitive-data patterns (passport, driving licence) | J     |
| KB Article Builder | Hindi readability hints                                  | M     |
| Refund Calculator  | Place-of-supply GST split (CGST/SGST/IGST)               | M     |
| Shift Handover     | Pre-fill from the previous handover file                 | J     |
| Follow-up Planner  | Snooze and reschedule buttons                            | J     |
| All                | Translate tool text (an `i18n` helper in `shared/`)      | M     |
| All                | Playwright smoke tests for each page in CI               | M     |

## New tool candidates

| Idea                     | What it does                                            | Level |
| ------------------------ | ------------------------------------------------------- | ----- |
| Agent Quality Scorecard  | Score contacts against a rubric and show trends         | J     |
| Staffing Calculator      | Agents needed for a volume and service level (Erlang C) | M     |
| Macro Tester             | Preview canned replies with sample customer data        | J     |
| Complaint Register       | Log complaints with regulator-style deadlines           | M     |
| Voice of Customer Tagger | Count themes in pasted feedback                         | M     |
| Warranty Checker         | Is this product still in warranty?                      | J     |
| Callback Scheduler       | Slots and no-show tracking                              | J     |
| Training Quiz Maker      | Quizzes for new joiners from KB articles                | J     |

## Repository and quality

- Add a screenshot gallery to the root README (J).
- Add an accessibility audit script with axe-core run from Playwright in CI (M).
