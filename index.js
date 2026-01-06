#!/usr/bin/env node

/**
 * x-backup: Back up your tweets to a beautiful, searchable HTML archive.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function parseTweetsJs(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");

  // Create a context with window.YTD structure
  const context = {
    window: { YTD: { tweets: {} } },
  };
  vm.createContext(context);
  vm.runInContext(content, context);

  // Extract tweets from the parsed data
  const parts = Object.values(context.window.YTD.tweets);
  const tweets = [];
  for (const part of parts) {
    for (const item of part) {
      if (item.tweet) {
        tweets.push(item.tweet);
      }
    }
  }
  return tweets;
}

function parseTweetDate(dateStr) {
  // Parse Twitter's date format: 'Mon Aug 06 00:51:29 +0000 2018'
  return new Date(dateStr);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatTweetText(tweet) {
  let text = tweet.full_text || "";
  const entities = tweet.entities || {};

  // Collect all entities with their indices
  const replacements = [];

  // User mentions
  for (const mention of entities.user_mentions || []) {
    const start = parseInt(mention.indices[0]);
    const end = parseInt(mention.indices[1]);
    const screenName = mention.screen_name;
    const replacement = `<a href="https://twitter.com/${screenName}" target="_blank" rel="noopener" class="mention">@${screenName}</a>`;
    replacements.push({ start, end, replacement });
  }

  // URLs (but not media URLs which we handle separately)
  const mediaUrls = new Set();
  for (const media of entities.media || []) {
    if (media.url) mediaUrls.add(media.url);
  }

  for (const urlEntity of entities.urls || []) {
    const start = parseInt(urlEntity.indices[0]);
    const end = parseInt(urlEntity.indices[1]);
    const expandedUrl = urlEntity.expanded_url || urlEntity.url || "";
    const displayUrl = urlEntity.display_url || expandedUrl;
    const replacement = `<a href="${escapeHtml(expandedUrl)}" target="_blank" rel="noopener" class="link">${escapeHtml(displayUrl)}</a>`;
    replacements.push({ start, end, replacement });
  }

  // Hashtags
  for (const hashtag of entities.hashtags || []) {
    const start = parseInt(hashtag.indices[0]);
    const end = parseInt(hashtag.indices[1]);
    const tag = hashtag.text;
    const replacement = `<a href="https://twitter.com/hashtag/${tag}" target="_blank" rel="noopener" class="hashtag">#${tag}</a>`;
    replacements.push({ start, end, replacement });
  }

  // Remove media URLs from text (we display images separately)
  for (const media of entities.media || []) {
    const start = parseInt(media.indices[0]);
    const end = parseInt(media.indices[1]);
    replacements.push({ start, end, replacement: "" });
  }

  // Sort by start index in reverse order to replace from end to start
  replacements.sort((a, b) => b.start - a.start);

  // Apply replacements
  for (const { start, end, replacement } of replacements) {
    text = text.slice(0, start) + replacement + text.slice(end);
  }

  // Convert newlines to <br>
  text = text.replace(/\n/g, "<br>");

  return text;
}

function getTweetType(tweet) {
  const fullText = tweet.full_text || "";

  // Check for retweet
  if (fullText.startsWith("RT @") || tweet.retweeted_status) {
    return "retweet";
  }

  // Check for reply
  if (tweet.in_reply_to_status_id_str || tweet.in_reply_to_user_id_str) {
    return "reply";
  }

  return "post";
}

function getMediaFiles(tweet, mediaDir) {
  const mediaFiles = [];
  const tweetId = tweet.id_str || tweet.id || "";

  if (!mediaDir || !fs.existsSync(mediaDir)) {
    return mediaFiles;
  }

  // Find all files for this tweet
  const files = fs.readdirSync(mediaDir);
  const tweetFiles = files.filter((f) => f.startsWith(`${tweetId}-`)).sort();

  for (const file of tweetFiles) {
    mediaFiles.push({
      path: `images/${file}`,
      type: "photo",
      alt: `Media from tweet ${tweetId}`,
    });
  }

  return mediaFiles;
}

function generateHtml(tweets, mediaDir) {
  // Sort tweets by date (newest first)
  const tweetsWithDates = [];
  for (const tweet of tweets) {
    try {
      const dt = parseTweetDate(tweet.created_at);
      if (!isNaN(dt.getTime())) {
        tweetsWithDates.push({ date: dt, tweet });
      }
    } catch {
      continue;
    }
  }

  tweetsWithDates.sort((a, b) => b.date.getTime() - a.date.getTime());

  if (tweetsWithDates.length === 0) {
    return "<html><body><p>No tweets found.</p></body></html>";
  }

  // Get date range
  const minDate = tweetsWithDates[tweetsWithDates.length - 1].date;
  const maxDate = tweetsWithDates[0].date;

  // Build tweets HTML and search index
  const tweetsHtml = [];
  const searchIndex = [];
  const typeCounts = { post: 0, reply: 0, retweet: 0 };
  let maxLikes = 0;

  for (const { date: dt, tweet } of tweetsWithDates) {
    const tweetId = tweet.id_str || tweet.id || "";
    const fullText = tweet.full_text || "";
    const formattedText = formatTweetText(tweet);
    const tweetType = getTweetType(tweet);
    typeCounts[tweetType]++;

    // Get media
    const mediaFiles = getMediaFiles(tweet, mediaDir);
    let mediaHtml = "";
    if (mediaFiles.length > 0) {
      const mediaItems = mediaFiles.map(
        (m) => `<img loading="lazy" src="${escapeHtml(m.path)}" alt="${escapeHtml(m.alt)}" class="tweet-media">`,
      );
      mediaHtml = `<div class="tweet-media-container">${mediaItems.join("")}</div>`;
    }

    // Format date for display
    const dateDisplay = dt.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const timestamp = dt.getTime();

    // Stats
    const likes = parseInt(tweet.favorite_count) || 0;
    const retweets = parseInt(tweet.retweet_count) || 0;
    if (likes > maxLikes) maxLikes = likes;

    const tweetHtml = `
        <article class="tweet" data-timestamp="${timestamp}" data-id="${tweetId}" data-type="${tweetType}" data-likes="${likes}">
            <div class="tweet-content">${formattedText}</div>
            ${mediaHtml}
            <div class="tweet-footer">
                <time datetime="${dt.toISOString()}">${dateDisplay}</time>
                <div class="tweet-stats">
                    <span class="stat" title="Retweets">🔁 ${retweets}</span>
                    <span class="stat" title="Likes">❤️ ${likes}</span>
                </div>
                <a href="https://twitter.com/i/status/${tweetId}" target="_blank" rel="noopener" class="tweet-link">View on X</a>
            </div>
        </article>`;

    tweetsHtml.push(tweetHtml);

    // Add to search index (plain text for searching)
    const plainText = fullText.replace(/<[^>]+>/g, "").toLowerCase();
    searchIndex.push({
      id: tweetId,
      text: plainText,
      timestamp: timestamp,
      type: tweetType,
    });
  }

  const formatDate = (d) => d.toISOString().split("T")[0];

  // Generate the full HTML
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tweet Archive</title>
    <style>
        :root {
            --bg-color: #15202b;
            --card-bg: #192734;
            --text-color: #ffffff;
            --text-secondary: #8899a6;
            --accent-color: #1da1f2;
            --border-color: #38444d;
            --hover-bg: #22303c;
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            background-color: var(--bg-color);
            color: var(--text-color);
            line-height: 1.5;
            min-height: 100vh;
        }

        .container {
            max-width: 600px;
            margin: 0 auto;
            padding: 0 16px;
        }

        header {
            padding: 16px 0;
        }

        .sticky-top {
            position: sticky;
            top: 0;
            background: var(--bg-color);
            padding-bottom: 12px;
            z-index: 100;
        }

        h1 {
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .controls {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding-top: 12px;
        }

        .search-box {
            position: relative;
        }

        .search-box input {
            width: 100%;
            padding: 12px 16px 12px 44px;
            border: 1px solid var(--border-color);
            border-radius: 9999px;
            background: var(--card-bg);
            color: var(--text-color);
            font-size: 15px;
            outline: none;
            transition: border-color 0.2s;
        }

        .search-box input:focus {
            border-color: var(--accent-color);
        }

        .search-box::before {
            content: "🔍";
            position: absolute;
            left: 16px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 16px;
        }

        .date-filter {
            background: var(--card-bg);
            border-radius: 12px;
            padding: 12px 16px;
        }

        .date-filter label {
            display: block;
            font-size: 13px;
            color: var(--text-secondary);
            margin-bottom: 8px;
        }

        .date-range {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .date-range input[type="date"] {
            flex: 1;
            padding: 8px 12px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            background: var(--bg-color);
            color: var(--text-color);
            font-size: 14px;
        }

        .date-range span {
            color: var(--text-secondary);
        }

        .filters-row {
            display: flex;
            gap: 12px;
            align-items: stretch;
        }

        .filter-group {
            flex: 1;
            background: var(--card-bg);
            border-radius: 12px;
            padding: 12px 16px;
        }

        .filter-group label {
            display: block;
            font-size: 13px;
            color: var(--text-secondary);
            margin-bottom: 8px;
        }

        .sort-select {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            background: var(--bg-color);
            color: var(--text-color);
            font-size: 14px;
            cursor: pointer;
        }

        .likes-filter {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .likes-filter input[type="range"] {
            flex: 1;
            height: 4px;
            -webkit-appearance: none;
            appearance: none;
            background: var(--border-color);
            border-radius: 2px;
            outline: none;
        }

        .likes-filter input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            background: var(--accent-color);
            border-radius: 50%;
            cursor: pointer;
        }

        .likes-filter input[type="range"]::-moz-range-thumb {
            width: 16px;
            height: 16px;
            background: var(--accent-color);
            border-radius: 50%;
            cursor: pointer;
            border: none;
        }

        .likes-value {
            min-width: 40px;
            text-align: right;
            font-size: 14px;
            color: var(--text-color);
        }

        .tabs {
            display: flex;
            gap: 0;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 12px;
        }

        .tab {
            flex: 1;
            padding: 12px 16px;
            background: none;
            border: none;
            color: var(--text-secondary);
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            position: relative;
            transition: color 0.2s;
        }

        .tab:hover {
            color: var(--text-color);
        }

        .tab.active {
            color: var(--accent-color);
        }

        .tab.active::after {
            content: "";
            position: absolute;
            bottom: -1px;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--accent-color);
            border-radius: 3px 3px 0 0;
        }

        .tab-count {
            color: var(--text-secondary);
            font-weight: 400;
        }

        .tweets {
            padding: 16px 0;
        }

        .tweet {
            background: var(--card-bg);
            border-radius: 16px;
            padding: 16px;
            margin-bottom: 12px;
            border: 1px solid var(--border-color);
            transition: background-color 0.2s;
        }

        .tweet:hover {
            background: var(--hover-bg);
        }

        .tweet.hidden {
            display: none;
        }

        .tweet-content {
            font-size: 15px;
            word-wrap: break-word;
            margin-bottom: 12px;
        }

        .tweet-content a {
            color: var(--accent-color);
            text-decoration: none;
        }

        .tweet-content a:hover {
            text-decoration: underline;
        }

        .tweet-media-container {
            display: grid;
            gap: 4px;
            margin-bottom: 12px;
            border-radius: 16px;
            overflow: hidden;
        }

        .tweet-media-container:has(img:nth-child(2)) {
            grid-template-columns: 1fr 1fr;
        }

        .tweet-media {
            width: 100%;
            height: auto;
            max-height: 500px;
            object-fit: cover;
            background: var(--border-color);
        }

        .tweet-footer {
            display: flex;
            align-items: center;
            gap: 16px;
            font-size: 13px;
            color: var(--text-secondary);
        }

        .tweet-footer time {
            flex-shrink: 0;
        }

        .tweet-stats {
            display: flex;
            gap: 12px;
        }

        .tweet-stats .stat {
            display: flex;
            align-items: center;
            gap: 4px;
        }

        .tweet-link {
            margin-left: auto;
            color: var(--accent-color);
            text-decoration: none;
            font-size: 13px;
        }

        .tweet-link:hover {
            text-decoration: underline;
        }

        .no-results {
            text-align: center;
            padding: 48px 16px;
            color: var(--text-secondary);
        }

        .no-results.hidden {
            display: none;
        }

        @media (max-width: 600px) {
            .container {
                padding: 0 8px;
            }

            .tweet {
                border-radius: 0;
                margin-bottom: 1px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <div class="sticky-top">
                <h1>📦 Tweet Archive</h1>
                <div class="search-box">
                    <input type="text" id="search" placeholder="Search tweets..." autocomplete="off">
                </div>
            </div>
            <div class="controls">
                <div class="date-filter">
                    <label>Filter by date</label>
                    <div class="date-range">
                        <input type="date" id="date-from" value="${formatDate(minDate)}">
                        <span>to</span>
                        <input type="date" id="date-to" value="${formatDate(maxDate)}">
                    </div>
                </div>
                <div class="filters-row">
                    <div class="filter-group">
                        <label>Sort by</label>
                        <select id="sort-by" class="sort-select">
                            <option value="date">Date (newest)</option>
                            <option value="likes">Likes (most)</option>
                        </select>
                    </div>
                    <div class="filter-group">
                        <label>Min likes</label>
                        <div class="likes-filter">
                            <input type="range" id="min-likes" min="0" max="${maxLikes}" value="0">
                            <span class="likes-value" id="min-likes-value">0</span>
                        </div>
                    </div>
                </div>
                <div class="tabs">
                    <button class="tab active" data-type="post">Posts <span class="tab-count">${typeCounts.post}</span></button>
                    <button class="tab" data-type="reply">Replies <span class="tab-count">${typeCounts.reply}</span></button>
                    <button class="tab" data-type="retweet">Retweets <span class="tab-count">${typeCounts.retweet}</span></button>
                </div>
            </div>
        </header>

        <main class="tweets">
            ${tweetsHtml.join("")}
            <div class="no-results hidden" id="no-results">No tweets match your search.</div>
        </main>
    </div>

    <script>
        // Search index
        const searchIndex = ${JSON.stringify(searchIndex)};

        // Simple stemmer for basic word matching
        function stem(word) {
            word = word.toLowerCase().replace(/[^a-z0-9]/g, '');
            // Basic suffix removal
            if (word.endsWith('ing')) word = word.slice(0, -3);
            else if (word.endsWith('ed')) word = word.slice(0, -2);
            else if (word.endsWith('es')) word = word.slice(0, -2);
            else if (word.endsWith('s') && !word.endsWith('ss')) word = word.slice(0, -1);
            else if (word.endsWith('ly')) word = word.slice(0, -2);
            return word;
        }

        function tokenize(text) {
            return text.toLowerCase()
                .split(/\\s+/)
                .map(stem)
                .filter(w => w.length > 0);
        }

        // Filter functionality
        const searchInput = document.getElementById('search');
        const dateFrom = document.getElementById('date-from');
        const dateTo = document.getElementById('date-to');
        const sortBy = document.getElementById('sort-by');
        const minLikesSlider = document.getElementById('min-likes');
        const minLikesValue = document.getElementById('min-likes-value');
        const noResults = document.getElementById('no-results');
        const tweetsContainer = document.querySelector('.tweets');
        const tweets = Array.from(document.querySelectorAll('.tweet'));
        const tabs = document.querySelectorAll('.tab');
        let activeType = 'post';

        function filterAndSort() {
            const query = searchInput.value.trim();
            const queryTokens = tokenize(query);
            const fromDate = dateFrom.value ? new Date(dateFrom.value).getTime() : 0;
            const toDate = dateTo.value ? new Date(dateTo.value + 'T23:59:59').getTime() : Infinity;
            const minLikes = parseInt(minLikesSlider.value) || 0;
            const sortMode = sortBy.value;

            let visibleCount = 0;

            // Filter tweets
            tweets.forEach((tweet) => {
                const timestamp = parseInt(tweet.dataset.timestamp);
                const tweetType = tweet.dataset.type;
                const likes = parseInt(tweet.dataset.likes) || 0;
                const indexEntry = searchIndex.find(s => s.id === tweet.dataset.id);

                // Type filter
                const typeMatch = tweetType === activeType;

                // Date filter
                const dateMatch = timestamp >= fromDate && timestamp <= toDate;

                // Likes filter
                const likesMatch = likes >= minLikes;

                // Search filter
                let searchMatch = true;
                if (queryTokens.length > 0 && indexEntry) {
                    const textTokens = tokenize(indexEntry.text);
                    searchMatch = queryTokens.every(qt =>
                        textTokens.some(tt => tt.includes(qt) || qt.includes(tt))
                    );
                }

                if (typeMatch && dateMatch && likesMatch && searchMatch) {
                    tweet.classList.remove('hidden');
                    visibleCount++;
                } else {
                    tweet.classList.add('hidden');
                }
            });

            // Sort tweets
            const sortedTweets = [...tweets].sort((a, b) => {
                if (sortMode === 'likes') {
                    return parseInt(b.dataset.likes) - parseInt(a.dataset.likes);
                } else {
                    return parseInt(b.dataset.timestamp) - parseInt(a.dataset.timestamp);
                }
            });

            // Reorder DOM
            sortedTweets.forEach(tweet => tweetsContainer.appendChild(tweet));

            noResults.classList.toggle('hidden', visibleCount > 0);
        }

        // Update likes value display
        minLikesSlider.addEventListener('input', () => {
            minLikesValue.textContent = minLikesSlider.value;
            filterAndSort();
        });

        // Initial filter to show only posts
        filterAndSort();

        // Tab click handlers
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                activeType = tab.dataset.type;
                filterAndSort();
            });
        });

        // Sort change handler
        sortBy.addEventListener('change', filterAndSort);

        // Debounce search input
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(filterAndSort, 150);
        });

        dateFrom.addEventListener('change', filterAndSort);
        dateTo.addEventListener('change', filterAndSort);
    </script>
</body>
</html>`;

  return html;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    console.log(`
x-backup - Generate a beautiful HTML archive from your Twitter data export

Usage: x-backup <path-to-twitter-export> [-o output-dir]

Options:
  -o, --output  Output directory (default: x-backup)
  -h, --help    Show this help message

Example:
  x-backup ~/Downloads/twitter-archive
  x-backup ~/Downloads/twitter-archive -o my-tweets
    `);
    process.exit(args.length === 0 ? 1 : 0);
  }

  let exportPath = args[0];
  let outputPath = "x-backup";

  // Parse output flag
  const outputIndex = args.findIndex((a) => a === "-o" || a === "--output");
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    outputPath = args[outputIndex + 1];
  }

  exportPath = path.resolve(exportPath);
  outputPath = path.resolve(outputPath);

  // Find tweets.js
  let tweetsFile = path.join(exportPath, "data", "tweets.js");
  if (!fs.existsSync(tweetsFile)) {
    tweetsFile = path.join(exportPath, "tweets.js");
  }

  if (!fs.existsSync(tweetsFile)) {
    console.error(`Error: Could not find tweets.js in ${exportPath}`);
    console.error("Expected at: <export>/data/tweets.js");
    process.exit(1);
  }

  // Find media directory
  let mediaDir = path.join(exportPath, "data", "tweets_media");
  if (!fs.existsSync(mediaDir)) {
    mediaDir = path.join(exportPath, "tweets_media");
  }
  if (!fs.existsSync(mediaDir)) {
    mediaDir = null;
  }

  console.log(`📖 Reading tweets from ${tweetsFile}`);
  const tweets = parseTweetsJs(tweetsFile);
  console.log(`📊 Found ${tweets.length} tweets`);

  // Create output directory
  fs.mkdirSync(outputPath, { recursive: true });
  const imagesPath = path.join(outputPath, "images");
  fs.mkdirSync(imagesPath, { recursive: true });

  // Copy media files
  if (mediaDir) {
    const mediaFiles = fs.readdirSync(mediaDir);
    console.log(`🖼️  Copying ${mediaFiles.length} media files...`);
    for (const file of mediaFiles) {
      const srcPath = path.join(mediaDir, file);
      if (fs.statSync(srcPath).isFile()) {
        fs.copyFileSync(srcPath, path.join(imagesPath, file));
      }
    }
  }

  // Generate HTML
  console.log("🔨 Generating HTML archive...");
  const html = generateHtml(tweets, mediaDir || "");

  // Write HTML file
  const htmlFile = path.join(outputPath, "index.html");
  fs.writeFileSync(htmlFile, html, "utf-8");

  console.log(`✅ Archive created at ${outputPath}`);
  console.log(`   Open ${htmlFile} in your browser to view`);
}

main();
