<p align="center">
  <img src="https://raw.githubusercontent.com/kirilldodon2-ux/masquerade/main/.assets/readme%20pic.jpg" width="160" />
</p>

<h1 align="center">Masquerade Engine</h1>

<p align="center">
  <strong>A multimodal fashion-intelligence engine for real-time outfit generation, styling, and editorial narration.</strong>
</p>

---

##  What Masquerade Is

Masquerade is a lightweight fashion-intelligence system that transforms raw item collages into complete fashion visuals and atmospheric editorial descriptions.

It is built on top of:
	•	Nano Banana — Gemini 2.5 Flash–based outfit composition
	•	Borealis Editorial Engine — GPT-powered narration & fashion mood analysis
	•	Telegram Layer — conversational delivery interface
	•	Cloud Run — scalable infra with near-zero idle cost

Masquerade = AI × Fashion × Design Philosophy.
A tool for creative teams, stylists, and brands exploring next-generation fashion workflows.

---

# Brand Manifesto

### **EN**
Masquerade is a place where fashion stops being an image.  
It becomes silence, light, and movement refracted through intelligence.  
It is not a service — it is a tool for those who see more.

### **RU**
Masquerade — это место, где мода перестаёт быть фотографией.  
Она становится тишиной, светом и движением, преломлёнными через интеллект.  
Это не сервис — это инструмент для тех, кто видит больше.

### **FR**
Masquerade est un lieu où la mode cesse d’être une image.  
Elle devient silence, lumière et mouvement, filtrés par l’intelligence.  
Ce n’est pas un service — c’est un outil pour ceux qui voient plus loin.

### **RO**
Masquerade este locul în care moda încetează să fie o fotografie.  
Devine liniște, lumină și mișcare, refractate prin inteligență.  
Nu este un serviciu — este un instrument pentru cei care văd mai mult.

---

#  Architecture Overview
```
/masquerade
├── src/
│   ├── webhook/          # Telegram webhook logic 
│   ├── engines/
│   │   ├── nano-banana/  # Gemini 2.5-Flash outfit generation
│   │   └── borealis/     # GPT-based editorial narrator
│   ├── utils/
│   └── index.js
├── docker/
│   └── Dockerfile
├── .env.example
├── package.json
└── README.md
```
---

#  Deployment (Cloud Run)

Masquerade is optimized for **cheap, fast, globally-scaled** deployment.

---

### **1. Build container**

```
gcloud builds submit --tag gcr.io/<PROJECT-ID>/masquerade

2. Deploy to Cloud Run
gcloud run deploy borealis-engine \
  --image gcr.io/<PROJECT-ID>/masquerade \
  --region=europe-west1 \
  --allow-unauthenticated

3. Set Telegram Webhook
https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook?url=<CLOUD-RUN-URL>/webhook](https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook?url=<CLOUD-RUN-URL>/webhook

 Environment Variables (Secret Manager)

Key
Description
OPENAI_API_KEY
Borealis Editorial Engine
TELEGRAM_BOT_TOKEN
Bot delivery layer
VERTEX_API_KEY
Nano Banana (Gemini Image)
PROJECT_ID
Google Cloud project id

All values stored via Secret Manager (auto-mounted into Cloud Run).

```

# Roadmap (more in /docs)
	•	Language switcher /language (EN / FR / RU / RO / JP / CN)
	•	/settings panel
	•	Promo codes for free generations
	•	Web dashboard for creators
	•	Figma plugin (“Drop items → Generate outfit”)
	•	Cloudflare Worker CDN caching
	•	Paid plans with Stripe Billing
	•	Native iOS + iPadOS app for stylist workspaces

# License

Masquerade Engine — MIT License
Copyright (c) 2025 Borealis Labs (Kirill Dodon)

This project is open-source under the MIT license.
You are free to:
	•	use the code in personal and commercial projects,
	•	modify, fork, and extend the engine,
	•	deploy it for your own stylist/AI tools,
	•	build plugins, extensions, or research prototypes.

You must:
	•	keep the copyright notice,
	•	include a copy of the MIT license in any distribution,
	•	not imply endorsement by Borealis Labs.

For commercial collaborations, studio partnerships, or custom enterprise builds:
hello@dodon.one

# Credits

Built by Kirill Dodon × Borealis Studio.

---

## Contact 


<p align="center">
  <br/>
  <strong>hello@dodon.one</strong>
</p>
