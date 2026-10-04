# Fiyu Quality-only v4 paid sample

This report is experimental and does not change production scoring or publication state.

## Summary

```json
{
  "experiment": "fiyu-quality-research-v4",
  "sample_size": 100,
  "result_count": 100,
  "completed": 100,
  "failures": 0,
  "needs_retry": 0,
  "responses_requests": 100,
  "web_search_actions": 223,
  "token_usage": {
    "input_tokens": 2366315,
    "output_tokens": 107217,
    "total_tokens": 2473532
  },
  "evidence_levels": {
    "moderate": 70,
    "sparse": 23,
    "none": 5,
    "strong": 2
  },
  "evidence_level_percentages": {
    "moderate": 70.0,
    "sparse": 23.0,
    "none": 5.0,
    "strong": 2.0
  },
  "evidence_levels_by_digital_footprint": {
    "low_digital_footprint": {
      "moderate": 24,
      "sparse": 15,
      "none": 4
    },
    "other": {
      "moderate": 46,
      "strong": 2,
      "sparse": 8,
      "none": 1
    }
  },
  "adjustment_bands": {
    "+1 to +2.99": 40,
    "-0.99 to +0.99": 60
  },
  "adjustment_statistics": {
    "mean": 0.827,
    "median": 0.85,
    "p90_absolute": 1.32,
    "min": 0.0,
    "max": 2.5
  },
  "adjustment_directions": {
    "negative": 0,
    "zero": 7,
    "positive": 93
  },
  "no_observation_rows_neutral": 7,
  "aspect_observation_counts": {
    "cooking_execution": 101,
    "review_theme_consensus": 74,
    "specialist_craft": 75,
    "signature_dish_reputation": 42,
    "ingredient_quality": 53,
    "quality_concern": 5,
    "local_food_recognition": 1,
    "consistency": 1,
    "food_vs_hype": 1
  },
  "polarity_observation_counts": {
    "positive": 346,
    "negative": 7
  },
  "source_type_usefulness": {
    "local_review_platform": {
      "specific_quality_observations": 178,
      "restaurants_with_observation": 78,
      "direct_observations": 171,
      "moderate_or_strong_observations": 122
    },
    "local_food_blog": {
      "specific_quality_observations": 77,
      "restaurants_with_observation": 42,
      "direct_observations": 73,
      "moderate_or_strong_observations": 54
    },
    "map_review_platform": {
      "specific_quality_observations": 36,
      "restaurants_with_observation": 24,
      "direct_observations": 35,
      "moderate_or_strong_observations": 23
    },
    "official_restaurant": {
      "specific_quality_observations": 26,
      "restaurants_with_observation": 19,
      "direct_observations": 26,
      "moderate_or_strong_observations": 14
    },
    "reservation_platform": {
      "specific_quality_observations": 11,
      "restaurants_with_observation": 8,
      "direct_observations": 11,
      "moderate_or_strong_observations": 2
    },
    "other": {
      "specific_quality_observations": 11,
      "restaurants_with_observation": 9,
      "direct_observations": 11,
      "moderate_or_strong_observations": 4
    },
    "editorial_publication": {
      "specific_quality_observations": 9,
      "restaurants_with_observation": 6,
      "direct_observations": 9,
      "moderate_or_strong_observations": 8
    },
    "newspaper_or_magazine": {
      "specific_quality_observations": 4,
      "restaurants_with_observation": 3,
      "direct_observations": 4,
      "moderate_or_strong_observations": 4
    },
    "restaurant_guide": {
      "specific_quality_observations": 1,
      "restaurants_with_observation": 1,
      "direct_observations": 1,
      "moderate_or_strong_observations": 1
    }
  },
  "threshold_counterfactual": {
    "68": {
      "v3_score_pass_and_non_score_eligible": 78,
      "v4_score_pass_and_non_score_eligible": 69,
      "upward_crossings": 1,
      "downward_crossings": 10
    },
    "70": {
      "v3_score_pass_and_non_score_eligible": 58,
      "v4_score_pass_and_non_score_eligible": 49,
      "upward_crossings": 1,
      "downward_crossings": 10
    },
    "75": {
      "v3_score_pass_and_non_score_eligible": 39,
      "v4_score_pass_and_non_score_eligible": 30,
      "upward_crossings": 1,
      "downward_crossings": 10
    }
  },
  "lowest_digital_footprint_quartile": {
    "count": 25,
    "mean_base_quality": 52.68,
    "mean_adjustment": 0.708,
    "mean_researched_quality": 53.39,
    "mean_v4_movement": 0.32,
    "evidence_levels": {
      "moderate": 16,
      "sparse": 6,
      "none": 3
    }
  },
  "production_database_sha256_before": "fc729041b200a7b1c640096224d1dea7724b4c2d06742932cf177f9f55ed1685",
  "production_database_sha256_after": "fc729041b200a7b1c640096224d1dea7724b4c2d06742932cf177f9f55ed1685",
  "production_database_unchanged": true
}
```

## Interpretation and direct answers

This sample shows that a dedicated Quality pass can find substantially more food-specific
evidence than the current general research schema, but it does **not** yet validate a
production Quality posterior. Ninety-three restaurants received a positive adjustment,
seven remained exactly neutral, and none received a negative adjustment. The mean movement
was +0.827 Quality points, the median was +0.85, and the maximum was +2.50. Thus the observed
movement is modest and the ±5 cap is ample, but the negative side of that cap was not tested.

The schema captured 346 qualifying positive observations and seven qualifying negative
observations. The negative observations were confined to a few weak or moderate claims and
never produced a net negative restaurant adjustment after corroboration and positive
evidence were applied. The model also twice tried to encode “no negative evidence found” as
a negative observation; the deterministic scorer now excludes such absence claims. This is
the clearest remaining failure: retrieval and extraction are still strongly positivity
biased, even though the schema can technically represent negative evidence.

The low-footprint behavior was safe at the Quality layer. The manifest deliberately contains
43 low-digital-footprint restaurants: 24 moderate, 15 sparse, four none; their mean Quality
adjustment was +0.657 (base 63.65 to 64.30), with five exactly neutral. In the strict lowest
digital-footprint quartile, the mean adjustment was +0.708 and all no-observation rows were
neutral. The deterministic scorer has no footprint, review-count, hiddenness, independence,
or localness input, so obscurity itself cannot boost or penalize Quality. The 15-row manual
inspection below found plausible local-source updates alongside several properly neutral
near-invisible restaurants. One or two specific local sources can move Quality modestly;
none can create a large adjustment alone.

The most useful source families for specific evidence were local review platforms (178
qualifying observations across 78 restaurants) and local food blogs (77 across 42).
Editorial material was rarer but usually substantive: eight of nine editorial observations
were moderate or strong. Official sources contributed factual craft/sourcing observations,
but official-only claims are capped and cannot establish excellence by themselves. The
experiment visibly recovered useful Japanese-language claims, but source language was not
captured structurally, so a quantitative local-language comparison is not defensible from
this artifact. A future schema should add `source_language`.

No-evidence handling worked: all seven rows with no observations received exactly zero
adjustment. Non-food observations, mixed observations, duplicate source keys, and absence
claims are excluded deterministically. Some semantic overlap still warrants review—especially
specialist craft versus Independence/Distinctiveness, and recognition versus Local
Discovery—but only food-specific claims enter this prototype.

The threshold counterfactual is sample-only and should not be extrapolated. At floors
68/70/75, non-score-eligible pass counts changed 78→69, 58→49, and 39→30. At each floor there
was one upward and ten downward crossings. These downward movements do **not** come from
negative Quality research (there was none); they arise from applying the requested
45/15/15/25 v4-A weights to production H/I/LD rather than retaining the v3 top-level formula.

Quality-v4 is therefore **not ready to implement**. The exact remaining failure is reliable,
corroborated negative-evidence capture: the current pass can find positive qualitative detail
but still cannot demonstrate symmetric updates. Before another paid sample, add source
language, observation date/temporal scope, explicit review-author or source-document identity,
and an extraction-time rule forbidding absence statements as observations. Then run a
human-labeled challenge set deliberately enriched for known mixed and negative food-quality
cases. Keep the ±5 cap, 45% Quality weight, current non-score gates, and confidence separate
from score.

## Request accounting

- 100 Responses requests; model `gpt-5.6-luna`; zero provider retries.
- 223 web-search actions total (mean 2.23/request; observed maximum 4; configured maximum 5).
- 2,366,315 input tokens; 107,217 output tokens; 2,473,532 total tokens.
- Zero failures and zero `needs_retry` outcomes.
- Production database SHA-256 before and after:
  `fc729041b200a7b1c640096224d1dea7724b4c2d06742932cf177f9f55ed1685`.

## 15 biggest Quality risers

| Restaurant | Base Q | Adj. | Final Q | v3 | v4 | Evidence | Reasons | Sources | Digital |
|---|---:|---:|---:|---:|---:|---|---|---|---|
| The Silk Barrel Tokyo | 51.83 | +2.50 | 54.33 | 67.35 | 68.48 | strong | A dancyu feature describes the mapo tofu as combining aged doubanjiang, house-made chili oil, and layered mala-spicy heat in a traditional Sichuan style.; The featured seafood dish uses dried scallop XO sauce with abalone, shrimp, squid, and seasonal vegetables; the article specifically notes fresh seafood, generous cutting, and balanced flavor. | editorial_publication, local_review_platform, official_restaurant, other | independent_website |
| GINZA KOKORO | 97.18 | +1.80 | 98.98 | 68.53 | 69.34 | moderate | 複数の訪問者が、炉釜ステーキについて、外側の香ばしさ・カリッとした食感と、内部の柔らかさやしっとり感を具体的に評価している。; 訪問者が、炉釜焼きの肉について、厚い表面の香ばしさと肉全体のしっとりした火入れを評価している。炉釜の構造と備長炭・遠赤外線による火入れ方法も説明されている。 | local_review_platform, other | independent_website |
| Sushi Ryogetsu (Sushi Akira) | 100.00 | +1.80 | 100.00 | 80.14 | 80.14 | strong | A detailed tasting report praised the sushi rice for being loose yet cohesive, with a moist grain texture, noticeable rice sweetness, well-judged salt and umami, and appropriate temperature and firmness; the reviewer also noted fast, economical hand movements.; The same tasting report identified careful, fish-specific preparation across multiple pieces: measured curing of kasugo and sayori, controlled dehydration, temperature adjustments between tuna cuts, and knife work intended to preserve the desired texture of live-caught aori-ika. | editorial_publication, local_food_blog | independent_website |
| Natowa | 81.70 | +1.75 | 83.45 | 79.72 | 80.51 | moderate | A local food blog describes the chicken confit as tender enough to fall apart under the knife while retaining a crisp exterior.; A high-volume Tabelog reviewer separately describes the bone-in chicken thigh confit as juicy, appropriately tender, and substantial, with roasted vegetables and mustard sauce. | local_food_blog, local_review_platform | independent_website |
| SOBA LABO Blue Front Shibaura | 58.72 | +1.62 | 60.34 | 71.59 | 72.32 | moderate | Multiple diners specifically describe the ten-wari soba as aromatic and firm or pleasantly chewy, with good eating texture.; A diner reports that the chicken tempura was not greasy while retaining impact, and another describes the shrimp-tempura roll coating as light and crisp with a plump shrimp. | local_review_platform, official_restaurant | none |
| Hanoi Street | 69.21 | +1.52 | 70.73 | 69.40 | 70.09 | moderate | 牛肉フォーは透き通ったスープながら牛の旨味があり、麺にはつるっとした喉越しとほどよい弾力があるという実食報告がある。; フォーのスープは透き通っていて、そのまま飲み進められる味わいと報告され、酢やナンプラーなどの調味料による味変も好意的に紹介されている。 | local_food_blog, local_review_platform, map_review_platform, other | none |
| Saigon Pho | 47.85 | +1.50 | 49.35 | 69.11 | 69.79 | moderate | A diner described the chicken pho as having a clear, light chicken-broth flavor, suitably springy rice noodles, tender steamed chicken, and a clean, easy-to-eat finish.; The same review praised the fresh spring roll for plentiful vegetables and vermicelli, firm-textured shrimp, and a fish-sauce-based dipping sauce with distinctive fermented-fish flavor. | editorial_publication, local_food_blog, local_review_platform | none |
| Shuha Saika | 52.62 | +1.50 | 54.12 | 74.45 | 75.12 | moderate | Two qualitative reviews specifically praise the mapo tofu for Sichuan-style peppercorn heat, well-judged seasoning, and strong flavor rather than heat alone.; Multiple diners describe the food as consistently enjoyable across different dishes, including vegetables, fried rice, spring rolls, dumplings, and other Sichuan-style items. | local_review_platform, other | none |
| Nikukyu Ogatomo | 88.09 | +1.40 | 89.49 | 81.97 | 64.33 | moderate | A recent diner described six-hour cooking of ayu and other dishes as carefully executed, while characterizing the food as both precise and robust in style.; A detailed visit report documents a meat-centered course using cross-cuisine techniques, including ostrich thigh prepared as yukhoe, salt-koji-marinated red shrimp, cured egg yolk, tuna bruschetta, a cappellini-based clam dish, and dessert pairings. | local_food_blog, local_review_platform | none |
| Sushi Aki Takase | 54.15 | +1.35 | 55.50 | 76.21 | 76.81 | moderate | A reviewer described the sushi as especially excellent and the other dishes as consistently delicious, citing a meal of four appetizers, eight recommended sushi pieces, and soup.; A sushi-focused reviewer specifically praised the fish as fresh and said both the sashimi and nigiri were satisfying. | local_review_platform | none |
| Ayapani | 60.34 | +1.32 | 61.66 | 65.84 | 66.43 | moderate | 複数の利用者が、海ぶどう、もずく、イカ墨ソーメンチャンプルー、車麩チャンプルー、田芋コロッケ、クーブイリチー、ヒラヤーチーなど、定番から家庭料理まで幅広い料理を具体的においしいと評価している。; 海ぶどうのプチプチした食感と、卵・豆腐でまろやかに仕上げたゴーヤーチャンプルーが具体的に好評だった。 | local_review_platform, map_review_platform, reservation_platform | independent_website |
| Mitaka Soba | 52.00 | +1.32 | 53.32 | 66.19 | 66.79 | moderate | A local Koto editorial reports that the shop uses Hokkaido soba flour for housemade noodles.; The shop’s soba broth is described as being made from Hidaka kombu and katsuobushi supplied by a named bonito wholesaler. | local_review_platform, map_review_platform, newspaper_or_magazine | none |
| Edo Fukagawaya Toyosu Senkyaku Banrai | 60.75 | +1.32 | 62.07 | 69.37 | 69.96 | moderate | A diner described the Fukagawa croquette as having a thin, crisp coating and a sweet, fluffy potato interior.; A separate food-travel report found the Fukagawa croquette crisp on the outside and fluffy inside, with sweet-seasoned clams in the filling. | editorial_publication, local_food_blog, local_review_platform, official_restaurant | none |
| KEI Collection PARIS | 74.51 | +1.32 | 75.83 | 68.73 | 69.33 | moderate | The restaurant’s food is centered on gastronomic grilling, with emphasis on charcoal-grilled wagyu and carefully prepared à la carte dishes; the Michelin Guide specifically notes wagyu grilled with grass over a traditional charcoal stove and playful, creative appetizers.; The restaurant is described as focusing on extracting the character of ingredients through cooking, with particular attention to the fire treatment of meat, fish, and vegetables. | local_review_platform, official_restaurant, restaurant_guide | independent_website |
| Fucha Ryori Bon | 86.93 | +1.32 | 88.25 | 72.62 | 73.22 | moderate | Recent Tabelog reviewers repeatedly describe seasonal vegetables as flavorful, carefully prepared, and attractively presented; one repeat visitor said the dishes remain consistently satisfying across visits.; A detailed reviewer specifically praised the vegetable tempura for being fried to a good degree of doneness, while finding most of the meal generally enjoyable. | local_review_platform, map_review_platform | independent_website |

## 15 biggest Quality fallers

| Restaurant | Base Q | Adj. | Final Q | v3 | v4 | Evidence | Reasons | Sources | Digital |
|---|---:|---:|---:|---:|---:|---|---|---|---|
| 24 see food restaurant | 53.02 | +0.00 | 53.02 | 66.07 | 66.07 | none | No new quality evidence | none | none |
| Yoshitaka | 62.28 | +0.00 | 62.28 | 67.20 | 67.20 | none | No new quality evidence | none | none |
| Teppan Dining Ougi | 55.12 | +0.00 | 55.12 | 69.80 | 69.80 | none | No new quality evidence | none | none |
| Suizin | 70.54 | +0.00 | 70.54 | 71.37 | 71.37 | none | No new quality evidence | none | none |
| Asian Food Restaurant Hana | 76.94 | +0.00 | 76.94 | 74.82 | 74.82 | none | No new quality evidence | none | independent_website |
| Yakusudong Gukbap | 87.15 | +0.00 | 87.15 | 83.28 | 83.28 | sparse | No new quality evidence | none | none |
| Izakaya Kenchan | 87.64 | +0.00 | 87.64 | 80.16 | 62.66 | sparse | No new quality evidence | none | none |
| Horumon Seisakusho Nanaya | 51.48 | +0.12 | 51.60 | 69.72 | 69.78 | sparse | A May 2025 diner specifically praised the restaurant’s roaster for giving the grilled meat an especially fragrant, well-browned crust. | local_review_platform | none |
| Taiseien | 51.29 | +0.12 | 51.41 | 68.17 | 68.23 | sparse | A recent diner specifically praised the grilled pork trotter with spicy sauce for its charred exterior, gelatinous-soft interior, and well-balanced spicy seasoning. | local_review_platform | none |
| Tenshin | 44.46 | +0.12 | 44.58 | 71.04 | 71.09 | sparse | A recent local dining note describes the tempura set meal as including several small side dishes and offering good value. | other | none |
| Godaime Wagyu Tokyo Asakusa | 84.54 | +0.12 | 84.66 | 72.71 | 72.76 | sparse | The Asakusa concept is presented as a wagyu-focused restaurant, while the associated brand describes a fifth-generation meat-business background dating to 1962 and a menu centered on wagyu ramen and beef dishes. | official_restaurant | none |
| Lion’s Pub Sri Lankan Restaurant & Bar | 82.11 | +0.17 | 82.28 | 80.93 | 81.01 | moderate | A local visit report described the chicken in the curry as very tender and falling apart easily.; The same report noted that the pork curry meat was somewhat tough, contrasting with the tender chicken. | local_food_blog, local_review_platform | independent_website |
| Shi-chan-yaki | 45.11 | +0.25 | 45.36 | 69.78 | 69.89 | sparse | A customer report says the staff cook the okonomiyaki and other teppan dishes at the table, season them, and serve them hot.; Available customer comments describe the food as tasty, including okonomiyaki and hot teppan dishes. | local_review_platform, map_review_platform | none |
| Donbee | 71.37 | +0.25 | 71.62 | 71.56 | 71.67 | sparse | The listed menu emphasizes premium ingredients, including hon-maguro and other tuna varieties, live abalone and turban shellfish,霜降り黒毛和牛, and thick-cut beef tongue.; The restaurant listing states that it specializes in fish dishes and uses an independent sourcing route for fresh seasonal seafood; it also lists seasonal dob蒸し and multiple tuna preparations. | local_review_platform | none |
| Katei Ryori Fujino | 60.42 | +0.25 | 60.67 | 71.21 | 71.32 | sparse | A visitor specifically praised the mountain-vegetable tempura served with salt, describing it as tasty.; Another visitor said the food and sake service were good and expressed a desire to return. | map_review_platform | none |

## 15 sparse-evidence neutral restaurants

| Restaurant | Base Q | Adj. | Final Q | v3 | v4 | Evidence | Reasons | Sources | Digital |
|---|---:|---:|---:|---:|---:|---|---|---|---|
| Devi Fusion Dining Bar | 52.59 | +0.60 | 53.19 | 67.17 | 67.45 | sparse | A specialist curry blogger described the Shinagawa Devi Fusion group’s North Indian curry as rich and praised its naan as notably soft, chewy, and very tasty; the post also identifies Devi Fusion as using the same menu as the related Shinagawa Devi India location.; A curry-focused food blogger reported that Devi Fusion’s chicken adaraki had a creamy texture with prominent fresh ginger, garlic, and turmeric, and that the tandoori roti was crisp outside; the writer described both as highly enjoyable. | local_food_blog | none |
| 24 see food restaurant | 53.02 | +0.00 | 53.02 | 66.07 | 66.07 | none | No new quality evidence | none | none |
| Yoshitaka | 62.28 | +0.00 | 62.28 | 67.20 | 67.20 | none | No new quality evidence | none | none |
| Gentou | 44.14 | +0.31 | 44.45 | 67.46 | 67.60 | sparse | A May 2025 diner described the restaurant as serving very good fish and said the dishes showed care and were excellent.; A January 2025 diner described the food as elaborate and the menu as extensive. | local_review_platform | none |
| Shi-chan-yaki | 45.11 | +0.25 | 45.36 | 69.78 | 69.89 | sparse | A customer report says the staff cook the okonomiyaki and other teppan dishes at the table, season them, and serve them hot.; Available customer comments describe the food as tasty, including okonomiyaki and hot teppan dishes. | local_review_platform, map_review_platform | none |
| Teppan Dining Ougi | 55.12 | +0.00 | 55.12 | 69.80 | 69.80 | none | No new quality evidence | none | none |
| Horumon Seisakusho Nanaya | 51.48 | +0.12 | 51.60 | 69.72 | 69.78 | sparse | A May 2025 diner specifically praised the restaurant’s roaster for giving the grilled meat an especially fragrant, well-browned crust. | local_review_platform | none |
| Taiseien | 51.29 | +0.12 | 51.41 | 68.17 | 68.23 | sparse | A recent diner specifically praised the grilled pork trotter with spicy sauce for its charred exterior, gelatinous-soft interior, and well-balanced spicy seasoning. | local_review_platform | none |
| Donbee | 71.37 | +0.25 | 71.62 | 71.56 | 71.67 | sparse | The listed menu emphasizes premium ingredients, including hon-maguro and other tuna varieties, live abalone and turban shellfish,霜降り黒毛和牛, and thick-cut beef tongue.; The restaurant listing states that it specializes in fish dishes and uses an independent sourcing route for fresh seasonal seafood; it also lists seasonal dob蒸し and multiple tuna preparations. | local_review_platform | none |
| Tenshin | 44.46 | +0.12 | 44.58 | 71.04 | 71.09 | sparse | A recent local dining note describes the tempura set meal as including several small side dishes and offering good value. | other | none |
| Suizin | 70.54 | +0.00 | 70.54 | 71.37 | 71.37 | none | No new quality evidence | none | none |
| Asian Food Restaurant Hana | 76.94 | +0.00 | 76.94 | 74.82 | 74.82 | none | No new quality evidence | none | independent_website |
| Katei Ryori Fujino | 60.42 | +0.25 | 60.67 | 71.21 | 71.32 | sparse | A visitor specifically praised the mountain-vegetable tempura served with salt, describing it as tasty.; Another visitor said the food and sake service were good and expressed a desire to return. | map_review_platform | none |
| SAKURA Khit | 61.02 | +0.38 | 61.40 | 74.32 | 74.49 | sparse | A diner described the Myanmar rice set as tasty and filling, despite its unfamiliar seasoning profile.; The Myanmar milk tea was singled out as especially delicious, with a sweet condensed-milk character. | local_food_blog, local_review_platform | none |
| Godaime Wagyu Tokyo Asakusa | 84.54 | +0.12 | 84.66 | 72.71 | 72.76 | sparse | The Asakusa concept is presented as a wagyu-focused restaurant, while the associated brand describes a fifth-generation meat-business background dating to 1962 and a menu centered on wagyu ramen and beef dishes. | official_restaurant | none |

## Experimental score 68–70

| Restaurant | Base Q | Adj. | Final Q | v3 | v4 | Evidence | Reasons | Sources | Digital |
|---|---:|---:|---:|---:|---:|---|---|---|---|
| The Silk Barrel Tokyo | 51.83 | +2.50 | 54.33 | 67.35 | 68.48 | strong | A dancyu feature describes the mapo tofu as combining aged doubanjiang, house-made chili oil, and layered mala-spicy heat in a traditional Sichuan style.; The featured seafood dish uses dried scallop XO sauce with abalone, shrimp, squid, and seasonal vegetables; the article specifically notes fresh seafood, generous cutting, and balanced flavor. | editorial_publication, local_review_platform, official_restaurant, other | independent_website |
| Shi-chan-yaki | 45.11 | +0.25 | 45.36 | 69.78 | 69.89 | sparse | A customer report says the staff cook the okonomiyaki and other teppan dishes at the table, season them, and serve them hot.; Available customer comments describe the food as tasty, including okonomiyaki and hot teppan dishes. | local_review_platform, map_review_platform | none |
| Teppan Dining Ougi | 55.12 | +0.00 | 55.12 | 69.80 | 69.80 | none | No new quality evidence | none | none |
| Kakaya | 43.35 | +0.88 | 44.23 | 68.35 | 68.74 | moderate | A long-term diner described both the monjayaki and okonomiyaki as above standard, indicating positive dish-level assessment of the restaurant’s core specialties.; The winter-only stew is specifically praised by a repeat diner, who reports that a family member regularly finishes an entire serving. | local_review_platform | none |
| Hashigo | 41.91 | +0.36 | 42.27 | 69.76 | 69.93 | moderate | Multiple independent Tabelog reviews describe the ramen as the venue’s strongest offering, including comments that it is "quite excellent," "substantially outstanding" for a ramen shop, or a dish the reviewer especially prefers.; A local ramen feature characterizes Hashigo’s shoyu ramen as a carefully balanced bowl, specifically praising clear, layered broth, restrained soy aroma, thin noodles that carry the soup, and tender handmade-style chashu. | local_food_blog, local_review_platform | none |
| Minato Kappore | 56.39 | +1.02 | 57.41 | 68.83 | 69.29 | moderate | 料理を一人分ずつ小さな器に盛り付け、少量多皿で提供するスタイルが、食べ進めやすさと盛り付けの丁寧さにつながっていると報告されている。; 焼きしいたけやすだちそうめんについて、素材を活かした味付け、香ばしさ、酸味、喉越しなど、シンプルな料理の仕上がりが評価されている。 | local_food_blog, local_review_platform | none |
| Omori Yakiniku Halal | 76.06 | +0.85 | 76.91 | 69.53 | 69.92 | moderate | Several Google Maps reviewers independently describe the meat as juicy, tender, flavorful, or very tasty, with repeated praise for the meat’s quality.; A Tabelog reviewer specifically reported that the thick-cut salted tongue was delicious. | local_food_blog, local_review_platform, map_review_platform | none |
| Matsu Katei Ryori | 54.54 | +0.85 | 55.39 | 69.10 | 69.48 | moderate | 複数の訪問者が、名物のてこね寿司を「とても美味しい」と評価している。甘めの味付けの漬け魚、生姜の風味、魚の量など、具体的な味・構成への言及がある。; てこね寿司について、マグロの量が多く、味噌汁も含めて「ちゃんと作った美味しい」料理だとする具体的な評価がある。 | local_review_platform, other | independent_website |
| Itamae Kappo Shuraku | 49.04 | +1.27 | 50.31 | 68.99 | 69.56 | moderate | The restaurant states that its Japanese dishes are made entirely by hand, including owner-prepared cuisine.; The menu identifies seasonal and premium ingredients, including whole Shimonoseki-landed tiger fugu and thick domestic Aichi Isshiki eel. | local_review_platform, official_restaurant, reservation_platform | independent_website |
| Edo Fukagawaya Toyosu Senkyaku Banrai | 60.75 | +1.32 | 62.07 | 69.37 | 69.96 | moderate | A diner described the Fukagawa croquette as having a thin, crisp coating and a sweet, fluffy potato interior.; A separate food-travel report found the Fukagawa croquette crisp on the outside and fluffy inside, with sweet-seasoned clams in the filling. | editorial_publication, local_food_blog, local_review_platform, official_restaurant | none |
| GINZA KOKORO | 97.18 | +1.80 | 98.98 | 68.53 | 69.34 | moderate | 複数の訪問者が、炉釜ステーキについて、外側の香ばしさ・カリッとした食感と、内部の柔らかさやしっとり感を具体的に評価している。; 訪問者が、炉釜焼きの肉について、厚い表面の香ばしさと肉全体のしっとりした火入れを評価している。炉釜の構造と備長炭・遠赤外線による火入れ方法も説明されている。 | local_review_platform, other | independent_website |
| Kappou Shabushabu Atamiya | 59.39 | +0.85 | 60.24 | 68.34 | 68.72 | moderate | The restaurant describes a shabu-shabu method built around a house broth made from bonito flakes, dried sardines, and kombu, with freshly prepared green onion added daily.; The restaurant states that it uses Miyazaki Kirishima black pork, A4-or-higher domestic Wagyu, and seafood purchased daily from Toyosu and Senju markets. | local_review_platform, official_restaurant, reservation_platform | independent_website |
| zoshigaya miyabi | 53.73 | +0.90 | 54.63 | 68.36 | 68.76 | moderate | Independent diner accounts repeatedly describe the lunch plates as well-executed and satisfying, highlighting flavorful soups, mains, salads, quiche, couscous, and side dishes rather than only the setting or value.; A diner specifically praised the vegetables and accompaniments, describing the roasted vegetables, salad, and couscous as very good and noting a balanced plate alongside the main dish. | local_food_blog, local_review_platform, map_review_platform | independent_website |
| Sumiyaki Unafuji Tokyo Opera City Branch | 84.88 | +1.15 | 86.03 | 69.28 | 69.80 | moderate | A diner specifically praised the shiroyaki for its crisp, fluffy texture and found the preparation exceptionally satisfying.; Another diner described the restaurant’s white-grilled eel as exceptionally crisp and satisfying, separately highlighting the preparation rather than only the dining setting. | map_review_platform | independent_website |
| KEI Collection PARIS | 74.51 | +1.32 | 75.83 | 68.73 | 69.33 | moderate | The restaurant’s food is centered on gastronomic grilling, with emphasis on charcoal-grilled wagyu and carefully prepared à la carte dishes; the Michelin Guide specifically notes wagyu grilled with grass over a traditional charcoal stove and playful, creative appetizers.; The restaurant is described as focusing on extracting the character of ingredients through cooking, with particular attention to the fire treatment of meat, fish, and vegetables. | local_review_platform, official_restaurant, restaurant_guide | independent_website |

## Experimental score 70–75

| Restaurant | Base Q | Adj. | Final Q | v3 | v4 | Evidence | Reasons | Sources | Digital |
|---|---:|---:|---:|---:|---:|---|---|---|---|
| Hanoi Street | 69.21 | +1.52 | 70.73 | 69.40 | 70.09 | moderate | 牛肉フォーは透き通ったスープながら牛の旨味があり、麺にはつるっとした喉越しとほどよい弾力があるという実食報告がある。; フォーのスープは透き通っていて、そのまま飲み進められる味わいと報告され、酢やナンプラーなどの調味料による味変も好意的に紹介されている。 | local_food_blog, local_review_platform, map_review_platform, other | none |
| Donbee | 71.37 | +0.25 | 71.62 | 71.56 | 71.67 | sparse | The listed menu emphasizes premium ingredients, including hon-maguro and other tuna varieties, live abalone and turban shellfish,霜降り黒毛和牛, and thick-cut beef tongue.; The restaurant listing states that it specializes in fish dishes and uses an independent sourcing route for fresh seasonal seafood; it also lists seasonal dob蒸し and multiple tuna preparations. | local_review_platform | none |
| Torisawattsu | 56.81 | +1.02 | 57.83 | 72.45 | 72.91 | moderate | A firsthand food blog described the chicken paitan broth as exceptionally rich, with the broth pairing well with mushrooms and ramen-style noodles; the same report praised the yakitori as large and juicy.; A firsthand report identified specific premium ingredients in the duck hot pot, including Iwate duck breast, Kyoto hon-shimeji, Fukushima jumbo nameko, Kyoto kujo-negi, and seasonal vegetables; the writer described the duck as flavorful and moderately fatty and the mixed-part chicken meatballs as varied in texture. | local_food_blog, local_review_platform | none |
| Asian Ryouri & Bar Magic Kitchen | 60.34 | +0.85 | 61.19 | 72.85 | 73.23 | moderate | A recent lunch review describes the naan as freshly baked and substantial, while noting that the curry had a clearly detectable spice aroma and flavor.; A diner specifically praised the dal curry as rich and strongly flavored with ginger. | local_review_platform, map_review_platform | none |
| Tenshin | 44.46 | +0.12 | 44.58 | 71.04 | 71.09 | sparse | A recent local dining note describes the tempura set meal as including several small side dishes and offering good value. | other | none |
| Suizin | 70.54 | +0.00 | 70.54 | 71.37 | 71.37 | none | No new quality evidence | none | none |
| Sakanaya Fujino | 52.52 | +1.02 | 53.54 | 71.50 | 71.95 | moderate | A diner reports that hot dishes were served hot and cold dishes cold, with courses timed to the guest’s eating pace.; A diner specifically describes Boso-sourced sashimi as fresh and flavorful, and reports that sakura shrimp kakiage and vegetable tempura were hot, sweet, and enjoyable. | local_review_platform, official_restaurant, reservation_platform | none |
| Fucha Ryori Bon | 86.93 | +1.32 | 88.25 | 72.62 | 73.22 | moderate | Recent Tabelog reviewers repeatedly describe seasonal vegetables as flavorful, carefully prepared, and attractively presented; one repeat visitor said the dishes remain consistently satisfying across visits.; A detailed reviewer specifically praised the vegetable tempura for being fried to a good degree of doneness, while finding most of the meal generally enjoyable. | local_review_platform, map_review_platform | independent_website |
| Hitomoj​​iya | 67.67 | +1.10 | 68.77 | 70.93 | 71.42 | moderate | 店は鰹節問屋・高橋商店から仕入れる土佐最上宗田かつおの出汁を、豚葱しゃぶやおでんなどに使用していると説明している。; 看板の葱チャーシュー系について、味噌に漬け込み、低温調理で旨味を閉じ込める調理法を掲げている。 | local_review_platform, official_restaurant, reservation_platform | none |
| Asian Food Restaurant Hana | 76.94 | +0.00 | 76.94 | 74.82 | 74.82 | none | No new quality evidence | none | independent_website |
| Fukuda | 48.76 | +0.90 | 49.66 | 70.46 | 70.86 | moderate | Multiple diners specifically describe the sashimi as fresh and firm/springy, including sea bream and aori squid.; Reviews praise the cooking across several categories, including sashimi, yakitori, menchi-katsu, mentaiko-stuffed fried chicken wings, seasonal oysters, and other small dishes. | local_food_blog, local_review_platform | none |
| Shabu Shabu & Sushi Kioicho Hassan | 96.59 | +1.15 | 97.74 | 72.10 | 72.62 | moderate | A diner specifically described the shabu-shabu beef as well-marbled and exceptionally tender, with a melt-in-the-mouth texture.; The same diner identified the sushi tuna as hon-maguro and described it as having fatty, medium-toro-like richness. | local_review_platform, map_review_platform | independent_website |
| SOBA LABO Blue Front Shibaura | 58.72 | +1.62 | 60.34 | 71.59 | 72.32 | moderate | Multiple diners specifically describe the ten-wari soba as aromatic and firm or pleasantly chewy, with good eating texture.; A diner reports that the chicken tempura was not greasy while retaining impact, and another describes the shrimp-tempura roll coating as light and crisp with a plump shrimp. | local_review_platform, official_restaurant | none |
| Ucharu | 63.31 | +1.02 | 64.33 | 73.63 | 74.09 | moderate | A June 2025 diner described the meat as fresh and high quality, singling out the harami as especially excellent and saying the meal exceeded expectations.; A local listing review specifically praised the horumon as fresh and tasty, highlighting the liver for its springy texture and distinctive quality. | local_food_blog, local_review_platform, other | none |
| Pebble Hiroo Terrace | 74.87 | +0.55 | 75.42 | 70.02 | 70.27 | moderate | A food-focused independent blog specifically praised the P.F.C. Stack, reporting that the fried-chicken coating remained crisp through the meal and paired especially well with the accompanying sauce.; A separate food article characterized the restaurant's pancakes as fluffy and highlighted the P.F.C. Stack as a visually distinctive, substantial breakfast dish. | editorial_publication, local_food_blog, local_review_platform, official_restaurant | independent_website |

## Experimental score 75–80

| Restaurant | Base Q | Adj. | Final Q | v3 | v4 | Evidence | Reasons | Sources | Digital |
|---|---:|---:|---:|---:|---:|---|---|---|---|
| Shuha Saika | 52.62 | +1.50 | 54.12 | 74.45 | 75.12 | moderate | Two qualitative reviews specifically praise the mapo tofu for Sichuan-style peppercorn heat, well-judged seasoning, and strong flavor rather than heat alone.; Multiple diners describe the food as consistently enjoyable across different dishes, including vegetables, fried rice, spring rolls, dumplings, and other Sichuan-style items. | local_review_platform, other | none |
| Ebi to Wine Lino | 62.12 | +0.42 | 62.54 | 78.17 | 78.36 | sparse | A December 2024 diner reported that the shrimp dishes were notably varied, consistently plump, and satisfying, with good compatibility with the wine selection.; The restaurant states that it conducts monthly tastings to find new wines and introduces them as rotating selections, indicating an ongoing food-and-wine pairing focus. | local_review_platform, official_restaurant | none |
| Asakusa Kōchan | 55.12 | +0.25 | 55.37 | 75.20 | 75.31 | sparse | A diner reported that the meat soba noodles were boiled to an appropriate firmness and eaten pleasantly.; A diner reported that the pork topping had seasoning, noticeable sweetness from the pork fat, and a fairly generous quantity. | other | none |
| Sushi Yajima | 78.82 | +0.85 | 79.67 | 75.76 | 76.14 | moderate | Multiple qualitative accounts describe exceptionally loose, delicate rice shaping that breaks apart or melts readily in the mouth; this is presented as a deliberate house style rather than conventional firm shaping.; A qualitative account specifically praises the fish for a mature texture and concentrated flavor, contrasting the restaurant’s approach with serving fish immediately fresh. | editorial_publication, local_food_blog, local_review_platform, official_restaurant | none |
| Ise | 54.77 | +0.42 | 55.19 | 75.12 | 75.31 | sparse | A first-hand visit describes the幕の内弁当 as containing具だくさんの味噌汁 and multiple prepared items, including野菜炒めの中にロールキャベツ、ゆで卵の下に鮭、焼きそば; the reviewer found the concealed variety unexpectedly satisfying.; An independent qualitative review describes the ¥500 set meal as having a good selection of small dishes and being highly satisfying for its price. | local_food_blog, local_review_platform | none |
| Washoku Yokokura | 69.61 | +1.25 | 70.86 | 78.02 | 78.58 | moderate | A detailed diner account describes labor-intensive preparation and precise cooking across multiple dishes: octopus was cleaned, blanched, and seasoned through several steps; the fried octopus retained a soft yet springy texture; sashimi received preparations including liver dressing, tataki, and kelp curing.; The review identifies specific seasonal and specialty ingredients, including Sajima octopus, Seikogani, Kuroge wagyu, Shōgoin turnip, conger eel, shrimp, ginkgo nuts, and seasonal sashimi, suggesting a menu built around varied seasonal produce and seafood. | local_food_blog, local_review_platform | none |
| Tramont: People, Wine, and the Table | 67.34 | +1.15 | 68.49 | 75.60 | 76.11 | moderate | Multiple diners specifically described the food as delicious across varied dishes, including carpaccio, risotto, pasta, braised beef, roast duck, trippa, and sweetbreads.; A diner described the dishes as carefully prepared and visually considered, noting that the plating was tailored to each dish. | local_review_platform, map_review_platform | independent_website |
| Sushi Aki Takase | 54.15 | +1.35 | 55.50 | 76.21 | 76.81 | moderate | A reviewer described the sushi as especially excellent and the other dishes as consistently delicious, citing a meal of four appetizers, eight recommended sushi pieces, and soup.; A sushi-focused reviewer specifically praised the fish as fresh and said both the sashimi and nigiri were satisfying. | local_review_platform | none |
| Yakiniku Kappo Note | 97.04 | +0.90 | 97.94 | 75.77 | 76.18 | moderate | Multiple recent diners describe the wagyu being served through sashimi, simmered, and grilled preparations, with particularly precise cooking and seasoning.; Reviews characterize the meal as more than conventional yakiniku, emphasizing Japanese-cuisine delicacy, seasonal elements, and carefully prepared meat and accompanying dishes. | local_review_platform, map_review_platform | independent_website |
| Sushi Shinpa | 79.24 | +0.85 | 80.09 | 78.55 | 78.93 | moderate | The restaurant describes item-specific Edomae preparation, including brushing nigiri with nikiri and using tsume for boiled octopus and conger eel so the sushi can be eaten without additional dipping sauce.; A local Chiyoda-area report states that the chef personally purchases fish each morning, selects seasonal and relatively rare fish, and emphasizes preparations intended to draw out the strengths of each ingredient; it specifically mentions large kuruma shrimp sushi and house-prepared sweet tare and kanpyo. | local_review_platform, newspaper_or_magazine, official_restaurant | independent_website |
| Uofuji | 64.16 | +0.85 | 65.01 | 77.97 | 78.35 | moderate | Multiple qualitative reviews describe the restaurant’s fish-centered cooking positively, including fresh seafood, carefully prepared fish dishes, and satisfying sashimi and cooked preparations.; Reviews specifically praise labor-intensive fish preparations, with one reviewer calling the house bōzushi exceptional and another highlighting sashimi, simmered dishes, fried items, and soup as well-executed. | local_food_blog, local_review_platform | none |
| Sushi Dokoro Ikeda | 65.71 | +1.09 | 66.80 | 75.42 | 75.91 | moderate | A 2026 visit describes the beef-tongue tsukune as distinctly charred on the outside with a firm, flavor-releasing chew, and the eel shirayaki as freshly grilled, lightly aromatic, and fluffy.; A 2025 visit describes the tai-kabuto-yaki as carefully grilled, with an especially well-judged cooking level, substantial edible meat, and concentrated flavor throughout the fish head. | local_food_blog | none |
| Pappusan | 63.09 | +0.68 | 63.77 | 75.59 | 75.89 | moderate | The restaurant’s cold-noodle offerings use identifiable preparation techniques: bibim-naengmyeon combines buckwheat-forward noodles with yangnyeom, while the mul-naengmyeon broth is frozen into a sherbet-like texture to keep it cold without dilution.; The sundubu-jjigae broth is described as seafood-based, using clams, squid, and shrimp, and is characterized as savory and suitable with rice. | local_food_blog, local_review_platform | none |
| Sendaiya | 73.70 | +0.90 | 74.60 | 77.93 | 78.33 | moderate | Multiple Google Maps reviews describe the offal as fresh and specifically praise the careful preparation of the liver and other motsu.; Recent qualitative reviews praise the skewers for consistently precise grilling, tender texture, and a particularly strong tare; shiro and kashira are singled out as recommended choices. | map_review_platform | none |
| ¡ÁNIMO! Waseda | 73.89 | +1.10 | 74.99 | 78.95 | 79.44 | moderate | The tortilla española is repeatedly singled out as a favorite or standout dish: one reviewer describes its execution as overwhelmingly strong, while another says they order it almost every visit.; A recent Tabelog reviewer states that all sampled dishes were delicious and specifically praises the potato salad and bean stew, while describing the omelet as exceptionally well executed. | local_food_blog, local_review_platform, official_restaurant | independent_website |

## Experimental score 80+

| Restaurant | Base Q | Adj. | Final Q | v3 | v4 | Evidence | Reasons | Sources | Digital |
|---|---:|---:|---:|---:|---:|---|---|---|---|
| Natowa | 81.70 | +1.75 | 83.45 | 79.72 | 80.51 | moderate | A local food blog describes the chicken confit as tender enough to fall apart under the knife while retaining a crisp exterior.; A high-volume Tabelog reviewer separately describes the bone-in chicken thigh confit as juicy, appropriately tender, and substantial, with roasted vegetables and mustard sauce. | local_food_blog, local_review_platform | independent_website |
| Hinata-ya | 73.11 | +1.02 | 74.13 | 80.77 | 81.23 | moderate | Multiple diners specifically praised the seasonal vegetable tempura and other prepared dishes, describing the food as carefully prepared and flavorful.; Reviews repeatedly describe the sashimi and seafood dishes positively, including fatty sardine, sashimi assortments, and seafood-centered meals. | local_review_platform, reservation_platform | none |
| Suehiro Sushi | 95.44 | +0.55 | 95.99 | 84.88 | 85.13 | moderate | A diner specifically praised the tokujō chirashi: abundant toppings—including toro, shrimp, kazunoko, ikura, scallop, and egg—with sushi rice that complemented the toppings; the reviewer described it as an especially successful recent chirashi.; A diner reported that seasonal Japanese dishes, including sashimi, grilled items, simmered items, and tempura, were carefully prepared; the tempura was described as crisp with the ingredients' flavors coming through. | local_review_platform | none |
| Kawacho | 63.89 | +0.85 | 64.74 | 80.28 | 80.66 | moderate | 2024年の訪問記では、豚肉を串にぐるぐる巻きにした名物「豚ねじり」を「旨い」と評価し、豚巻き串のジューシーさにも言及している。; 別の訪問記でも、豚バラをねじって串打ちした「豚ねじり」を店のおすすめとして挙げ、実食して「旨い」と評価している。 | local_review_platform | none |
| Petit Restaurant Nakajima | 70.20 | +0.72 | 70.92 | 83.84 | 84.16 | moderate | A recent food blog describes the Turkish rice as being served on a hot iron plate, remaining hot, and combining ketchup-fried rice with onion, green pepper, mushroom, and a substantial portion.; The same firsthand account characterizes the restaurant's Turkish rice as a hearty, hot-plate dish with a substantial serving size, reinforcing its role as a distinctive, filling specialty. | local_food_blog | none |
| GINZA Koike | 82.74 | +0.60 | 83.34 | 81.63 | 81.90 | sparse | A recent diner described the sushi as using noticeably larger, thicker fish cuts than highly refined Ginza-style sushi, producing more pronounced mouthfeel and flavor.; A diner characterized the chef as highly knowledgeable about fish and said the restaurant served some of the best sushi available. | local_food_blog | independent_website |
| Suzume no Oyado | 95.18 | +0.90 | 96.08 | 81.11 | 81.51 | moderate | カマンベールもんじゃは、チーズを塊のまま鉄板で加え、もちもちした食感と濃厚なチーズの旨味が特徴と報告されている。; 最近の利用者レビューでも、カマンベールを丸ごと使う創作もんじゃを「濃厚でクセになる美味しさ」と評価している。 | local_food_blog, local_review_platform | independent_website |
| Mira Food | 68.16 | +0.42 | 68.58 | 82.00 | 82.19 | sparse | A 2024 diner described the chicken samosa’s wrapper as soft and thin, similar to lightly fried bread, providing specific positive textural evidence.; A 2024 visit documented seasonal Bangladeshi pitha sweets, including narkel puli pitha, with coconut and rice-flour-based preparations described in dish-specific detail. | local_review_platform | none |
| Sushi Ryogetsu (Sushi Akira) | 100.00 | +1.80 | 100.00 | 80.14 | 80.14 | strong | A detailed tasting report praised the sushi rice for being loose yet cohesive, with a moist grain texture, noticeable rice sweetness, well-judged salt and umami, and appropriate temperature and firmness; the reviewer also noted fast, economical hand movements.; The same tasting report identified careful, fish-specific preparation across multiple pieces: measured curing of kasugo and sayori, controlled dehydration, temperature adjustments between tuna cuts, and knife work intended to preserve the desired texture of live-caught aori-ika. | editorial_publication, local_food_blog | independent_website |
| Nishiki Sushi | 73.61 | +0.60 | 74.21 | 80.10 | 80.37 | sparse | A reviewer who revisited in August 2026 stated that the sushi toppings were clearly fresh.; The same August 2026 review described the sushi as firmly shaped and resistant to falling apart when handled with chopsticks. | local_review_platform | none |
| Yakusudong Gukbap | 87.15 | +0.00 | 87.15 | 83.28 | 83.28 | sparse | No new quality evidence | none | none |
| Kera Tokyo Rooftop Lounge Bar | 96.00 | +0.68 | 96.68 | 82.61 | 82.92 | moderate | A Google review says the food is “very delicious,” while another Japanese-language review describes both the food and cooking as excellent; these are positive but brief user-review comments.; One Japanese Tabelog reviewer reports becoming strongly attached to the Ethiopian food, specifically praising the chewy texture and mild acidity of the injera as a good counterpoint to the spiced curry-style dishes, and describing the dishes as flavorful without being overly oily. | local_review_platform, map_review_platform, other | independent_website |
| Lion’s Pub Sri Lankan Restaurant & Bar | 82.11 | +0.17 | 82.28 | 80.93 | 81.01 | moderate | A local visit report described the chicken in the curry as very tender and falling apart easily.; The same report noted that the pork curry meat was somewhat tough, contrasting with the tender chicken. | local_food_blog, local_review_platform | independent_website |
| Sunao Asian Dining Sendagi | 83.26 | +0.25 | 83.51 | 80.18 | 80.29 | sparse | A September 2026 diner review said that the dishes ordered were all tasty, while describing the restaurant as a curry-focused Indian/Nepali venue. This is a single-user impression, not a recurring consensus.; The restaurant’s listings state that its tandoori-grill dishes are prepared by cooks described as having more than 10 years of experience and are carefully grilled. This establishes a claimed technique/background, but does not independently establish excellence. | local_review_platform, official_restaurant | none |
| Pahuna Asian Fusion | 70.82 | +1.32 | 72.14 | 80.30 | 80.89 | moderate | A local food blog reports that the naan and curry were prepared after ordering; the naan was notably large, slightly sweet, and chewy, while the spinach curry had a thick texture, initial mellowness, and a later spicy finish.; The spinach curry was described as rich and savory, with ingredients incorporated into the sauce; the reviewer specifically found it paired especially well with the chewy naan. | local_food_blog, local_review_platform | none |

## Lowest-digital-footprint manual inspection

| Restaurant | Base Q | Adj. | Final Q | v3 | v4 | Evidence | Reasons | Sources | Digital |
|---|---:|---:|---:|---:|---:|---|---|---|---|
| Asakusa Tantantei | 42.48 | +1.15 | 43.63 | 67.16 | 67.67 | moderate | A recent diner described the tantanmen as having a rich, aromatic sesame broth, moderate heat, good noodle-to-soup adhesion, and textural contrast from minced meat and nuts.; A separate review described a sesame-rich, relatively thick broth, flavorful minced-meat topping, fine noodles, and a lingering but enjoyable level-3 heat. | local_food_blog, local_review_platform, map_review_platform | none |
| Devi Fusion Dining Bar | 52.59 | +0.60 | 53.19 | 67.17 | 67.45 | sparse | A specialist curry blogger described the Shinagawa Devi Fusion group’s North Indian curry as rich and praised its naan as notably soft, chewy, and very tasty; the post also identifies Devi Fusion as using the same menu as the related Shinagawa Devi India location.; A curry-focused food blogger reported that Devi Fusion’s chicken adaraki had a creamy texture with prominent fresh ginger, garlic, and turmeric, and that the tandoori roti was crisp outside; the writer described both as highly enjoyable. | local_food_blog | none |
| 24 see food restaurant | 53.02 | +0.00 | 53.02 | 66.07 | 66.07 | none | No new quality evidence | none | none |
| Yoshitaka | 62.28 | +0.00 | 62.28 | 67.20 | 67.20 | none | No new quality evidence | none | none |
| Taisho | 36.24 | +0.85 | 37.09 | 65.46 | 65.84 | moderate | 複数の訪問者が、ランチの握り・ちらし・まぐろ丼について「美味しい」「大満足」と述べ、価格に対する内容の良さを評価している。; ランチのちらしについて、ネタに臭みがなく、シャリの酢の効き具合も好みに合うとの具体的な評価がある。 | local_review_platform | none |
| Gentou | 44.14 | +0.31 | 44.45 | 67.46 | 67.60 | sparse | A May 2025 diner described the restaurant as serving very good fish and said the dishes showed care and were excellent.; A January 2025 diner described the food as elaborate and the menu as extensive. | local_review_platform | none |
| Padi’s Tokyo | 47.41 | +0.75 | 48.16 | 66.29 | 66.63 | moderate | A Sierra Leonean cassava-leaf-and-rice plate was described as a distinctive, spice-forward dish with strong stock-like depth; the accompanying salad was noted as fresh and balancing the plate.; The delivered fufu was reported as soft and freshly mochi-like, while the groundnut soup had a smooth texture, pronounced spiciness, seafood-like stock notes, and substantial stewed meat; the salad was described as fresh and tasty. | local_food_blog | none |
| Wakaba Sushi | 39.46 | +0.90 | 40.36 | 66.76 | 67.17 | moderate | A September 2025 diner described the sushi as fresh and highlighted the botan ebi nigiri for its translucent appearance, sticky sweetness, and crisp grilled shell.; A diner described Wakaba Sushi as offering many types of fish and characterized the sushi preparation as careful. | local_review_platform, map_review_platform | none |
| Mitaka Soba | 52.00 | +1.32 | 53.32 | 66.19 | 66.79 | moderate | A local Koto editorial reports that the shop uses Hokkaido soba flour for housemade noodles.; The shop’s soba broth is described as being made from Hidaka kombu and katsuobushi supplied by a named bonito wholesaler. | local_review_platform, map_review_platform, newspaper_or_magazine | none |
| Spice Theater msb Tamachi | 47.99 | +0.85 | 48.84 | 66.69 | 67.07 | moderate | A local Tamachi food publication describes the waterless chicken curry as concentrated with chicken umami but not overly heavy, and the pork vindaloo as having clear vinegar acidity, heat, and defined spice character.; The restaurant is described as using a South Indian-style spice-curry base, with clearly differentiated preparations including waterless chicken curry and pork vindaloo. | local_food_blog, local_review_platform, map_review_platform | none |
| Shi-chan-yaki | 45.11 | +0.25 | 45.36 | 69.78 | 69.89 | sparse | A customer report says the staff cook the okonomiyaki and other teppan dishes at the table, season them, and serve them hot.; Available customer comments describe the food as tasty, including okonomiyaki and hot teppan dishes. | local_review_platform, map_review_platform | none |
| Teppan Dining Ougi | 55.12 | +0.00 | 55.12 | 69.80 | 69.80 | none | No new quality evidence | none | none |
| Hanoi Street | 69.21 | +1.52 | 70.73 | 69.40 | 70.09 | moderate | 牛肉フォーは透き通ったスープながら牛の旨味があり、麺にはつるっとした喉越しとほどよい弾力があるという実食報告がある。; フォーのスープは透き通っていて、そのまま飲み進められる味わいと報告され、酢やナンプラーなどの調味料による味変も好意的に紹介されている。 | local_food_blog, local_review_platform, map_review_platform, other | none |
| Kakaya | 43.35 | +0.88 | 44.23 | 68.35 | 68.74 | moderate | A long-term diner described both the monjayaki and okonomiyaki as above standard, indicating positive dish-level assessment of the restaurant’s core specialties.; The winter-only stew is specifically praised by a repeat diner, who reports that a family member regularly finishes an entire serving. | local_review_platform | none |
| Hashigo | 41.91 | +0.36 | 42.27 | 69.76 | 69.93 | moderate | Multiple independent Tabelog reviews describe the ramen as the venue’s strongest offering, including comments that it is "quite excellent," "substantially outstanding" for a ramen shop, or a dish the reviewer especially prefers.; A local ramen feature characterizes Hashigo’s shoyu ramen as a carefully balanced bowl, specifically praising clear, layered broth, restrained soy aroma, thin noodles that carry the soup, and tender handmade-style chashu. | local_food_blog, local_review_platform | none |
