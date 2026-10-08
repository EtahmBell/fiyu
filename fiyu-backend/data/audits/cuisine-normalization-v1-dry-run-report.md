# Cuisine normalization v1 dry run

Dry run only. Canonical rows mutated: **0**.

- operation: cuisine-normalize
- mode: dry_run
- taxonomy version: cuisine-taxonomy-v1
- published rows: 851
- raw distinct labels: 320
- normalized cuisines: 36
- cuisine families: 14
- mapped rows: 678
- ambiguous rows: 47
- unmapped rows: 126
- missing rows: 0
- mapped distinct labels: 194
- proposed change count: 678
- canonical mutations: 0
- external requests: 0
- canonical db sha256: 184F19B3099E67E63B0680933F0E3847EAD775EF66D93171A33D9782F71F2B90
- compatibility: coexistence_only; current primary_category and food_tags remain unchanged

## Ambiguous Labels

```json
[
  "Cafe / Japanese restaurant",
  "French-Italian restaurant",
  "Fugu and Edo-mae sushi restaurant",
  "Indian and Nepalese restaurant",
  "Indian-Nepalese restaurant",
  "Innovative French-Japanese",
  "Italian-inspired dining cafe",
  "Izakaya / yakitori / robatayaki",
  "Japanese cafeteria",
  "Japanese sweets",
  "Japanese sweets restaurant",
  "Japanese sweets shop",
  "Japanese teishoku restaurant, oden restaurant, izakaya, and coffee shop",
  "Japanese-French restaurant",
  "Sukiyaki and shabu-shabu restaurant",
  "Sushi and seafood izakaya",
  "Sweets shop and cafe",
  "Yakitori / izakaya",
  "Yakitori izakaya",
  "お好み焼き・もんじゃ焼き",
  "ふぐ・日本料理・鍋・居酒屋",
  "もんじゃ焼き・お好み焼き",
  "もんじゃ焼き・鉄板焼き",
  "ラーメン・大衆麺酒場",
  "串揚げ・串焼き居酒屋",
  "寿司酒場",
  "居酒屋・そば・うどん",
  "居酒屋・食堂",
  "焼き鳥・居酒屋",
  "焼き鳥居酒屋",
  "鉄板焼き・居酒屋"
]
```

## Unmapped Labels

```json
[
  "African restaurant and bar",
  "American bar / dining bar",
  "Art gallery",
  "Asian restaurant",
  "Bar",
  "Barbecue restaurant",
  "Burmese restaurant",
  "Cake shop",
  "California brunch restaurant",
  "Cantonese cuisine",
  "Chongqing hot pot",
  "Cuban restaurant and Latin music bar",
  "Ethiopian restaurant and rooftop lounge bar",
  "Event food vendor",
  "Fish restaurant",
  "German and Austrian restaurant",
  "Gluten-free bakery",
  "Greek yogurt specialty shop",
  "Halal food shop",
  "Halal international cuisine",
  "Halal kebab restaurant",
  "Halal wagyu restaurant",
  "Indonesian restaurant",
  "Innovative Western cuisine",
  "Japanized western restaurant",
  "Jingisukan restaurant",
  "Liquor store with standing bar",
  "Mediterranean restaurant",
  "Mexican fast food / taco truck",
  "Middle Eastern restaurant",
  "Myanmar cuisine",
  "Oden restaurant",
  "Official Super Sentai collaboration restaurant",
  "Okinawan regional restaurant",
  "Pastry shop",
  "Restaurant bus dining experience",
  "Snack bar",
  "Sri Lankan restaurant",
  "Taiwanese castella specialty shop",
  "Taiwanese restaurant",
  "Taiyaki",
  "Turkish kebab restaurant",
  "Turkish restaurant",
  "Vegan restaurant",
  "Vegetarian restaurant",
  "Wine bar",
  "Yoshoku / kissaten",
  "bar and restaurant",
  "coffee shop",
  "restaurant",
  "おでん",
  "おでん・カラオケバー",
  "おにぎり専門店",
  "たこ焼き",
  "ちゃんこ鍋",
  "にんにく料理",
  "もつ焼き",
  "もつ鍋・水炊き",
  "アジア・エスニック料理店",
  "カフェ",
  "カフェバー",
  "カフェ＆ダイニングバー",
  "カラオケバー",
  "シンガポール料理",
  "ジンギスカン",
  "スナック",
  "ダイニングバー",
  "デザートレストラン",
  "トルコ料理・ケバブ",
  "ハワイ料理",
  "ハンバーガー・ダイニングバー",
  "バングラデシュ料理・ケバブ",
  "バー＆グリル",
  "ビアバー",
  "マグロ料理専門店・創作料理",
  "ミャンマー料理",
  "ヨーロッパ料理",
  "ワインバー",
  "九州季節料理・ちゃんこ鍋",
  "割烹・小料理",
  "割烹・小料理屋",
  "創作料理",
  "屋形船",
  "沖縄料理",
  "洋食",
  "焼き芋・大学芋",
  "牛たん専門店",
  "牛タン店",
  "玉子焼き専門店・惣菜",
  "立ち飲み・日本酒バー",
  "豚しゃぶ",
  "貴州料理・中国米線",
  "野菜料理バル",
  "飲茶・点心／焼き小籠包",
  "麻辣湯専門店"
]
```

## Top Raw Labels

```json
[
  [
    "居酒屋",
    89
  ],
  [
    "Izakaya",
    43
  ],
  [
    "Sushi restaurant",
    41
  ],
  [
    "Italian restaurant",
    26
  ],
  [
    "焼肉",
    26
  ],
  [
    "寿司",
    25
  ],
  [
    "French restaurant",
    21
  ],
  [
    "Sushi",
    21
  ],
  [
    "Yakitori restaurant",
    16
  ],
  [
    "焼き鳥",
    15
  ],
  [
    "Japanese cuisine",
    14
  ],
  [
    "Chinese restaurant",
    13
  ],
  [
    "Indian restaurant",
    10
  ],
  [
    "Japanese restaurant",
    10
  ],
  [
    "韓国料理",
    8
  ],
  [
    "Ramen restaurant",
    8
  ],
  [
    "Korean restaurant",
    8
  ],
  [
    "とんかつ",
    7
  ],
  [
    "Bar",
    7
  ],
  [
    "Tempura restaurant",
    7
  ],
  [
    "焼き鳥・居酒屋",
    7
  ],
  [
    "洋食",
    6
  ],
  [
    "Nepalese restaurant",
    6
  ],
  [
    "Teppanyaki",
    6
  ],
  [
    "スナック",
    5
  ],
  [
    "食堂・定食",
    5
  ],
  [
    "Yakiniku",
    5
  ],
  [
    "Japanese cuisine / izakaya",
    5
  ],
  [
    "Okonomiyaki restaurant",
    5
  ],
  [
    "食堂",
    5
  ]
]
```

## Top Normalized Cuisines

```json
[
  [
    "izakaya",
    178
  ],
  [
    "sushi",
    93
  ],
  [
    "japanese",
    50
  ],
  [
    "yakiniku",
    43
  ],
  [
    "italian",
    37
  ],
  [
    "yakitori",
    35
  ],
  [
    "french",
    31
  ],
  [
    "chinese",
    25
  ],
  [
    "teishoku",
    17
  ],
  [
    "indian",
    16
  ],
  [
    "korean",
    16
  ],
  [
    "kaiseki",
    14
  ],
  [
    "ramen",
    13
  ],
  [
    "tempura",
    12
  ],
  [
    "nepalese",
    12
  ],
  [
    "teppanyaki",
    12
  ],
  [
    "okonomiyaki",
    10
  ],
  [
    "tonkatsu",
    9
  ],
  [
    "bistro",
    9
  ],
  [
    "soba",
    6
  ],
  [
    "cafe",
    5
  ],
  [
    "thai",
    5
  ],
  [
    "seafood",
    4
  ],
  [
    "spanish",
    4
  ],
  [
    "udon",
    3
  ],
  [
    "unagi",
    3
  ],
  [
    "japanese curry",
    2
  ],
  [
    "monjayaki",
    2
  ],
  [
    "vietnamese",
    2
  ],
  [
    "kushiyaki",
    2
  ]
]
```

## Top Cuisine Families

```json
[
  [
    "japanese",
    508
  ],
  [
    "french",
    40
  ],
  [
    "italian",
    39
  ],
  [
    "chinese",
    25
  ],
  [
    "indian",
    16
  ],
  [
    "korean",
    16
  ],
  [
    "nepalese",
    12
  ],
  [
    "cafe",
    5
  ],
  [
    "thai",
    5
  ],
  [
    "seafood",
    4
  ],
  [
    "spanish",
    4
  ],
  [
    "vietnamese",
    2
  ],
  [
    "american",
    1
  ],
  [
    "dessert",
    1
  ]
]
```

## Field Source Audit

```json
{
  "api_usage": "primary_category and food_tags are returned by catalog endpoints",
  "current_canonical": "public_restaurants.primary_category and food_tags_json",
  "product_usage": "Taste/Picks continue reading current canonical fields in E1",
  "raw": "restaurants.category and restaurants.broad_category",
  "research": "restaurant_research_runs.structured_research_json",
  "scoring_usage": "normalization output is not used by scoring"
}
```

## Fragmentation Classes

```json
[
  "case/punctuation/provider suffix variants",
  "English/Japanese synonyms",
  "specific dish categories",
  "combined labels",
  "provider noise",
  "genuinely distinct cuisines"
]
```

## Provenance and safety

All proposals derive from stored local evidence. Raw values are preserved; no external requests were made.
