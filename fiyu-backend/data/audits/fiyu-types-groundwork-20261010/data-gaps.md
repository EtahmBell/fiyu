# Data gaps for future Fiyu Types

The database contains substantial narrative research, card descriptions, review themes, practical information, hours, price, access, and food tags. The gaps below mean “not consistently represented as a reliable structured feature,” not “never mentioned in text.” No new enrichment is proposed or performed by this audit.

| Concept | Why it could matter | Evidence already present? | Future catalog research | User behavior may be better? |
|---|---|---|---|---|
| Atmosphere / energy | Separates quiet, intimate, lively, counter-focused, and convivial preferences across cuisines. | Likely in descriptions and review-theme text, but review themes cover only 790/1,430 (55.24%) and are highly fragmented (1,970 distinct strings). | Add a small evidence-backed multi-select vocabulary with confidence and provenance. | Yes—time-of-day saves and repeat choices can reveal preferred energy better than a static label. |
| Occasion fit | Date night, quick meal, celebration, work meal, and casual drop-in are behaviorally central. | Practical/access/price fields provide indirect clues; no canonical occasion field exists. | Collect only observable constraints and suitability claims, not editorial guesses. | Strongly yes; occasion is contextual to the user and visit, not intrinsic to the restaurant alone. |
| Solo vs social suitability | Counter seating, meal pacing, and group accommodation can change recommendations materially. | May appear in descriptions/reviews, but no consistent structured field was found. | Structure observable seating/service evidence when research supports it. | Yes; party-size and interaction data are more direct. |
| Traditional ↔ contemporary | Could distinguish preservation-oriented craft from reinterpretive/experimental dining without collapsing into cuisine. | Narrative text and tags may contain clues, but tags are fragmented (1,742 distinct values) and not a controlled semantic scale. | Add an evidence-backed continuum only if inter-rater definitions can be made precise. | Useful as validation; user responses determine whether the distinction drives choice. |
| Adventurousness / familiarity | Potentially describes willingness to try unfamiliar formats, ingredients, or locations. | No reliable structured measure. Inferring it from cuisine would encode cultural assumptions. | Capture concrete novelty/format evidence, not a universal “exoticness” score. | Primarily yes; adventurousness is user-relative and should be learned from cross-category behavior. |
| Formality / service style | Helps distinguish spontaneous casual excellence from ceremony and high-touch dining. | Budget, reservation, and access are partial proxies, not formality. | Structure service format, dress guidance, pacing, and reservation evidence separately. | Yes, especially by occasion and time of day. |
| Menu breadth / specialization depth | Could support specialist-seeking vs broad/generalist preferences. | Specialist status is structured but unusably imbalanced for this contrast: 1,175 specialist, 254 unknown, one non-specialist. Food tags do not measure menu breadth. | Collect explicit menu scope and evidence for both specialist and non-specialist/generalist states; do not convert `unknown` into generalist. | User behavior can reveal a preference for focused venues, but metadata is still needed to characterize them. |
| Chef-driven identity / authorship | Could distinguish personal, auteur cooking from institution- or product-led experiences. | Likely mentioned in research summaries but not represented consistently as a field. | Collect named-chef role, continuity, and evidence provenance only when public evidence supports it. | Saves/ratings can show affinity, but restaurant metadata is needed to define the trait. |
| Temporal context and reliability | A restaurant can feel different at lunch, late night, weekdays, or after menu/chef changes. | Hours exist broadly, but experience by service window and temporal validity are not encoded as taste features. | Timestamp experiential claims and attach them to service windows where possible. | Yes; actual interaction time is a high-value contextual signal. |

## Existing structured-data limitations

- Cuisine normalization covers 678/1,430 (47.41%); raw category is complete but has 482 bilingual/fragmented values.
- Structured budget covers 1,176/1,430 (82.24%).
- `description_confidence` has no populated values in the published catalog, so narrative confidence cannot be compared quantitatively.
- `specialist_status` is not a balanced tri-state sample and cannot support a specialist/generalist latent axis.
- Independence has a severe upper ceiling (median, p75, and p90 all 100), limiting its ability to distinguish most restaurants.
- Quality and Local Discovery are negatively related in this selected published catalog. This may reflect the scoring/publication construction and catalog sourcing as well as real restaurant variation; user behavior is needed before treating the tradeoff as psychological preference.

## Recommended order of future evidence work

1. Normalize existing narrative evidence into narrowly defined, multi-label attributes for atmosphere, service format, menu breadth, and seating/party-size suitability, preserving provenance and confidence.
2. Improve cuisine normalization for analysis and explanation, while keeping cuisine out of type identity.
3. Resolve specialist `unknown` records only with evidence; explicitly collect valid generalist/non-specialist examples.
4. Instrument contextual user behavior (save/dismiss/rate, party size, occasion, time, and repeated choices).
5. Test whether restaurant attributes predict behavior out of sample before creating any named taxonomy.
