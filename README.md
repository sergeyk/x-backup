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
- `images/` - All your tweet images

Open `index.html` in any browser to view your archive.

### Options

```bash
x-backup <path> -o <output-dir>   # Custom output directory
```

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

## Features

- **Search** - Find tweets with stemming support (matches "running" when searching "run")
- **Date filtering** - Filter tweets by date range
- **Lazy loading** - Images load as you scroll for fast initial load
- **Offline** - Works completely offline, no external dependencies
- **Self-contained** - Single HTML file with embedded styles and scripts
