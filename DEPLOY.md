# Deploying xPaper (free)

xPaper is a static site — any static host works at $0 cost.

## Option A: GitHub Pages (recommended)

```bash
cd ~/workspace/stocklana
# create the repo (needs GitHub auth once)
gh auth login
gh repo create kdavies03/xpaper --public --source=. --push
# enable Pages: repo Settings → Pages → Deploy from branch → main, / (root)
```

Live URL will be: `https://kdavies03.github.io/xpaper/`

## Option B: Vercel

```bash
npm i -g vercel
cd ~/workspace/stocklana
vercel --prod
```

No build settings needed — it's static. Free tier, no credit card.

## Verify after deploy

1. Open the URL → "live · solana dex" badge should turn green within seconds.
2. Open `?demo=1` for the seeded sample portfolio.
3. Prices come from `https://api.dexscreener.com` (free, keyless, CORS-enabled).
