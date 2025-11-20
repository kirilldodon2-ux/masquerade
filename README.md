<p align="center">
  <img src="https://raw.githubusercontent.com/kirilldodon2-ux/masquerade/main/.assets/readme%20pic.jpg" width="160" />
</p>

<h1 align="center">Masquerade Engine</h1>

<p align="center">
  <strong>A multimodal fashion-intelligence engine built for real-time outfit generation, styling and editorial narration.</strong>
</p>

---

##  What Masquerade Is

Industry-grade try-on.
Powered by Borealis Masquerade — Fashion Intelligence Engine.

Masquerade is a lightweight, production-ready engine that transforms raw item collages into full fashion visuals and editorial descriptions.  
It powers AI outfit-builders, stylist assistants, and fashion-tech experiences.

The system combines:

-  **Nano Banana** — state-of-the-art AI outfit composition  
-  **Borealis Editorial Engine** — atmospheric fashion narration  
-  **Telegram Bot Layer** — user delivery interface  
-  **Cloud Run** — scalable infra with near-zero idle cost  

Masquerade = AI × Fashion × Design Philosophy.

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
│   │   ├── nano-banana/  # Google Vertex Gemini 2.5-Flash outfit generation
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
bash
gcloud builds submit --tag gcr.io/<PROJECT-ID>/masquerade

2. Deploy to Cloud Run
bash
gcloud run deploy borealis-engine \
  --image gcr.io/<PROJECT-ID>/masquerade \
  --region=europe-west1 \
  --allow-unauthenticated

3. Set Telegram Webhook
https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook?url=<CLOUD-RUN-URL>/webhook

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

Values stored via Secret Manager → auto-mounted into Cloud Run.

```

# Roadmap
	•	Language switcher /language (EN / FR / RU / RO / JP / CN)
	•	/settings panel
	•	Promo codes for free generations
	•	Web dashboard for creators
	•	Figma plugin (“Drop items → Generate outfit”)
	•	Cloudflare Worker CDN caching
	•	Paid plans with Stripe Billing
	•	Native iOS + iPadOS app for stylist workspaces

# License

No license.
Masquerade is a proprietary engine designed for private and commercial use.

# Credits

Built by Kirill Dodon × Borealis Studio.

---

## Contact us


<p align="center">
  <br/>
  <strong>hello@dodon.one</strong>
</p>
