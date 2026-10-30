DEV ONLY — AI BACKGROUND GENERATION (NO VISITOR ACCESS CODE)

The flyer page does not ask users for a code or an API key. A real AI image still requires an OpenAI API key stored privately in Cloudflare Worker settings; ChatGPT subscription access does not include this API usage.

SETUP
1) Create an OpenAI API project/key with a low spending cap. API calls are billed separately.
2) Install Wrangler (Node required): npm install -g wrangler
3) In flyers/backend, run: wrangler login && wrangler deploy
4) Add the secret to the Worker: wrangler secret put OPENAI_API_KEY
5) Copy the deployed HTTPS Worker URL into flyers/config.js as endpoint (without /generate).
6) Open the DEV /flyers/ page and click GENERATE AI ARTWORK. No visitor code is needed.

SECURITY IMPORTANT
With no login/access code, anyone who discovers the Worker URL can cause billable image generation. Origin/CORS checks are NOT authentication and can be bypassed outside a browser. Do not expose this Worker for public use without real server-side protections (authentication, per-user/IP quotas, and rate limits). Keep a restrictive API spend cap and disable the Worker when you are finished testing. Do not put OPENAI_API_KEY in any public GitHub file or flyers/config.js.

The frontend sends only style and variation to the Worker, never your photo or event text. Art and exact text are composited locally. The Worker ALLOWED_ORIGIN defaults to https://anyjiujitsu.github.io; change if using another origin.
