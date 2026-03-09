# Thailand Fruit Guide

A field guide to 25 Thai tropical fruits — flavor profiles, seasonality, where to buy, and how to eat them.

## Live

https://thai-fruits.shellnode.lol

## Stack

- Vanilla HTML/CSS/JS (no frameworks)
- nginx:alpine container
- Ghost VPS / Docker
- SSL via SWAG + Cloudflare DNS

## Run Locally

Open `index.html` in a browser, or:

    docker build -t thai-fruits .
    docker run -p 8080:80 thai-fruits

## Deploy

    docker context use vps2
    docker build -t thai-fruits .
    docker run -d --name thai-fruits \
      --network=swag-network \
      -p 8081:80 \
      --restart unless-stopped \
      thai-fruits

## Data Sources

- Fruit data compiled in `data/fruits.json` (25 fruits with flavor, seasonality, availability data)
- Images downloaded via `fetch_images.py` (Bing/Baidu via icrawler), processed to WebP by `process_images.py`
