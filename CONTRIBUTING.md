# Contributing to CiteDocs

> 🇹🇷 **Kısaca:** Hata bildirimi, öneri, çeviri ve kod katkılarına açığız. Bir issue açın veya `main`'den dal açıp PR gönderin. PR'dan önce `pnpm lint`, `pnpm typecheck` ve `pnpm test` çalıştırın. Asla `.env` veya gerçek anahtar commit'lemeyin. Mobil cihazlardaki deneyimlerinizi (cihaz + tarayıcı) issue olarak paylaşmanız çok değerli.

Thanks for helping! Bug reports, feature ideas, translations and code are all welcome.

## Reporting issues
- Open a [GitHub issue](https://github.com/zedraxa/citedocs/issues) with steps to reproduce, expected vs. actual behaviour, and your **device + browser**.
- Mobile/tablet reports are especially valuable right now.
- Report security problems privately to the maintainer (GitHub: @zedraxa) instead of opening a public issue.

## Development workflow
1. Fork and create a branch from `main` (e.g. `fix/style-refresh`).
2. Set up locally (see [README → Development and tests](README.md#development-and-tests)).
3. Before opening a PR, run:
   ```bash
   pnpm lint && pnpm typecheck && pnpm build && pnpm test
   ```
4. Keep PRs focused, describe *why*, and add tests for behaviour changes.
5. Never commit `.env` files, credentials or real keys. Use `.env.example` for new variables, with placeholder values only.

## License
By contributing, you agree that your contributions are licensed under the [AGPL-3.0](LICENSE).
