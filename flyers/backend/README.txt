DEV ONLY — SECURE AI BACKGROUND GENERATION

1) Create an OpenAI API project/key with a spending limit. Usage is billed separately from ChatGPT.
2) Install Wrangler CLI locally (Node required): npm install -g wrangler
3) In flyers/backend: wrangler login ; wrangler deploy
4) Set BOTH Worker secrets (never in GitHub files):
   wrangler secret put OPENAI_API_KEY
   wrangler secret put FLYERS_ACCESS_CODE
5) In flyers/config.js set endpoint to the deployed HTTPS Worker URL, excluding /generate.
6) Open the DEV flyers page, enter your private access code and click GENERATE AI ARTWORK.

NOTE: The frontend only sends {style, variation} to the Worker, never the photo or event text.
API-generated artwork is overlaid with the photo and exact text locally, so photo subject preservation depends on your original PNG/cutout.
This is a private test ONLY. A code shared between users is not robust public authentication. Before making public, add Cloudflare Access or another login system, server-side quotas / rate limits, and abuse prevention. Consider restrictions on provider errors and usage charges.
The Worker ALLOWED_ORIGIN defaults to https://anyjiujitsu.github.io. Adjust if deploying to a different host.
Do not put the Worker secret or OPENAI_API_KEY in flyers/config.js or in a public repository.
