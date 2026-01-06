# xhost: back up your tweets

We're making a Python or Node utility (your pick), which we will publish to NPM/PyPI, that will take your Twitter data export and generate a beautiful, searchable, filterable HTML archive of all of your tweets.

It should be run like this:

```
xhost <path-to-twitter-data-export>
```

This outputs `xhost/` with `index.html` and `images/` in it. `index.html` is a self-contained HTML file with all of your tweets. It's searchable via a search box on top (stemming, etc). It's filterable by date range (slider with two handles). Images lazy load so it's not too long to load initially (and perhaps there are other tricks to use, too, like templates). The tweets should look good.

You can practice with a sample Twitter data export in `sample_export/`
