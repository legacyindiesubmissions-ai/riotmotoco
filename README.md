# Riot Moto Co. static site

Static GitHub Pages launch site for `riotmotoco.com`.

## Files

- `index.html` - landing page and build request flow.
- `styles.css` - responsive industrial visual system.
- `assets/riot-frame-blueprint.svg` - hero visual.
- `CNAME` - GitHub Pages custom domain file.
- `robots.txt` and `sitemap.xml` - basic crawler metadata.

## GitHub Pages deployment

1. Create a public GitHub repo, for example `riotmotoco`.
2. Push this folder to the repo root.
3. In repo settings, enable Pages from the main branch root.
4. Keep the `CNAME` file set to `riotmotoco.com`.
5. In the domain registrar/DNS provider, point the apex domain to GitHub Pages:

```text
A 185.199.108.153
A 185.199.109.153
A 185.199.110.153
A 185.199.111.153
```

6. Add `www` as a CNAME:

```text
www CNAME legacyindiesubmissions-ai.github.io
```

## Before taking payments

- Set up a real `builds@riotmotoco.com` mailbox or change the mail links.
- Add terms, warranty, cancellation, and local-compliance language.
- Do not enable checkout until sourcing and lead-time rules are confirmed.
