# x-backup

Back up your tweets to a beautiful, searchable HTML archive.

Export your X/Twitter data, and generate a single-page HTML archive of all of your tweets. Searchable, filterable, beautiful.

## Usage

1. [Request your Twitter/X data export](https://x.com/settings/download_your_data)
2. Once you receive it, extract the archive
3. Run x-backup:

```bash
npx x-backup <path-to-twitter-export>
```

This creates an `x-backup/` directory containing:
- `index.html` - Your complete tweet archive
- `data.yaml` - Structured data export of all tweets
- `images/` - All your tweet images

Open `index.html` in any browser to view your archive.

### Options

```bash
x-backup <path> -o <output-dir>       # Custom output directory
x-backup <path> -s 2024-01-01         # Only include tweets since a date
x-backup <path> --since 2024-06-15    # Same, long form
```

## Features

- **Search** - Full-text search with stemming support (matches "running" when searching "run")
- **Type filtering** - Filter by Posts, Replies, or Retweets via tabs
- **Likes filtering** - Filter by minimum number of likes
- **Sorting** - Sort tweets by date or popularity
- **Date filtering** - Include only tweets since a given date (`--since`)
- **Lazy loading** - Images load as you scroll for fast initial load
- **Links to originals** - Each tweet links back to the original on X.com
- **YAML export** - Structured `data.yaml` with all tweet metadata
- **Offline** - Works completely offline, no external dependencies
- **Self-contained** - Single HTML file with embedded styles and scripts
- **Zero dependencies** - Uses only Node.js built-in modules

## Development

Clone the repo and run:

```bash
git clone https://github.com/sergeyk/x-backup.git
cd x-backup
npm start -- <path-to-twitter-export>
```

To test with the included sample export:

```bash
npm test
```

## Developing a "tweet like me" skill:

Here's a prompt you can use with Claude Code:

> Look at my tweets in x-backup/data.yaml, and write a tweet-like-me skill that should be used when asked to write a tweet or x post as me. the skill should explain the writing style, humor, use of formatting and emojis, etc, such that a tweet drafted by invoking the skill is INDISTINGUISHABLE from a tweet actually written by me. pay attention to the number of likes and replies as you analyze the tweets, and try to understand what makes one of my tweets more likely to be engaged with than another.
