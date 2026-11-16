---
title: SPHEREx Explorer API
emoji: 🔭
colorFrom: gray
colorTo: red
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Live SPHEREx cutouts from NASA/IPAC IRSA for SPHEREx Explorer
---

# SPHEREx Explorer API

FastAPI backend for SPHEREx Explorer (NASA Space Apps 2026, Planet X and SPHEREx).
It queries NASA/IPAC IRSA (SPHEREx collections `spherex_dr1` and `spherex_qr3`),
downloads small cutouts, sums them per detector and returns them to the web viewer.
Gaia DR3 sources come from VizieR.

- Health check: `/api/health`
- Frames: `/api/frames?ra=269.448503&dec=4.739420&size=200&collection=spherex_dr1&live=true`

Data: NASA/IPAC Infrared Science Archive (SPHEREx), ESA Gaia DR3.
