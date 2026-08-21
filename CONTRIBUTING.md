# Adding a summary

Every article is one file: `content/articles/<id>.json`, holding all five
languages. Nothing else needs editing unless the article belongs to a new series.

## 1. Scaffold the file

```bash
npm run fetch -- https://magic.wizards.com/en/news/making-magic/<slug>
```

This fetches the essay and writes the file with:

- `id`, `slug`, `column`, `author`, `publishedAt` filled in
- `source.locales` set to the locales Wizards actually published (checked live)
- one `lessons` slot per numbered key point it found in the essay
- a `translations` block per configured language, with empty fields

It then prints the article text to stdout, which is what you write the summary
from. To read the essay without writing a file, add `--text`.

## 2. Write the summary

```jsonc
{
  "lessons": [
    { "n": 1, "color": "G" }        // language-independent: number and colour
  ],
  "translations": {
    "en": {
      "title": "…",                  // the article's title
      "dek": "…",                    // one line, shown on cards
      "overview": "…",               // 2–3 sentences: what the essay is doing
      "takeaway": "…",               // 1–2 sentences: what to remember
      "lessons": [                   // index-aligned with `lessons` above
        {
          "title": "…",              // the principle
          "rules": "…",              // how it works, ~35 words
          "flavor": "…"              // the example from the essay, ~30 words
        }
      ]
    }
  }
}
```

### What makes a good summary

- **Rules text states the principle, flavour text grounds it.** The split is the
  whole point: someone should be able to read the rules text alone and come away
  with the idea, then read the flavour text and remember it.
- **Use the author's own examples.** The Griselbrand complaint, the Trojan Horse
  rename, Fblthp. They are why the lesson sticks. Don't invent illustrations.
- **Condense; don't editorialize.** The summary carries the essay's argument, not
  a verdict on it.
- **Keep it tight.** Roughly 35 words of rules text and 30 of flavour. If a point
  needs more, it is probably two points.
- **Never paste the original.** These are summaries and always link to the source.

### Assigning a colour

Each lesson gets one of `W U B R G` — our reading of which slice of Magic's
colour pie the principle belongs to, based on **the virtue the lesson teaches**,
not the vice it warns against:

| | philosophy | example |
|---|---|---|
| **W** | order, structure, serving the group | *Design the component for its intended audience* |
| **U** | knowledge, discovery, precision | *Leave room for the player to explore* |
| **B** | self-interest, ruthless pragmatism | *Allow your players to have a sense of ownership* |
| **R** | emotion, impulse, boldness | *Be more afraid of boring your players than challenging them* |
| **G** | nature, acceptance, interconnection | *Fighting against human nature is a losing battle* |

Judgement calls are fine — the site labels this as interpretation. Being
consistent about the virtue/vice rule matters more than any individual pick.

## 3. Translate

All five languages are required; the validator fails on any empty field. Write
each language as prose in that language rather than translating word-for-word
from the English — these are short and dense, and literal translation reads badly.

Keep set and card names in English (*Time Spiral*, Griselbrand). That is what
players in every language actually call them, and it keeps the flavour text
verifiable against the original.

## 4. If it belongs to a series

Add the series to `content/site.json` (with a title and blurb per language), list
the article ids in order, and set `series` on each article:

```jsonc
"series": { "id": "twenty-years-twenty-lessons", "order": 1, "total": 3 }
```

## 5. Check and commit

```bash
npm run check     # validate, then rebuild the manifest
npm run serve     # look at it
```

Commit `content/manifest.json` along with your article — CI fails the deploy if
the committed manifest doesn't match what the content generates.
