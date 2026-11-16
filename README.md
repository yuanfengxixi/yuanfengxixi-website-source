# Yuanfeng Xixi Website Source

Public-facing static source for [yuanfengxixi.cn](https://yuanfengxixi.cn): the company and product pages, SEO service pages, English pages, and noindex product previews.

This repository is intentionally self-contained. It does not include the private client registry, internal SEO operations, monitoring reports, unpublished drafts, deployment credentials, or customer data.

## Build

Requires Node.js 20 or newer. No npm dependencies are needed.

```sh
node build.cjs
node scripts/check-site-output.cjs
```

The build writes the static site to `dist/`. Set `SITE_ORIGIN` when generating canonical URLs for a different HTTPS host. The legacy `/guide`, `/app`, and `/legal` paths receive static fallback redirects; production deployments should also configure equivalent HTTP redirects.

The public SEO audit page calls `/api/seo/audit`; its CloudBase backend is maintained separately in [cloudbase-seo-audit](https://github.com/yuanfengxixi/cloudbase-seo-audit). The KnowKnow web-app preview calls `/api/web-app` and requires a separately configured backend and OAuth credentials. This repository contains no credentials or backend deployment configuration.

## License

Source and original site materials are released under the MIT License. Third-party service names, trademarks, and external dependencies remain under their respective terms.
